-- 029 Workflows: durable runs (steps, timers, waits) and cron schedules for the built-in Postgres
-- engine. The Temporal engine mirrors its runs into the same tables so admins see one Runs list.
create schema workflows;
grant usage on schema workflows to amax_app;

create table workflows.run (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  workflow text not null,
  engine text not null default 'postgres' check (engine in ('postgres', 'temporal')),
  key text,
  status text not null default 'running' check (status in ('running', 'sleeping', 'waiting', 'paused', 'completed', 'failed', 'cancelled')),
  input jsonb not null default 'null',
  output jsonb,
  error text,
  acts_for text,
  started_by text not null,
  schedule_id uuid,
  -- When a worker should next look at the run. Null while it waits for an event with no timeout,
  -- so a waiting run costs nothing: no worker claims it until a signal sets this.
  wake_at timestamptz,
  locked_until timestamptz,
  -- Fencing token from the latest claim; every worker write checks it, so a worker whose lease
  -- expired can't record anything after another worker has taken the run over.
  lease uuid,
  cost_usd numeric(14, 6) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (tenant_id, workflow, key)
);
create index run_due on workflows.run (wake_at) where status in ('running', 'sleeping', 'waiting');
create index run_recent on workflows.run (tenant_id, created_at desc);
create index run_finished on workflows.run (tenant_id, finished_at) where finished_at is not null;

create table workflows.signal (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  event text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
create index signal_event on workflows.signal (tenant_id, event, created_at);

create table workflows.step (
  run_id uuid not null references workflows.run(id) on delete cascade,
  tenant_id uuid not null references core.tenant(id),
  name text not null,
  seq int not null,
  kind text not null check (kind in ('step', 'sleep', 'wait')),
  status text not null check (status in ('done', 'failed', 'retrying', 'sleeping', 'waiting')),
  attempts int not null default 0,
  result jsonb,
  error text,
  tool_calls jsonb not null default '[]',
  cost_usd numeric(14, 6) not null default 0,
  sensitive jsonb not null default '{}',
  fire_at timestamptz,
  wait_event text,
  wait_match jsonb,
  signal_id uuid references workflows.signal(id) on delete set null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  primary key (run_id, name)
);
create index step_waiting on workflows.step (tenant_id, wait_event) where status = 'waiting';

create table workflows.schedule (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  name text not null,
  workflow text not null,
  cron text not null,
  timezone text not null,
  legal_entity_id uuid references core.legal_entity(id) on delete cascade,
  enabled boolean not null,
  next_run_at timestamptz,
  last_run_at timestamptz,
  last_run_id uuid references workflows.run(id) on delete set null,
  locked_until timestamptz,
  updated_at timestamptz not null default now(),
  unique nulls not distinct (tenant_id, name, legal_entity_id)
);

select core.enable_tenant_rls('workflows.run');
select core.enable_tenant_rls('workflows.signal');
select core.enable_tenant_rls('workflows.step');
select core.enable_tenant_rls('workflows.schedule');
grant select, insert, update, delete on workflows.run, workflows.signal, workflows.step, workflows.schedule to amax_app;

-- Cross-tenant reads only inside SECURITY DEFINER functions owned by amax_claimer (see 0003).
grant usage on schema workflows to amax_claimer;
grant select, update on workflows.run to amax_claimer;
grant select, insert, update on workflows.schedule to amax_claimer;
grant select on core.legal_entity to amax_claimer;
create policy claimer_all on workflows.run to amax_claimer using (true) with check (true);
create policy claimer_all on workflows.schedule to amax_claimer using (true) with check (true);
create policy claimer_read on core.legal_entity for select to amax_claimer using (true);

-- Leases due Postgres-engine runs with a fresh fencing token. SKIP LOCKED plus the lease mean
-- overlapping ticks never drive the same run.
create function workflows.claim_runs(lease_seconds int, max_rows int) returns table (id uuid, tenant_id uuid, lease uuid)
language sql security definer set search_path = workflows, pg_temp as $$
  update workflows.run r
     set locked_until = now() + make_interval(secs => lease_seconds), lease = gen_random_uuid()
   where r.id in (
     select x.id from workflows.run x
      where x.engine = 'postgres' and x.status in ('running', 'sleeping', 'waiting') and x.wake_at <= now()
        and (x.locked_until is null or x.locked_until < now())
      order by x.wake_at
      for update skip locked
      limit max_rows)
  returning r.id, r.tenant_id, r.lease;
$$;

-- One row per declared schedule per tenant, or per legal entity when the schedule runs in each
-- entity's zone. `defs` is [{name, workflow, cron, timezone, enabled}], `zones` maps country → zone.
-- A changed cron or zone clears next_run_at so the next tick recomputes it; enabled is only a default.
create function workflows.ensure_schedules(defs jsonb, zones jsonb) returns int
language sql security definer set search_path = workflows, pg_temp as $$
  with d as (
    select x.name, x.workflow, x.cron, x.timezone, x.enabled
      from jsonb_to_recordset(defs) as x(name text, workflow text, cron text, timezone text, enabled boolean)
  ), target as (
    select t.id as tenant_id, d.name, d.workflow, d.cron, d.timezone as tz, null::uuid as entity, d.enabled
      from d cross join core.tenant t where d.timezone <> 'entity'
    union all
    select e.tenant_id, d.name, d.workflow, d.cron, coalesce(zones ->> e.country::text, 'UTC'), e.id, d.enabled
      from d join core.legal_entity e on d.timezone = 'entity'
  ), ins as (
    insert into workflows.schedule (tenant_id, name, workflow, cron, timezone, legal_entity_id, enabled)
    select tenant_id, name, workflow, cron, tz, entity, enabled from target
    on conflict (tenant_id, name, legal_entity_id) do update
       set workflow = excluded.workflow, cron = excluded.cron, timezone = excluded.timezone, next_run_at = null, updated_at = now()
     where (schedule.workflow, schedule.cron, schedule.timezone) is distinct from (excluded.workflow, excluded.cron, excluded.timezone)
    returning 1)
  select count(*)::int from ins;
$$;

-- Leases enabled schedules that are due (or have no next run computed yet). Disabled schedules are
-- never returned, so they create no runs.
create function workflows.claim_schedules(lease_seconds int, max_rows int, names jsonb) returns setof workflows.schedule
language sql security definer set search_path = workflows, pg_temp as $$
  update workflows.schedule s
     set locked_until = now() + make_interval(secs => lease_seconds)
   where s.id in (
     select x.id from workflows.schedule x
      where x.enabled and x.name in (select jsonb_array_elements_text(names))
        and (x.next_run_at is null or x.next_run_at <= now())
        and (x.locked_until is null or x.locked_until < now())
      order by x.next_run_at nulls first
      for update skip locked
      limit max_rows)
  returning s.*;
$$;

alter function workflows.claim_runs(int, int) owner to amax_claimer;
alter function workflows.ensure_schedules(jsonb, jsonb) owner to amax_claimer;
alter function workflows.claim_schedules(int, int, jsonb) owner to amax_claimer;
revoke all on function workflows.claim_runs(int, int), workflows.ensure_schedules(jsonb, jsonb), workflows.claim_schedules(int, int, jsonb) from public;
grant execute on function workflows.claim_runs(int, int), workflows.ensure_schedules(jsonb, jsonb), workflows.claim_schedules(int, int, jsonb) to amax_app;
