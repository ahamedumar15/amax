-- 027 reports: a read model of logged hours (one row per time entry, from time's insert-only
-- time.entry.logged event), the non-working days per legal entity that available hours leave out,
-- and the tenant's settings: the utilisation target and the demo's pinned "today".
create schema reports;
grant usage on schema reports to amax_app;

create table reports.logged_hours (
  entry_id uuid primary key,
  tenant_id uuid not null references core.tenant(id),
  user_id uuid not null,
  day date not null,
  hours numeric(6,2) not null check (hours > 0 and hours <= 24),
  billable boolean not null,
  recorded_at timestamptz not null default now()
);
create index on reports.logged_hours (tenant_id, day);

create table reports.holiday (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  legal_entity_id uuid not null references core.legal_entity(id),
  on_date date not null,
  name text not null,
  unique (tenant_id, legal_entity_id, on_date)
);

create table reports.settings (
  tenant_id uuid primary key references core.tenant(id),
  target integer not null default 80 check (target between 1 and 100),
  today date
);

select core.enable_tenant_rls('reports.logged_hours');
select core.enable_tenant_rls('reports.holiday');
select core.enable_tenant_rls('reports.settings');
grant select, insert, update, delete on all tables in schema reports to amax_app;
