create schema keyflow;
grant usage on schema keyflow to amax_app;

-- Where the tenant's Keyflow lives. `sandbox`: the built-in fictional Keyflow the demo tenant syncs
-- with (server/sandbox.ts), so no real endpoint is ever called from demo data. The key itself is the
-- 031 `keyflow` credential, never stored here.
create table keyflow.connection (
  tenant_id uuid primary key references core.tenant(id),
  endpoint text,
  sandbox boolean not null default false,
  change_cursor text,
  set_by text not null,
  set_at timestamptz not null default now(),
  check (sandbox or endpoint is not null)
);

-- One sync: what went out, what came in, and how it ended. Written by the keyflow.sync job.
create table keyflow.sync_run (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  started_at timestamptz not null,
  finished_at timestamptz not null default now(),
  status text not null check (status in ('completed', 'completed-with-errors', 'failed', 'skipped')),
  people_out int not null default 0,
  teams_out int not null default 0,
  goals_in int not null default 0,
  reviews_in int not null default 0,
  recognition_in int not null default 0,
  errors int not null default 0,
  failure text,
  started_by text not null
);
create index sync_run_finished_idx on keyflow.sync_run (tenant_id, finished_at desc);

-- A record that didn't sync. One open row per key (a person refused, an unmatched Keyflow person);
-- each later run that hits it again bumps `runs`. Dismissing closes it; if it recurs, a new one opens.
create table keyflow.sync_error (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  key text not null,
  kind text not null check (kind in ('refused', 'unmatched', 'invalid')),
  person_id uuid references hr.person(id),
  person_name text,
  external_ref text,
  message text not null,
  runs int not null default 1,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_run_id uuid references keyflow.sync_run(id) on delete set null,
  dismissed_at timestamptz,
  dismissed_by text
);
create unique index sync_error_open_idx on keyflow.sync_error (tenant_id, key) where dismissed_at is null;

-- What amax last sent for each person and team, as a hash, so a sync sends only what changed.
create table keyflow.link (
  tenant_id uuid not null references core.tenant(id),
  kind text not null check (kind in ('person', 'team')),
  local_id text not null,
  hash text not null,
  sent_at timestamptz not null default now(),
  primary key (tenant_id, kind, local_id)
);

create table keyflow.goal (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  person_id uuid not null references hr.person(id),
  external_id text not null,
  title text not null,
  status text not null check (status in ('on-track', 'at-risk', 'off-track', 'done')),
  progress int not null check (progress between 0 and 100),
  due_on date,
  period text,
  updated_at timestamptz not null default now(),
  unique (tenant_id, external_id)
);

-- 002 performance: HR, Leadership, the person and their manager only.
create table keyflow.review_score (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  person_id uuid not null references hr.person(id),
  external_id text not null,
  cycle text not null,
  score numeric(4,1) not null,
  scale numeric(4,1) not null check (scale > 0),
  rating text,
  reviewed_on date not null,
  updated_at timestamptz not null default now(),
  check (score >= 0 and score <= scale),
  unique (tenant_id, external_id)
);

create table keyflow.recognition (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  person_id uuid not null references hr.person(id),
  external_id text not null,
  from_name text not null,
  message text not null,
  given_on date not null,
  updated_at timestamptz not null default now(),
  unique (tenant_id, external_id)
);
create index goal_person_idx on keyflow.goal (person_id);
create index review_person_idx on keyflow.review_score (person_id);
create index recognition_person_idx on keyflow.recognition (person_id);

select core.enable_tenant_rls('keyflow.connection');
select core.enable_tenant_rls('keyflow.sync_run');
select core.enable_tenant_rls('keyflow.sync_error');
select core.enable_tenant_rls('keyflow.link');
select core.enable_tenant_rls('keyflow.goal');
select core.enable_tenant_rls('keyflow.review_score');
select core.enable_tenant_rls('keyflow.recognition');
grant select, insert, update, delete on all tables in schema keyflow to amax_app;
