-- 006: an agent's output is a suggestion. A person accepts, queries or dismisses it; only acceptance
-- runs the change, through the owning module's service. Accepted changes keep what undo needs.
create schema agents;
grant usage on schema agents to amax_app;

create table agents.suggestion (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  kind text not null,
  target_type text not null,
  target_id text not null,
  target_label text not null,
  title text not null,
  detail text,
  proposed jsonb not null,
  evidence jsonb not null default '[]',
  confidence numeric(3, 2) not null check (confidence between 0 and 1),
  agent text not null,
  agent_name text not null,
  acts_for text,
  source_channel text not null default 'internal' check (source_channel in ('internal', 'email', 'teams', 'ticket', 'document')),
  source_label text,
  source_ref text,
  scope jsonb not null default '{}',
  run_id uuid,
  status text not null default 'open' check (status in ('open', 'queried', 'approved', 'accepting', 'accepted', 'undoing', 'undone', 'dismissed')),
  first_approved_by text,
  first_approved_at timestamptz,
  decided_by text,
  decided_at timestamptz,
  query_note text,
  applied jsonb,
  undo_until timestamptz,
  undone_by text,
  undone_at timestamptz,
  error text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index suggestion_status on agents.suggestion (tenant_id, status, expires_at);
create index suggestion_target on agents.suggestion (tenant_id, target_type, target_id);
select core.enable_tenant_rls('agents.suggestion');
grant select, insert, update, delete on agents.suggestion to amax_app;
