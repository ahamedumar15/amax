create schema time;
grant usage on schema time to amax_app;

create table time.week (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  user_id uuid not null references auth.user(id),
  person_name text not null,
  iso_year int not null,
  iso_week int not null check (iso_week between 1 and 53),
  starts_on date not null,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'approved', 'rejected')),
  note text,
  submitted_at timestamptz,
  decided_at timestamptz,
  decided_by text,
  reject_comment text,
  locked_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id, iso_year, iso_week),
  check (status <> 'rejected' or length(trim(coalesce(reject_comment, ''))) > 0),
  check ((status = 'approved') = (locked_at is not null))
);

create table time.entry (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  week_id uuid not null references time.week(id),
  user_id uuid not null references auth.user(id),
  project_id uuid not null references delivery.project(id),
  day date not null,
  hours numeric(4,2) not null check (hours > 0 and hours <= 24),
  billable boolean not null default true,
  source text not null check (source in ('person', 'agent')),
  agent text,
  note text,
  logged_by text not null,
  created_at timestamptz not null default now()
);
create index entry_week_idx on time.entry (week_id);
create index entry_day_idx on time.entry (tenant_id, day);

create table time.approval (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  week_id uuid not null references time.week(id),
  decision text not null check (decision in ('approved', 'rejected', 'reopened')),
  chain text not null check (chain in ('manager', 'project', 'admin')),
  comment text,
  decided_by text not null,
  at timestamptz not null default now(),
  check (decision = 'approved' or length(trim(coalesce(comment, ''))) > 0)
);

select core.enable_tenant_rls('time.week');
select core.enable_tenant_rls('time.entry');
select core.enable_tenant_rls('time.approval');
grant select, insert, update, delete on all tables in schema time to amax_app;
