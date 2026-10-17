-- 002 identity and access: who the user is, their roles and data scopes, sessions and tokens.
-- Every table is tenant-owned with RLS. Lookups that must happen before the tenant is known
-- (sign-in, bearer tokens, SCIM) go through SECURITY DEFINER functions owned by amax_lookup,
-- a NOLOGIN role with read-only policies; they return ids, never secrets.

create schema auth;
grant usage on schema auth to amax_app;

create table auth.identity_provider (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  kind text not null default 'entra' check (kind in ('entra')),
  issuer text not null,
  directory_id text not null,
  client_id text not null,
  -- Where the client secret lives (env:NAME today, a 031 secret reference later). Never the secret.
  client_secret_ref text not null,
  created_at timestamptz not null default now(),
  unique (issuer, directory_id)
);

-- SCIM bearer tokens (hash only), one or more per tenant, independent of the sign-in method.
create table auth.scim_token (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table auth.role_mapping (
  tenant_id uuid not null references core.tenant(id),
  group_id text not null,
  role text not null check (role in ('Admin', 'Leadership', 'PM', 'Engineer', 'Finance', 'Sales', 'HR', 'Payroll', 'Employee')),
  primary key (tenant_id, group_id, role)
);

create table auth.user (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  external_id text,
  scim_id text,
  email text not null,
  name text not null,
  legal_entity_id uuid references core.legal_entity(id),
  department text,
  status text not null default 'active' check (status in ('active', 'deactivated')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, external_id),
  unique (tenant_id, email)
);

-- A person can hold several roles. Null scope arrays mean "every"; an empty array means "none".
create table auth.role_assignment (
  tenant_id uuid not null references core.tenant(id),
  user_id uuid not null references auth.user(id) on delete cascade,
  role text not null check (role in ('Admin', 'Leadership', 'PM', 'Engineer', 'Finance', 'Sales', 'HR', 'Payroll', 'Employee')),
  source text not null default 'group' check (source in ('group', 'manual')),
  legal_entity_ids uuid[],
  departments text[],
  primary key (tenant_id, user_id, role)
);

create table auth.git_identity (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  user_id uuid not null references auth.user(id) on delete cascade,
  provider text not null check (provider in ('github', 'azure-devops')),
  login text not null,
  email text,
  email_verified boolean not null default false,
  unique (tenant_id, provider, login)
);

create table auth.session (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  user_id uuid not null references auth.user(id) on delete cascade,
  -- View as: an Admin previewing another role. user_id stays the original user for audit.
  view_as_role text check (view_as_role in ('Admin', 'Leadership', 'PM', 'Engineer', 'Finance', 'Sales', 'HR', 'Payroll', 'Employee')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create table auth.api_token (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  user_id uuid not null references auth.user(id) on delete cascade,
  kind text not null check (kind in ('api', 'mcp')),
  name text not null,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create table auth.service_principal (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  name text not null,
  owner_user_id uuid not null references auth.user(id),
  scopes text[] not null,
  acts_for uuid[] not null default '{}',
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (tenant_id, name)
);

select core.enable_tenant_rls('auth.identity_provider');
select core.enable_tenant_rls('auth.scim_token');
select core.enable_tenant_rls('auth.role_mapping');
select core.enable_tenant_rls('auth.user');
select core.enable_tenant_rls('auth.role_assignment');
select core.enable_tenant_rls('auth.git_identity');
select core.enable_tenant_rls('auth.session');
select core.enable_tenant_rls('auth.api_token');
select core.enable_tenant_rls('auth.service_principal');

grant select, insert, update, delete on all tables in schema auth to amax_app;

do $$ begin
  if not exists (select from pg_roles where rolname = 'amax_lookup') then create role amax_lookup nologin; end if;
end $$;
grant amax_lookup to current_user;
grant usage on schema auth, core to amax_lookup;
grant select on auth.identity_provider, auth.api_token, auth.service_principal, auth.scim_token, core.tenant to amax_lookup;
create policy lookup_read on auth.identity_provider for select to amax_lookup using (true);
create policy lookup_read on auth.api_token for select to amax_lookup using (true);
create policy lookup_read on auth.service_principal for select to amax_lookup using (true);
create policy lookup_read on auth.scim_token for select to amax_lookup using (true);
create policy lookup_read on core.tenant for select to amax_lookup using (true);

-- Sign-in: which tenant owns this directory? Resolved from the token's issuer and tenant claim only.
create function auth.resolve_tenant(p_issuer text, p_directory_id text) returns table (tenant_id uuid, provider_id uuid)
language sql stable security definer set search_path = auth, pg_temp as $$
  select tenant_id, id from auth.identity_provider where issuer = p_issuer and directory_id = p_directory_id
$$;

-- The sign-in page and Auth.js need every tenant's provider config (no secrets, only references).
create function auth.list_providers() returns table (provider_id uuid, tenant_id uuid, tenant_name text, kind text, issuer text, directory_id text, client_id text, client_secret_ref text)
language sql stable security definer set search_path = auth, core, pg_temp as $$
  select p.id, p.tenant_id, t.name, p.kind, p.issuer, p.directory_id, p.client_id, p.client_secret_ref
  from auth.identity_provider p join core.tenant t on t.id = p.tenant_id order by t.name
$$;

-- Bearer tokens: which tenant and identity does this token hash belong to?
create function auth.lookup_token(p_hash text) returns table (tenant_id uuid, kind text, id uuid)
language sql stable security definer set search_path = auth, pg_temp as $$
  select tenant_id, kind, id from auth.api_token where token_hash = p_hash
  union all
  select tenant_id, 'principal', id from auth.service_principal where token_hash = p_hash
$$;

create function auth.lookup_scim(p_hash text) returns uuid
language sql stable security definer set search_path = auth, pg_temp as $$
  select tenant_id from auth.scim_token where token_hash = p_hash and revoked_at is null
$$;

alter function auth.resolve_tenant(text, text) owner to amax_lookup;
alter function auth.list_providers() owner to amax_lookup;
alter function auth.lookup_token(text) owner to amax_lookup;
alter function auth.lookup_scim(text) owner to amax_lookup;
revoke all on function auth.resolve_tenant(text, text), auth.list_providers(), auth.lookup_token(text), auth.lookup_scim(text) from public;
grant execute on function auth.resolve_tenant(text, text), auth.list_providers(), auth.lookup_token(text), auth.lookup_scim(text) to amax_app;
