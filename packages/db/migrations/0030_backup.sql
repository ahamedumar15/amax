-- 034 backups: per-tenant snapshots sealed with the tenant's data key, the weekly restore drill's
-- results, whole-tenant exports behind a second Admin, and a leaving tenant's 30-day countdown.
create schema backup;
grant usage on schema backup to amax_app;

create table backup.snapshot (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  kind text not null check (kind in ('daily', 'monthly')),
  taken_at timestamptz not null default now(),
  region text,
  storage_key text not null,
  tables jsonb not null default '{}',
  row_count bigint not null default 0,
  bytes bigint not null default 0,
  expires_at timestamptz not null,
  pruned_at timestamptz
);
create index snapshot_latest on backup.snapshot (tenant_id, taken_at desc);

create table backup.drill (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  status text not null default 'requested' check (status in ('requested', 'passed', 'slow', 'failed')),
  requested_by text,
  requested_at timestamptz not null default now(),
  snapshot_id uuid references backup.snapshot(id),
  backup_taken_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  duration_ms bigint,
  tables_checked int,
  rows_checked bigint,
  mismatches jsonb not null default '[]',
  chain_ok boolean,
  chain_length int,
  note text
);
create index drill_latest on backup.drill (tenant_id, requested_at desc);

create table backup.export (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  status text not null default 'awaiting_approval' check (status in ('awaiting_approval', 'building', 'ready', 'failed', 'cancelled')),
  reason text not null,
  requested_by text not null,
  requested_at timestamptz not null default now(),
  approved_by text,
  approved_at timestamptz,
  ready_at timestamptz,
  expires_at timestamptz,
  storage_key text,
  modules jsonb not null default '{}',
  files int not null default 0,
  bytes bigint not null default 0,
  privacy jsonb not null default '{}',
  downloads int not null default 0,
  error text,
  check (approved_by is null or approved_by <> requested_by)
);
create index export_recent on backup.export (tenant_id, requested_at desc);

create table backup.offboarding (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  status text not null default 'waiting' check (status in ('waiting', 'destroyed', 'cancelled')),
  reason text not null,
  started_by text not null,
  started_at timestamptz not null default now(),
  destroy_after timestamptz not null,
  export_id uuid references backup.export(id),
  cancelled_by text,
  cancelled_at timestamptz,
  destroyed_at timestamptz
);
create unique index offboarding_one_open on backup.offboarding (tenant_id) where status = 'waiting';

select core.enable_tenant_rls('backup.snapshot');
select core.enable_tenant_rls('backup.drill');
select core.enable_tenant_rls('backup.export');
select core.enable_tenant_rls('backup.offboarding');
grant select, insert, update on backup.snapshot, backup.drill, backup.export, backup.offboarding to amax_app;

-- AC-5: destroying a data key is crypto-shredding: nothing sealed with it can be read again. amax_app
-- never updates secrets.data_key; only this gate does, for a tenant whose 30 days have passed with no
-- legal hold active.
alter table secrets.data_key alter column wrapped drop not null,
  add column destroyed_at timestamptz,
  add constraint data_key_destroyed check ((destroyed_at is null) = (wrapped is not null));

do $$ begin
  if not exists (select from pg_roles where rolname = 'amax_keys') then create role amax_keys nologin; end if;
end $$;
grant amax_keys to current_user;
grant usage on schema core, secrets, backup, privacy to amax_keys;
grant select, update on secrets.data_key to amax_keys;
grant select, update on backup.offboarding to amax_keys;
grant select on privacy.legal_hold to amax_keys;

create function backup.destroy_data_key(offboarding_id uuid) returns boolean language plpgsql security definer
set search_path = backup, secrets, privacy, core, pg_temp as $$
declare
  o backup.offboarding;
begin
  select * into o from backup.offboarding o0 where o0.id = offboarding_id and o0.tenant_id = core.current_tenant() for update;
  if o.id is null or o.status <> 'waiting' then
    raise exception 'destroy_data_key: % is not a waiting offboarding', offboarding_id;
  end if;
  if o.destroy_after > now() then
    raise exception 'destroy_data_key: % waits until %', offboarding_id, o.destroy_after;
  end if;
  if exists (select 1 from privacy.legal_hold h where h.tenant_id = o.tenant_id and h.released_at is null) then
    raise exception 'destroy_data_key: a legal hold is active';
  end if;
  update secrets.data_key set wrapped = null, destroyed_at = now() where tenant_id = o.tenant_id and destroyed_at is null;
  update backup.offboarding set status = 'destroyed', destroyed_at = now() where id = o.id;
  return true;
end $$;
alter function backup.destroy_data_key(uuid) owner to amax_keys;
revoke all on function backup.destroy_data_key(uuid) from public;
grant execute on function backup.destroy_data_key(uuid) to amax_app;

-- AC-3: the drill runner finds the tenants due a drill: one asked for, or none started since Sunday 00:00 UTC.
grant usage on schema backup to amax_claimer;
grant select on backup.snapshot, backup.drill to amax_claimer;
create policy claimer_read on backup.snapshot for select to amax_claimer using (true);
create policy claimer_read on backup.drill for select to amax_claimer using (true);
create function backup.drills_due() returns table (tenant_id uuid, drill_id uuid)
language sql security definer set search_path = backup, pg_temp as $$
  select s.tenant_id,
         (select d.id from backup.drill d where d.tenant_id = s.tenant_id and d.status = 'requested' order by d.requested_at limit 1)
    from (select distinct tenant_id from backup.snapshot where pruned_at is null) s
   where exists (select 1 from backup.drill d where d.tenant_id = s.tenant_id and d.status = 'requested')
      or not exists (select 1 from backup.drill d where d.tenant_id = s.tenant_id and d.started_at >= (date_trunc('week', (now() at time zone 'utc') + interval '1 day') - interval '1 day') at time zone 'utc');
$$;
alter function backup.drills_due() owner to amax_claimer;
revoke all on function backup.drills_due() from public;
grant execute on function backup.drills_due() to amax_app;
