-- 021 it-access: what each person can use (Entra groups and admin roles, licence seats, devices),
-- licence spend, the sync runs that read it, and the access changes IT approved. Money is the 055
-- `pricing` class: only Admin sees it. No change here runs without a person accepting a 006 suggestion.
create schema it_access;
grant usage on schema it_access to amax_app;

-- A licensed product: Microsoft 365, Azure DevOps, GitHub Copilot, or a SaaS tool. `seat_usd` is the
-- monthly price of one seat (of the add-on alone when `unused_scope` says so); `monthly_usd` the bill.
create table it_access.product (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  key text not null,
  name text not null,
  source text not null check (source in ('graph', 'azure-devops', 'github', 'saas')),
  external_id text,
  logo text not null,
  color text not null,
  seats int not null check (seats >= 0),
  seat_usd numeric(10, 2) not null,
  monthly_usd numeric(12, 2) not null,
  unused_scope text,
  idle_rule text not null default 'idle' check (idle_rule in ('idle', 'never-used')),
  synced_at timestamptz,
  unique (tenant_id, key)
);

-- One sign-in identity: a person in hr, or a contractor who isn't (named here, with an expiry).
create table it_access.account (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  legal_entity_id uuid references core.legal_entity(id),
  person_id uuid,
  user_id uuid,
  display_name text not null,
  kind text not null check (kind in ('employee', 'contractor')),
  external_id text,
  admin_roles text[] not null default '{}',
  entra_groups int not null default 0 check (entra_groups >= 0),
  status text not null default 'active' check (status in ('active', 'left')),
  left_on date,
  expires_on date,
  reviewed_on date,
  reviewed_by text,
  unique (tenant_id, person_id)
);

-- A seat of a product held by an account. `last_active_on` is the last use the sync saw.
create table it_access.seat (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  product_id uuid not null references it_access.product(id),
  account_id uuid not null references it_access.account(id),
  assigned_on date not null,
  last_active_on date,
  removed_on date,
  removed_by text
);

create table it_access.device (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  account_id uuid references it_access.account(id),
  external_id text not null,
  name text not null,
  os text not null,
  compliant boolean not null,
  needs_update boolean not null default false,
  synced_at timestamptz,
  unique (tenant_id, external_id)
);

-- An access change a person approved (a 006 suggestion accepted): queued until its day, then made
-- through the write registration when the tenant consented to it, or left to IT by hand ('manual').
create table it_access.change (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  account_id uuid references it_access.account(id),
  product_id uuid references it_access.product(id),
  action text not null check (action in ('grant', 'revoke', 'remove-seat', 'restore')),
  detail jsonb not null default '{}',
  effective_on date not null,
  status text not null default 'queued' check (status in ('queued', 'applied', 'manual', 'cancelled', 'failed')),
  outcome text,
  approved_by text not null,
  approved_at timestamptz not null default now(),
  applied_at timestamptz
);

create table it_access.sync_run (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  source text not null,
  status text not null check (status in ('ok', 'failed', 'skipped')),
  summary text not null,
  started_at timestamptz not null,
  finished_at timestamptz not null default now(),
  started_by text not null
);

-- AC-1: the write registration is off until an Admin consents for this tenant, naming its scopes.
create table it_access.write_consent (
  tenant_id uuid primary key references core.tenant(id),
  enabled boolean not null default false,
  scopes text[] not null default '{}',
  consented_by text not null,
  consented_at timestamptz not null default now()
);

create index on it_access.seat (product_id) where removed_on is null;
create index on it_access.seat (account_id);
create index on it_access.device (account_id);
create index on it_access.change (status, effective_on);

select core.enable_tenant_rls('it_access.product');
select core.enable_tenant_rls('it_access.account');
select core.enable_tenant_rls('it_access.seat');
select core.enable_tenant_rls('it_access.device');
select core.enable_tenant_rls('it_access.change');
select core.enable_tenant_rls('it_access.sync_run');
select core.enable_tenant_rls('it_access.write_consent');
grant select, insert, update, delete on all tables in schema it_access to amax_app;
