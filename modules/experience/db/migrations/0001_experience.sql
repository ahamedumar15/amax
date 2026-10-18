-- 037 digital experience: device and app health from Intune and Defender, per legal entity once a
-- notice to staff is recorded, anonymous pulse answers, the issues the experience agent found, and
-- group score snapshots. Never keystrokes, screens, browsing, window titles or activity (AC-1).
create schema experience;
grant usage on schema experience to amax_app;

-- `today` pins the demo's clock; `sandbox` reads the built-in fictional Intune instead of Graph.
create table experience.settings (
  tenant_id uuid primary key references core.tenant(id),
  today date,
  sandbox boolean not null default false,
  remediation_enabled boolean not null default false,
  remediation_script text check (length(remediation_script) <= 100),
  remediation_set_by text,
  remediation_set_at timestamptz
);

-- AC-2: collection is on for an entity only after the notice to staff is recorded with its date.
create table experience.collection (
  tenant_id uuid not null references core.tenant(id),
  legal_entity_id uuid not null,
  notice_on date,
  enabled boolean not null default false check (not enabled or notice_on is not null),
  set_by text not null,
  set_at timestamptz not null default now(),
  primary key (tenant_id, legal_entity_id)
);

create table experience.device (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  external_id text not null,
  model text not null check (length(model) <= 120),
  owner_user_id uuid,
  person_id uuid,
  legal_entity_id uuid not null,
  department text,
  last_seen_at timestamptz not null default now(),
  unique (tenant_id, external_id)
);

create table experience.device_day (
  tenant_id uuid not null references core.tenant(id),
  device_id uuid not null references experience.device(id) on delete cascade,
  owner_user_id uuid,
  day date not null,
  collected_at timestamptz not null default now(),
  startup_score int not null check (startup_score between 0 and 100),
  boot_seconds int not null check (boot_seconds >= 0),
  app_score int not null check (app_score between 0 and 100),
  crashes int not null default 0 check (crashes >= 0),
  hangs int not null default 0 check (hangs >= 0),
  battery_pct int check (battery_pct between 0 and 100),
  risk text not null default 'none' check (risk in ('none', 'low', 'medium', 'high')),
  primary key (device_id, day)
);

create table experience.device_app_day (
  tenant_id uuid not null references core.tenant(id),
  device_id uuid not null references experience.device(id) on delete cascade,
  owner_user_id uuid,
  day date not null,
  collected_at timestamptz not null default now(),
  app text not null check (length(app) <= 120),
  app_version text not null check (length(app_version) <= 40),
  crashes int not null default 0 check (crashes >= 0),
  hangs int not null default 0 check (hangs >= 0),
  primary key (device_id, day, app, app_version)
);

create table experience.issue (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  key text not null,
  kind text not null check (kind in ('app', 'boot', 'battery')),
  subject text not null,
  version text,
  title text not null,
  cause text not null,
  arrived_on date,
  ratio numeric(4,1),
  department text,
  first_seen date not null,
  devices int not null,
  confidence numeric(3,2) not null default 0.5,
  fix text not null check (fix in ('remediation', 'ticket')),
  status text not null default 'open' check (status in ('open', 'accepted', 'done')),
  suggestion_id uuid,
  found_at timestamptz not null default now(),
  unique (tenant_id, key)
);

create table experience.issue_device (
  tenant_id uuid not null references core.tenant(id),
  issue_id uuid not null references experience.issue(id) on delete cascade,
  device_id uuid not null references experience.device(id) on delete cascade,
  primary key (issue_id, device_id)
);

create table experience.remediation (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  issue_id uuid not null references experience.issue(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'applied', 'manual', 'failed', 'cancelled')),
  outcome text check (length(outcome) <= 300),
  approved_by text not null,
  approved_at timestamptz not null default now(),
  applied_at timestamptz
);

create table experience.pulse (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  question text not null check (length(question) between 5 and 200),
  sent_on date not null,
  sent_by text not null,
  recipients int not null default 0
);

-- AC-4: who answered is kept apart from what was answered; an answer has no person and no time.
create table experience.pulse_receipt (
  tenant_id uuid not null references core.tenant(id),
  pulse_id uuid not null references experience.pulse(id) on delete cascade,
  user_id uuid not null,
  primary key (pulse_id, user_id)
);

create table experience.pulse_answer (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  pulse_id uuid not null references experience.pulse(id) on delete cascade,
  choice text not null check (choice in ('well', 'sometimes', 'a-lot')),
  department text,
  legal_entity_id uuid
);

create table experience.score_snapshot (
  tenant_id uuid not null references core.tenant(id),
  day date not null,
  dimension text not null check (dimension in ('department', 'site', 'model')),
  group_key text not null,
  people int not null check (people >= 5),
  score numeric(3,1) not null check (score between 0 and 10),
  dropped boolean not null default false,
  primary key (tenant_id, day, dimension, group_key)
);

select core.enable_tenant_rls('experience.settings');
select core.enable_tenant_rls('experience.collection');
select core.enable_tenant_rls('experience.device');
select core.enable_tenant_rls('experience.device_day');
select core.enable_tenant_rls('experience.device_app_day');
select core.enable_tenant_rls('experience.issue');
select core.enable_tenant_rls('experience.issue_device');
select core.enable_tenant_rls('experience.remediation');
select core.enable_tenant_rls('experience.pulse');
select core.enable_tenant_rls('experience.pulse_receipt');
select core.enable_tenant_rls('experience.pulse_answer');
select core.enable_tenant_rls('experience.score_snapshot');
grant select, insert, update, delete on all tables in schema experience to amax_app;
