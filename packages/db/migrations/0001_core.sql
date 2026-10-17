-- Core: tenancy, legal entities, audit, outbox, jobs. Every tenant-owned table gets RLS on tenant_id
-- through core.enable_tenant_rls(), keyed on the per-transaction app.tenant_id setting.

do $$ begin
  if not exists (select from pg_roles where rolname = 'amax_app') then create role amax_app nologin; end if;
end $$;

create schema core;
grant usage on schema core to amax_app;

create function core.current_tenant() returns uuid language sql stable as $$
  select nullif(current_setting('app.tenant_id', true), '')::uuid
$$;

-- Modules call this for every table they create: select core.enable_tenant_rls('hr.employee');
create function core.enable_tenant_rls(t regclass) returns void language plpgsql as $$
begin
  execute format('alter table %s enable row level security', t);
  execute format('alter table %s force row level security', t);
  execute format('create policy tenant_isolation on %s using (tenant_id = core.current_tenant()) with check (tenant_id = core.current_tenant())', t);
end $$;

create table core.tenant (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);
alter table core.tenant enable row level security;
alter table core.tenant force row level security;
create policy tenant_self on core.tenant using (id = core.current_tenant()) with check (id = core.current_tenant());

create table core.legal_entity (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  name text not null,
  country char(2) not null,
  base_currency char(3) not null,
  created_at timestamptz not null default now()
);

create table core.audit_event (
  tenant_id uuid not null references core.tenant(id),
  seq bigint not null,
  occurred_at timestamptz not null default now(),
  actor text not null,
  on_behalf_of text,
  source text not null,
  action text not null,
  resource text not null,
  resource_id text,
  before jsonb,
  after jsonb,
  prev_hash text not null,
  hash text not null,
  primary key (tenant_id, seq)
);

create table core.event (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  name text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  attempts int not null default 0,
  locked_until timestamptz,
  last_error text
);
create index event_pending on core.event (created_at) where delivered_at is null;

create table core.job (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  name text not null,
  key text,
  payload jsonb not null default '{}',
  cron text,
  run_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'done', 'failed')),
  attempts int not null default 0,
  locked_until timestamptz,
  last_error text,
  unique (tenant_id, key)
);
create index job_due on core.job (run_at) where status = 'pending';

-- Handlers record each event they've processed, so redelivery is a no-op.
create table core.processed_event (
  handler text not null,
  event_id uuid not null,
  tenant_id uuid not null references core.tenant(id),
  processed_at timestamptz not null default now(),
  primary key (handler, event_id)
);

select core.enable_tenant_rls('core.legal_entity');
select core.enable_tenant_rls('core.audit_event');
select core.enable_tenant_rls('core.event');
select core.enable_tenant_rls('core.job');
select core.enable_tenant_rls('core.processed_event');

grant select, insert, update on core.tenant to amax_app;
grant select, insert, update, delete on core.legal_entity, core.event, core.job, core.processed_event to amax_app;
-- Audit is append-only for the app (T3 adds the hash chain and a trigger that blocks edits for everyone).
grant select, insert on core.audit_event to amax_app;
