-- The job runner needs to see due work across tenants, but the app role must never see another
-- tenant's rows. So cross-tenant reads happen only inside these SECURITY DEFINER functions, owned by
-- amax_claimer: a NOLOGIN role nobody can become, whose own RLS policies let it claim rows. Each
-- claimed row is then processed under its own tenant by the app role.

do $$ begin
  if not exists (select from pg_roles where rolname = 'amax_claimer') then create role amax_claimer nologin; end if;
end $$;
grant amax_claimer to current_user;

grant usage on schema core to amax_claimer;
grant select on core.tenant to amax_claimer;
grant select, insert, update on core.job to amax_claimer;
grant select, update on core.event to amax_claimer;
create policy claimer_all on core.tenant to amax_claimer using (true);
create policy claimer_all on core.job to amax_claimer using (true) with check (true);
create policy claimer_all on core.event to amax_claimer using (true) with check (true);

-- Leases due jobs. SKIP LOCKED plus the lease mean overlapping ticks never take the same job.
create function core.claim_jobs(lease_seconds int, max_rows int) returns setof core.job
language sql security definer set search_path = core, pg_temp as $$
  update core.job j
     set locked_until = now() + make_interval(secs => lease_seconds), attempts = j.attempts + 1
   where j.id in (
     select id from core.job
      where status = 'pending' and run_at <= now() and (locked_until is null or locked_until < now())
      order by run_at
      for update skip locked
      limit max_rows)
  returning j.*;
$$;

create function core.claim_events(lease_seconds int, max_rows int) returns setof core.event
language sql security definer set search_path = core, pg_temp as $$
  update core.event e
     set locked_until = now() + make_interval(secs => lease_seconds), attempts = e.attempts + 1
   where e.id in (
     select id from core.event
      where delivered_at is null and attempts < 20 and (locked_until is null or locked_until < now())
      order by created_at
      for update skip locked
      limit max_rows)
  returning e.*;
$$;

-- Makes sure every tenant has one row per cron schedule a module declares.
create function core.ensure_schedule(job_name text, cron_expr text, first_run timestamptz) returns int
language sql security definer set search_path = core, pg_temp as $$
  with ins as (
    insert into core.job (tenant_id, name, key, cron, run_at)
    select t.id, job_name, 'cron:' || job_name, cron_expr, first_run from core.tenant t
    on conflict (tenant_id, key) do update set cron = excluded.cron where core.job.cron is distinct from excluded.cron
    returning 1)
  select count(*)::int from ins;
$$;

alter function core.claim_jobs(int, int) owner to amax_claimer;
alter function core.claim_events(int, int) owner to amax_claimer;
alter function core.ensure_schedule(text, text, timestamptz) owner to amax_claimer;
revoke all on function core.claim_jobs(int, int), core.claim_events(int, int), core.ensure_schedule(text, text, timestamptz) from public;
grant execute on function core.claim_jobs(int, int), core.claim_events(int, int), core.ensure_schedule(text, text, timestamptz) to amax_app;
