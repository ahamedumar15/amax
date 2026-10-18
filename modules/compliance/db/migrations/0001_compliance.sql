create schema compliance;
grant usage on schema compliance to amax_app;

-- One row per policy version. A new version of the same key asks everyone in scope to acknowledge again.
create table compliance.policy (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  key text not null,
  title text not null,
  version int not null check (version > 0),
  summary text,
  legal_entity_id uuid references core.legal_entity(id),
  control text not null default 'A.5.1',
  published_on date not null,
  published_by text not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, key, version)
);

-- A person read and acknowledged one policy version.
create table compliance.acknowledgement (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  policy_id uuid not null references compliance.policy(id),
  person_id uuid not null references hr.person(id),
  user_id uuid references auth.user(id),
  acknowledged_at timestamptz not null default now(),
  unique (tenant_id, policy_id, person_id)
);

create table compliance.risk (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  ref text not null,
  title text not null,
  description text,
  likelihood int not null check (likelihood between 1 and 5),
  impact int not null check (impact between 1 and 5),
  level text not null check (level in ('low', 'medium', 'high')),
  owner_user_id uuid references auth.user(id),
  owner_name text,
  treatment text,
  status text not null default 'open' check (status in ('open', 'treating', 'accepted', 'closed')),
  review_on date,
  raised_by text not null,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, ref)
);

-- An incident. A possible personal-data breach starts its notification clock (notify_by) from the
-- country pack of its legal entity when it is flagged (aware_at).
create table compliance.incident (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  ref text not null,
  title text not null,
  description text,
  occurred_on date not null,
  legal_entity_id uuid references core.legal_entity(id),
  country char(2),
  owner_user_id uuid references auth.user(id),
  owner_name text,
  personal_data boolean not null default false,
  data_class text check (data_class in ('personal', 'pay', 'health', 'bank', 'performance', 'candidate')),
  impact text,
  breach boolean not null default false,
  aware_at timestamptz,
  notify_by timestamptz,
  pack_rule text,
  decision text check (decision in ('notify', 'no-notify')),
  decided_at timestamptz,
  decided_by text,
  notified_on date,
  reminded_on date,
  status text not null default 'reported' check (status in ('reported', 'assessing', 'contained', 'resolved')),
  resolved_on date,
  reported_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, ref)
);

-- Suppliers and subprocessors kept by hand. The platform's own (the 033 AI provider, the database
-- host) are read from the AI and data settings, so the two can never disagree.
create table compliance.supplier (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  name text not null,
  service text not null,
  data text,
  region text,
  subprocessor boolean not null default true,
  dpa_signed_on date,
  review_on date,
  status text not null default 'active' check (status in ('active', 'ended')),
  added_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, name)
);

-- Each verification of the 003 audit hash chain: how far it verified, or the row where it broke.
create table compliance.chain_check (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  checked_at timestamptz not null default now(),
  ok boolean not null,
  events bigint not null default 0,
  head_seq bigint,
  head_hash text,
  broken_at bigint,
  reason text,
  broken_action text,
  broken_resource text,
  source text not null
);
create index chain_check_latest on compliance.chain_check (tenant_id, checked_at desc);

-- A dated evidence bundle for one control, signed (HMAC-SHA256 over its canonical contents).
create table compliance.evidence_bundle (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  control text not null,
  title text not null,
  period_from date not null,
  period_to date not null,
  generated_at timestamptz not null default now(),
  generated_by text not null,
  contents jsonb not null,
  digest text not null,
  signature text not null
);

select core.enable_tenant_rls('compliance.policy');
select core.enable_tenant_rls('compliance.acknowledgement');
select core.enable_tenant_rls('compliance.risk');
select core.enable_tenant_rls('compliance.incident');
select core.enable_tenant_rls('compliance.supplier');
select core.enable_tenant_rls('compliance.chain_check');
select core.enable_tenant_rls('compliance.evidence_bundle');

grant select, insert, update, delete on all tables in schema compliance to amax_app;
