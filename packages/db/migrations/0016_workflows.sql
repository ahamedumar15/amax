-- 029 Workflows: durable runs (steps, timers, waits) and cron schedules for the built-in Postgres
-- engine. The Temporal engine mirrors its runs into the same tables so admins see one Runs list.
create schema workflows;
grant usage on schema workflows to amax_app;

create table workflows.run (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  workflow text not null,
  -- The definition version the run started on; a resume on a different version is refused.
  version int not null default 1,
  engine text not null default 'postgres' check (engine in ('postgres', 'temporal')),
  key text,
  status text not null default 'running' check (status in ('running', 'sleeping', 'waiting', 'paused', 'completed', 'failed', 'cancelled')),
  input jsonb not null default 'null',
  output jsonb,
  error text,
  acts_for text,
  started_by text not null,
  schedule_id uuid,
  legal_entity_id uuid references core.legal_entity(id) on delete set null,
  -- Temporal only: when the execution was started. Null runs are launched by the tick, so a run
  -- started inside a caller's transaction is launched only after that transaction commits.
  launched_at timestamptz,
  -- Temporal only: a pause, resume or cancel committed here but not yet confirmed by Temporal; the
  -- tick retries it until it is.
  engine_action text check (engine_action in ('pause', 'resume', 'cancel')),
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
  -- The outbox event (or caller-supplied id) it came from: delivering it twice is a no-op.
  source_id text,
  created_at timestamptz not null default now(),
  unique (tenant_id, source_id)
);
create index signal_event on workflows.signal (tenant_id, event, created_at);

create table workflows.step (
  run_id uuid not null references workflows.run(id) on delete cascade,
  tenant_id uuid not null references core.tenant(id),
  name text not null,
  seq int not null,
  kind text not null check (kind in ('step', 'sleep', 'wait')),
  -- 'started' is committed before an attempt runs, so an attempt cut short by a crash still counts.
  status text not null check (status in ('started', 'done', 'failed', 'retrying', 'sleeping', 'waiting')),
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
  -- Copied from the run when it finishes, so retention never deletes a live run's checkpoints.
  run_finished_at timestamptz,
  primary key (run_id, name)
);

create function workflows.copy_run_finished() returns trigger language plpgsql as $$
begin
  update workflows.step set run_finished_at = new.finished_at where run_id = new.id;
  return new;
end $$;
create trigger run_finished after update of finished_at on workflows.run
  for each row when (old.finished_at is distinct from new.finished_at) execute function workflows.copy_run_finished();
create index step_waiting on workflows.step (tenant_id, wait_event) where status = 'waiting';

create table workflows.schedule (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  name text not null,
  workflow text not null,
  cron text not null,
  -- Null when an entity's zone is unknown: the schedule is then never fired (fail closed).
  timezone text,
  legal_entity_id uuid references core.legal_entity(id) on delete cascade,
  enabled boolean not null,
  next_run_at timestamptz,
  last_run_at timestamptz,
  last_run_id uuid references workflows.run(id) on delete set null,
  last_error text,
  locked_until timestamptz,
  updated_at timestamptz not null default now(),
  unique nulls not distinct (tenant_id, name, legal_entity_id)
);

-- A legal entity's zone, when its country's default (see ENTITY_ZONES) is wrong or missing.
create table workflows.entity_zone (
  legal_entity_id uuid primary key references core.legal_entity(id) on delete cascade,
  tenant_id uuid not null references core.tenant(id),
  timezone text not null
);

-- The zone must be a real one, and the entity must belong to the row's tenant: the lookup runs as
-- the app role under RLS, so another tenant's entity is simply not found.
create function workflows.check_entity_zone() returns trigger language plpgsql as $$
begin
  if not exists (select 1 from pg_timezone_names where name = new.timezone) then
    raise exception 'unknown time zone "%"', new.timezone;
  end if;
  if not exists (select 1 from core.legal_entity e where e.id = new.legal_entity_id and e.tenant_id = new.tenant_id) then
    raise exception 'legal entity % is not in this tenant', new.legal_entity_id;
  end if;
  return new;
end $$;
create trigger entity_zone_check before insert or update on workflows.entity_zone
  for each row execute function workflows.check_entity_zone();

select core.enable_tenant_rls('workflows.run');
select core.enable_tenant_rls('workflows.entity_zone');
select core.enable_tenant_rls('workflows.signal');
select core.enable_tenant_rls('workflows.step');
select core.enable_tenant_rls('workflows.schedule');
grant select, insert, update, delete on workflows.run, workflows.signal, workflows.step, workflows.schedule, workflows.entity_zone to amax_app;

-- Cross-tenant reads only inside SECURITY DEFINER functions owned by amax_claimer (see 0003).
grant usage on schema workflows to amax_claimer;
grant select, update on workflows.run to amax_claimer;
grant select, insert, update on workflows.schedule to amax_claimer;
grant select on core.legal_entity, workflows.entity_zone to amax_claimer;
create policy claimer_read on workflows.entity_zone for select to amax_claimer using (true);
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
-- entity's zone. `defs` is [{name, workflow, cron, timezone, enabled}], `zones` maps country → zone;
-- an entity_zone row wins. An entity with neither gets a null zone and is never fired.
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
    select e.tenant_id, d.name, d.workflow, d.cron, coalesce(z.timezone, zones ->> e.country::text), e.id, d.enabled
      from d join core.legal_entity e on d.timezone = 'entity'
      left join workflows.entity_zone z on z.legal_entity_id = e.id and z.tenant_id = e.tenant_id
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
      where x.enabled and x.timezone is not null and x.name in (select jsonb_array_elements_text(names))
        and (x.next_run_at is null or x.next_run_at <= now())
        and (x.locked_until is null or x.locked_until < now())
      order by x.next_run_at nulls first
      for update skip locked
      limit max_rows)
  returning s.*;
$$;

-- Temporal runs with engine work outstanding: not yet started on Temporal (launched_at), or a
-- committed pause, resume or cancel Temporal hasn't confirmed (engine_action).
create function workflows.claim_temporal(lease_seconds int, max_rows int) returns table (id uuid, tenant_id uuid, lease uuid)
language sql security definer set search_path = workflows, pg_temp as $$
  update workflows.run r
     set locked_until = now() + make_interval(secs => lease_seconds), lease = gen_random_uuid()
   where r.id in (
     select x.id from workflows.run x
      where x.engine = 'temporal'
        and ((x.launched_at is null and x.status = 'running') or x.engine_action is not null)
        and (x.locked_until is null or x.locked_until < now())
      order by x.created_at
      for update skip locked
      limit max_rows)
  returning r.id, r.tenant_id, r.lease;
$$;

alter function workflows.claim_runs(int, int) owner to amax_claimer;
alter function workflows.claim_temporal(int, int) owner to amax_claimer;
alter function workflows.ensure_schedules(jsonb, jsonb) owner to amax_claimer;
alter function workflows.claim_schedules(int, int, jsonb) owner to amax_claimer;
revoke all on function workflows.claim_runs(int, int), workflows.claim_temporal(int, int), workflows.ensure_schedules(jsonb, jsonb), workflows.claim_schedules(int, int, jsonb) from public;
grant execute on function workflows.claim_runs(int, int), workflows.claim_temporal(int, int), workflows.ensure_schedules(jsonb, jsonb), workflows.claim_schedules(int, int, jsonb) to amax_app;
