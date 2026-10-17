-- 033 AI gateway: per-tenant AI policy and a log of every model call (metadata only, never content).
create schema ai;
grant usage on schema ai to amax_app;

create table ai.settings (
  tenant_id uuid primary key references core.tenant(id),
  enabled boolean not null default true,
  provider text not null default 'anthropic',
  provider_region text,
  zdr_required boolean not null default true,
  zdr_confirmed boolean not null default false,
  -- 002 sensitivity classes that may be sent to the provider; everything else is redacted.
  allowed_classes text[] not null default '{}',
  voice_enabled boolean not null default false,
  voice_service text not null default 'browser',
  data_region text,
  db_region text,
  storage_region text,
  ai_region text,
  policy_version int not null default 1,
  updated_at timestamptz not null default now()
);

create table ai.call (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  at timestamptz not null default now(),
  caller text not null,
  source text not null,
  purpose text not null,
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cost_usd numeric(12,6) not null default 0,
  redactions jsonb not null default '{}',
  injection_suspected boolean not null default false,
  tools_run text[] not null default '{}',
  ok boolean not null,
  error text
);
create index call_tenant_at on ai.call (tenant_id, at);

select core.enable_tenant_rls('ai.settings');
select core.enable_tenant_rls('ai.call');
grant select, insert, update on ai.settings to amax_app;
grant select, insert on ai.call to amax_app;
