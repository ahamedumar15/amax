-- 031 secrets: tenant connector credentials under envelope encryption. Postgres holds ciphertext
-- only: each tenant's data key is stored wrapped by the KMS, and each value is sealed with it.
create schema secrets;
grant usage on schema secrets to amax_app;

create table secrets.data_key (
  tenant_id uuid primary key references core.tenant(id),
  kms text not null,
  key_ref text not null,
  wrapped text not null,
  created_at timestamptz not null default now()
);

create table secrets.credential (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  connector text not null,
  expires_at timestamptz,
  warned_days int,
  revoked_at timestamptz,
  revoke_reason text,
  last_used_at timestamptz,
  last_used_by text,
  last_used_purpose text,
  created_at timestamptz not null default now(),
  unique (tenant_id, connector)
);

create table secrets.version (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  credential_id uuid not null references secrets.credential(id),
  version int not null,
  ciphertext text,
  created_at timestamptz not null default now(),
  created_by text not null,
  valid_until timestamptz,
  revoked_at timestamptz,
  unique (credential_id, version),
  check ((revoked_at is null) = (ciphertext is not null))
);

select core.enable_tenant_rls('secrets.data_key');
select core.enable_tenant_rls('secrets.credential');
select core.enable_tenant_rls('secrets.version');
grant select, insert on secrets.data_key to amax_app;
grant select, insert, update on secrets.credential to amax_app;
grant select, insert, update on secrets.version to amax_app;
