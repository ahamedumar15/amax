-- 004 MCP gateway: amax as the OAuth 2.1 authorization server for its MCP resource.
-- Clients register themselves (RFC 7591) before any tenant is known, so they're global.
create table auth.oauth_client (
  id text primary key,
  name text not null,
  redirect_uris text[] not null,
  created_at timestamptz not null default now()
);
grant select, insert on auth.oauth_client to amax_app;

create table auth.oauth_code (
  code_hash text primary key,
  tenant_id uuid not null references core.tenant(id),
  user_id uuid not null references auth.user(id) on delete cascade,
  client_id text not null references auth.oauth_client(id),
  redirect_uri text not null,
  scopes text[] not null,
  resource text not null,
  code_challenge text not null,
  expires_at timestamptz not null,
  used_at timestamptz
);
select core.enable_tenant_rls('auth.oauth_code');
grant select, insert, update on auth.oauth_code to amax_app;

-- MCP access tokens are api_token rows (kind 'mcp') with scopes, the client and the audience.
alter table auth.api_token add column scopes text[] not null default '{read,write,sensitive}';
alter table auth.api_token add column client_id text references auth.oauth_client(id);
alter table auth.api_token add column audience text;
alter table auth.api_token add column refresh_hash text unique;
alter table auth.api_token add column refresh_expires_at timestamptz;

grant select on auth.oauth_code to amax_lookup;
create policy lookup_read on auth.oauth_code for select to amax_lookup using (true);

-- Token exchange and refresh happen before the tenant is known.
create function auth.lookup_oauth_code(p_hash text) returns uuid
language sql stable security definer set search_path = auth, pg_temp as $$
  select tenant_id from auth.oauth_code where code_hash = p_hash
$$;
create function auth.lookup_refresh(p_hash text) returns table (tenant_id uuid, id uuid)
language sql stable security definer set search_path = auth, pg_temp as $$
  select tenant_id, id from auth.api_token where refresh_hash = p_hash
$$;
alter function auth.lookup_oauth_code(text) owner to amax_lookup;
alter function auth.lookup_refresh(text) owner to amax_lookup;
revoke all on function auth.lookup_oauth_code(text), auth.lookup_refresh(text) from public;
grant execute on function auth.lookup_oauth_code(text), auth.lookup_refresh(text) to amax_app;
