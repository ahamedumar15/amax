create schema git_accounts;
grant usage on schema git_accounts to amax_app;

-- 108 AC-2: a connect to GitHub is good once, for the person it was issued to, for 10 minutes. Only a hash of the state
-- is kept, so the row can't be used to finish someone's connect.
create table git_accounts.connect_state (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  user_id uuid not null references auth.user(id) on delete cascade,
  state_hash text not null unique,
  created_at timestamptz not null default now(),
  used_at timestamptz
);

select core.enable_tenant_rls('git_accounts.connect_state');
grant select, insert, update, delete on all tables in schema git_accounts to amax_app;
