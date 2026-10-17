-- 010 allocations: who works on what, by month, and the demand not yet staffed. People are hr.person
-- ids and projects delivery.project ids, read through those modules' contracts (no cross-schema keys).
create schema allocations;
grant usage on schema allocations to amax_app;

create table allocations.member (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  person_id uuid not null,
  team text not null default 'Delivery team',
  skill text,
  unique (tenant_id, person_id, team)
);

create table allocations.allocation (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  person_id uuid not null,
  project_id uuid,
  work text,
  month date not null check (extract(day from month) = 1),
  percent int not null check (percent > 0 and percent <= 200),
  updated_by text,
  updated_at timestamptz not null default now(),
  check ((project_id is null) <> (work is null))
);
create unique index allocation_slot on allocations.allocation (tenant_id, person_id, coalesce(project_id::text, 'work:' || work), month);
create index allocation_month on allocations.allocation (tenant_id, month);

create table allocations.forecast (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  team text not null default 'Delivery team',
  month date not null check (extract(day from month) = 1),
  label text not null,
  demand_fte numeric(6,2) not null check (demand_fte >= 0),
  updated_at timestamptz not null default now(),
  unique (tenant_id, team, month, label)
);

select core.enable_tenant_rls('allocations.member');
select core.enable_tenant_rls('allocations.allocation');
select core.enable_tenant_rls('allocations.forecast');
grant select, insert, update, delete on all tables in schema allocations to amax_app;
