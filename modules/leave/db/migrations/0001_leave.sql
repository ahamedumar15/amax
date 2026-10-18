create schema leave;
grant usage on schema leave to amax_app;

-- A legal entity's leave types, installed from its country pack (packs.ts).
create table leave.policy (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  legal_entity_id uuid not null references core.legal_entity(id),
  type text not null check (type in ('annual', 'casual', 'medical', 'lieu', 'personal', 'long-service', 'unpaid')),
  label text not null,
  days_per_year numeric(5,1),
  paid boolean not null default true,
  half_days boolean not null default true,
  pack char(2) not null,
  rule text,
  created_at timestamptz not null default now(),
  unique (tenant_id, legal_entity_id, type)
);

create table leave.holiday (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  country char(2) not null,
  on_date date not null,
  name text not null,
  kind text not null check (kind in ('poya', 'public', 'bank')),
  unique (tenant_id, country, on_date, name)
);

-- One person's entitlement for a type and year. taken_before is what they took before amax went live;
-- days taken since then are the approved requests.
create table leave.balance (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  person_id uuid not null references hr.person(id),
  user_id uuid references auth.user(id),
  legal_entity_id uuid not null references core.legal_entity(id),
  type text not null,
  year int not null,
  entitled numeric(5,1) not null default 0,
  carried numeric(5,1) not null default 0,
  taken_before numeric(5,1) not null default 0,
  updated_at timestamptz not null default now(),
  unique (tenant_id, person_id, type, year)
);

create table leave.request (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  person_id uuid not null references hr.person(id),
  user_id uuid references auth.user(id),
  person_name text not null,
  legal_entity_id uuid not null references core.legal_entity(id),
  type text not null,
  starts_on date not null,
  ends_on date not null,
  half_day text check (half_day in ('am', 'pm')),
  days numeric(5,1) not null check (days > 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  note text,
  medical_reason text,
  certificate_ref text,
  requested_by text not null,
  decided_by text,
  decided_at timestamptz,
  decision_comment text,
  cancelled_by text,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on >= starts_on),
  check (half_day is null or starts_on = ends_on),
  check (status <> 'rejected' or length(trim(coalesce(decision_comment, ''))) > 0)
);
create index request_dates_idx on leave.request (tenant_id, starts_on, ends_on);
create index request_person_idx on leave.request (person_id, type);

-- Releases in flight, kept from delivery.release.deployed events (the delivery contract): a request
-- that overlaps one clashes. Empty when delivery isn't installed.
create table leave.release_window (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  project_id uuid not null,
  project_key text not null,
  project_title text not null,
  version text not null,
  environment text not null,
  retry boolean not null default false,
  starts_on date not null,
  ends_on date not null,
  unique (tenant_id, project_id, version)
);

-- "Today" for a tenant's leave screens: the demo tenant pins fixtures.md's Oct 16, 2026. No row = the real date.
create table leave.clock_pin (
  tenant_id uuid primary key references core.tenant(id),
  today date not null
);

select core.enable_tenant_rls('leave.policy');
select core.enable_tenant_rls('leave.holiday');
select core.enable_tenant_rls('leave.balance');
select core.enable_tenant_rls('leave.request');
select core.enable_tenant_rls('leave.release_window');
select core.enable_tenant_rls('leave.clock_pin');
grant select, insert, update, delete on all tables in schema leave to amax_app;
