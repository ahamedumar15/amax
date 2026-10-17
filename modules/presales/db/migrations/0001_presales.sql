-- 020 presales: clients, opportunities from new idea to won or lost, their activities, tasks,
-- risks and a stage history that logs every change with who and when.
create schema presales;
grant usage on schema presales to amax_app;

create table presales.client (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  name text not null,
  country char(2),
  created_at timestamptz not null default now(),
  unique (tenant_id, name)
);

-- USD per unit of a currency. The pipeline is reported in USD; each opportunity keeps its own
-- amount and currency, plus the rate it was converted at.
create table presales.fx_rate (
  tenant_id uuid not null references core.tenant(id),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  usd_rate numeric(19,8) not null check (usd_rate > 0),
  as_of date not null default current_date,
  primary key (tenant_id, currency)
);

create table presales.opportunity (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  number int not null,
  client_id uuid not null references presales.client(id),
  title text not null,
  stage text not null default 'new-idea' check (stage in ('new-idea', 'lead', 'qualified', 'proposal', 'negotiation', 'won', 'lost')),
  win_chance int not null default 10 check (win_chance between 0 and 100),
  value_amount numeric(19,4) not null check (value_amount >= 0),
  value_currency char(3) not null check (value_currency ~ '^[A-Z]{3}$'),
  usd_rate numeric(19,8) not null,
  value_usd numeric(19,4) not null,
  owner_user_id uuid references auth.user(id),
  owner_name text,
  lead_name text,
  service text,
  cost_centre text,
  estimate_days int,
  expected_close date,
  lead_source text,
  competing text,
  next_step text,
  lost_reason text,
  lost_competitor text,
  closed_at timestamptz,
  stage_since timestamptz not null default now(),
  project_id uuid,
  project_key text,
  -- Promote to delivery claims the opportunity first (key, token, time), so two promotes can't both
  -- create a project; the claim is cleared when the project is linked, or when an attempt fails
  -- before delivery made anything.
  claim_key text,
  claim_token uuid,
  claim_series uuid,
  claim_fingerprint text,
  claimed_at timestamptz,
  removed_at timestamptz,
  removed_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, number),
  check ((stage = 'lost') = (lost_reason is not null)),
  check ((stage in ('won', 'lost')) = (closed_at is not null)),
  check (project_id is null or stage = 'won'),
  check (claim_key is null or (stage = 'won' and project_id is null))
);
-- One project belongs to at most one opportunity.
create unique index opportunity_project on presales.opportunity (tenant_id, project_id) where project_id is not null;

create table presales.stage_change (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  opportunity_id uuid not null references presales.opportunity(id),
  from_stage text,
  to_stage text not null,
  from_chance int,
  to_chance int not null,
  note text,
  by_name text not null,
  by_actor text not null,
  at timestamptz not null default now()
);

create table presales.activity (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  opportunity_id uuid not null references presales.opportunity(id),
  title text not null,
  note text,
  kind text not null check (kind in ('call', 'meeting', 'workshop', 'demo', 'proposal', 'email')),
  owner_name text,
  on_date date not null,
  progress int not null default 0 check (progress between 0 and 100),
  created_at timestamptz not null default now()
);

create table presales.task (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  opportunity_id uuid not null references presales.opportunity(id),
  title text not null,
  owner_name text,
  due date,
  status text not null default 'to-start' check (status in ('to-start', 'in-progress', 'on-hold', 'done')),
  created_at timestamptz not null default now()
);

-- Risks, issues, assumptions and decisions. Health is calculated from these, never typed.
create table presales.risk (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  opportunity_id uuid not null references presales.opportunity(id),
  kind text not null check (kind in ('risk', 'issue', 'assumption', 'decision')),
  title text not null,
  impact text not null default 'medium' check (impact in ('low', 'medium', 'high')),
  owner_name text,
  status text not null default 'open' check (status in ('open', 'agreed', 'closed')),
  decided_on date,
  created_at timestamptz not null default now()
);

-- Opportunities an agent found (025 inbox agent). Nothing is added until a person accepts one.
create table presales.suggestion (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  client_name text not null,
  title text not null,
  summary text not null,
  value_amount numeric(19,4) not null check (value_amount >= 0),
  value_currency char(3) not null check (value_currency ~ '^[A-Z]{3}$'),
  owner_name text,
  source text not null,
  source_label text not null,
  found_at timestamptz not null default now(),
  status text not null default 'open' check (status in ('open', 'accepted', 'dismissed')),
  opportunity_id uuid references presales.opportunity(id),
  decided_by text,
  decided_at timestamptz
);

-- Month-end pipeline totals for the chart; the current month is always computed live.
create table presales.pipeline_snapshot (
  tenant_id uuid not null references core.tenant(id),
  month date not null check (extract(day from month) = 1),
  total_usd numeric(19,4) not null,
  weighted_usd numeric(19,4) not null,
  -- When the figure was read, so a run that happened after the 1st can be told apart in the data.
  taken_at timestamptz not null default now(),
  primary key (tenant_id, month)
);

create index on presales.opportunity (tenant_id, stage) where removed_at is null;
create index on presales.stage_change (opportunity_id, at);
create index on presales.activity (opportunity_id);
create index on presales.task (opportunity_id);
create index on presales.risk (opportunity_id);

select core.enable_tenant_rls('presales.client');
select core.enable_tenant_rls('presales.fx_rate');
select core.enable_tenant_rls('presales.opportunity');
select core.enable_tenant_rls('presales.stage_change');
select core.enable_tenant_rls('presales.activity');
select core.enable_tenant_rls('presales.task');
select core.enable_tenant_rls('presales.risk');
select core.enable_tenant_rls('presales.suggestion');
select core.enable_tenant_rls('presales.pipeline_snapshot');
grant select, insert, update on all tables in schema presales to amax_app;
