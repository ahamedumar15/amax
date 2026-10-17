-- 035 public API, signed webhooks and rate limits. Service principals stay in auth (002); their
-- client-credentials access tokens join them there. Webhooks, inbound verification and rate-limit
-- counts live in the api schema.
create table auth.principal_token (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  principal_id uuid not null references auth.service_principal(id),
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
select core.enable_tenant_rls('auth.principal_token');
grant select, insert, delete on auth.principal_token to amax_app;
grant select on auth.principal_token to amax_lookup;
create policy lookup_read on auth.principal_token for select to amax_lookup using (true);

create or replace function auth.lookup_token(p_hash text) returns table (tenant_id uuid, kind text, id uuid)
language sql stable security definer set search_path = auth, pg_temp as $$
  select tenant_id, kind, id from auth.api_token where token_hash = p_hash
  union all
  select tenant_id, 'principal', id from auth.service_principal where token_hash = p_hash
  union all
  select tenant_id, 'principal', principal_id from auth.principal_token where token_hash = p_hash and expires_at > now()
$$;

create schema api;
grant usage on schema api to amax_app;

create table api.webhook (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  name text not null,
  url text not null check (url like 'https://%'),
  events text[] not null,
  status text not null default 'active' check (status in ('active', 'off', 'removed')),
  failures int not null default 0,
  off_reason text,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table api.delivery (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  webhook_id uuid not null references api.webhook(id),
  event_id uuid not null,
  event text not null,
  ok boolean not null,
  attempts int not null,
  response_status int,
  delivered_at timestamptz not null default now(),
  unique (webhook_id, event_id)
);
create index delivery_at on api.delivery (tenant_id, delivered_at);

create table api.inbound (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  provider text not null,
  event_id text,
  verified boolean not null,
  reason text,
  received_at timestamptz not null default now()
);
create unique index inbound_dedupe on api.inbound (tenant_id, provider, event_id) where verified;
create index inbound_at on api.inbound (tenant_id, received_at);

create table api.rate_limited (
  tenant_id uuid not null references core.tenant(id),
  hour timestamptz not null,
  channel text not null,
  subject text not null,
  count int not null,
  primary key (tenant_id, hour, channel, subject)
);

select core.enable_tenant_rls('api.webhook');
select core.enable_tenant_rls('api.delivery');
select core.enable_tenant_rls('api.inbound');
select core.enable_tenant_rls('api.rate_limited');
grant select, insert, update on api.webhook, api.delivery, api.inbound, api.rate_limited to amax_app;
grant delete on api.inbound, api.rate_limited, api.delivery to amax_app;
