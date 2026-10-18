create schema inbox_agent;
grant usage on schema inbox_agent to amax_app;

-- Admin consent in Entra for the amax app (Mail.Read, ChannelMessage.Read.All), as an Admin recorded
-- it. `sandbox`: the built-in fictional tenant the demo reads, so demo data never calls Graph. The
-- Graph app credential is the 031 `msgraph-read` secret, never stored here.
create table inbox_agent.consent (
  tenant_id uuid primary key references core.tenant(id),
  entra_tenant_id text,
  sandbox boolean not null default false,
  granted boolean not null,
  recorded_by text not null,
  recorded_at timestamptz not null default now(),
  check (sandbox or entra_tenant_id is not null)
);

-- The allow-list: the only mailboxes and Teams channels the agent reads. A channel's address is
-- "<team id>/<channel id>". `acts_for` is the person the agent works for on what it finds there.
create table inbox_agent.source (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  kind text not null check (kind in ('mailbox', 'channel')),
  address text not null,
  label text not null,
  acts_for text not null,
  allowed_by text not null,
  allowed_at timestamptz not null default now(),
  removed_by text,
  removed_at timestamptz,
  read_until timestamptz
);
create unique index source_live_idx on inbox_agent.source (tenant_id, kind, lower(address)) where removed_at is null;

-- One hourly scan: how many messages it read and how it ended.
create table inbox_agent.scan (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  started_at timestamptz not null,
  finished_at timestamptz not null default now(),
  status text not null check (status in ('completed', 'failed', 'skipped')),
  messages int not null default 0,
  failure text,
  started_by text not null
);
create index scan_finished_idx on inbox_agent.scan (tenant_id, finished_at desc);

-- One message the agent read: only an excerpt and a link to it (AC-5), never the sender, subject or
-- body. `message_ref` is a hash of Graph's id, so a message is read once. Deleted 30 days after the
-- find closes or its suggestion expires (032).
create table inbox_agent.find (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  source_id uuid not null references inbox_agent.source(id),
  scan_id uuid references inbox_agent.scan(id) on delete set null,
  message_ref text not null,
  received_at timestamptz not null,
  excerpt text not null check (length(excerpt) <= 300),
  link text check (link like 'https://%'),
  acts_for text not null,
  status text not null default 'new' check (status in ('new', 'suggested', 'nothing', 'added', 'dismissed')),
  record_type text,
  fields jsonb,
  confidence real check (confidence between 0 and 1),
  suggestion_id uuid,
  found_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  closed_at timestamptz,
  unique (tenant_id, source_id, message_ref)
);
create index find_status_idx on inbox_agent.find (tenant_id, status, received_at desc);

select core.enable_tenant_rls('inbox_agent.consent');
select core.enable_tenant_rls('inbox_agent.source');
select core.enable_tenant_rls('inbox_agent.scan');
select core.enable_tenant_rls('inbox_agent.find');
grant select, insert, update, delete on all tables in schema inbox_agent to amax_app;
