-- 007 delivery: projects, specclaw proposals, releases moving through environments.
create schema delivery;
grant usage on schema delivery to amax_app;

create table delivery.project (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  legal_entity_id uuid references core.legal_entity(id),
  key text not null check (key ~ '^[A-Z][A-Z0-9]{1,9}$'),
  name text not null,
  client text not null,
  billing text not null check (billing in ('fixed', 't&m', 'retainer', 'internal')),
  manager_user_id uuid references auth.user(id),
  manager_name text,
  color text not null default 'violet',
  status text not null default 'active' check (status in ('active', 'closed')),
  sprint text,
  sprint_done int not null default 0,
  sprint_total int not null default 0,
  health text not null default 'on-track' check (health in ('on-track', 'at-risk', 'off-track')),
  risk_pct int,
  margin_pct numeric(5,1),
  contract_value numeric(19,4),
  invoiced numeric(19,4),
  currency char(3) not null default 'USD',
  next_release text,
  created_at timestamptz not null default now(),
  unique (tenant_id, key)
);

create table delivery.environment (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  name text not null,
  position int not null,
  is_prod boolean not null default false,
  unique (tenant_id, name)
);

create table delivery.release (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  project_id uuid not null references delivery.project(id),
  version text not null,
  created_at timestamptz not null default now(),
  unique (project_id, version)
);

create table delivery.proposal (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  project_id uuid not null references delivery.project(id),
  key text not null,
  title text not null,
  phase text not null default 'proposed' check (phase in ('proposed', 'planned', 'building', 'verified', 'released')),
  tasks_done int not null default 0,
  tasks_total int not null default 0,
  hours numeric(8,1) not null default 0,
  estimate_hours numeric(8,1),
  owner_name text,
  agent text,
  release_id uuid references delivery.release(id),
  released_at timestamptz,
  -- Set by sync sources (039 self-sync, 008 ingestion) so they can find their own rows again.
  source text,
  source_ref text,
  meta jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  unique (tenant_id, key)
);

create table delivery.deployment (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  release_id uuid not null references delivery.release(id),
  environment_id uuid not null references delivery.environment(id),
  status text not null check (status in ('deployed', 'testing', 'rolled-back')),
  at timestamptz not null default now(),
  note text,
  pipeline_run text,
  recorded_by text not null
);

select core.enable_tenant_rls('delivery.project');
select core.enable_tenant_rls('delivery.environment');
select core.enable_tenant_rls('delivery.release');
select core.enable_tenant_rls('delivery.proposal');
select core.enable_tenant_rls('delivery.deployment');
grant select, insert, update, delete on all tables in schema delivery to amax_app;
