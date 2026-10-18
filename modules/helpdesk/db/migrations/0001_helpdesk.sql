-- 022 helpdesk: queues per team with separate response and resolution targets per priority, tickets
-- from chat, Teams and email, each ticket's events and rating, and the catalogue of resources whose
-- owner approves an access request. HR tickets are read only by holders of helpdesk:queue:hr.
create schema helpdesk;
grant usage on schema helpdesk to amax_app;

create table helpdesk.queue (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  key text not null check (key in ('it', 'hr', 'facilities')),
  name text not null,
  prefix text not null check (prefix ~ '^[A-Z]{2,5}$'),
  next_no int not null default 1,
  unique (tenant_id, key)
);

create table helpdesk.sla (
  tenant_id uuid not null references core.tenant(id),
  queue_id uuid not null references helpdesk.queue(id),
  priority text not null check (priority in ('low', 'normal', 'high', 'urgent')),
  response_minutes int not null check (response_minutes between 1 and 10080),
  resolution_minutes int not null check (resolution_minutes between 1 and 43200),
  primary key (tenant_id, queue_id, priority),
  check (resolution_minutes >= response_minutes)
);

-- `signed_in`: the requester raised it themselves in chat or Teams. Email never counts (AC-2).
-- `handled_by` is "user:<id>" or "agent:helpdesk.support"; names are read from the person, never stored.
create table helpdesk.ticket (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  queue_id uuid not null references helpdesk.queue(id),
  number text not null,
  title text not null check (length(title) between 3 and 200),
  body text check (length(body) <= 4000),
  category text not null default 'Other' check (category in ('Access', 'Hardware', 'Network', 'Software', 'HR letters', 'Payroll', 'Facilities', 'Other')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'open' check (status in ('open', 'waiting', 'resolved', 'closed')),
  channel text not null check (channel in ('chat', 'teams', 'email')),
  source_link text check (source_link like 'https://%'),
  requester_user_id uuid,
  signed_in boolean not null default false,
  needs_verification boolean not null default false,
  note text check (length(note) <= 300),
  resolution text check (length(resolution) <= 500),
  handled_by text,
  created_by text not null,
  origin text,
  origin_ref text,
  suggestion_id uuid,
  opened_at timestamptz not null default now(),
  first_response_at timestamptz,
  triaged_at timestamptz,
  closed_at timestamptz,
  unique (tenant_id, number),
  unique (tenant_id, origin, origin_ref)
);
create index ticket_queue_idx on helpdesk.ticket (tenant_id, queue_id, status, opened_at desc);
create index ticket_closed_idx on helpdesk.ticket (tenant_id, closed_at);

create table helpdesk.ticket_event (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  ticket_id uuid not null references helpdesk.ticket(id) on delete cascade,
  kind text not null check (kind in ('opened', 'triaged', 'assigned', 'waiting', 'resolved', 'reopened', 'rated', 'suggested')),
  done_by text not null,
  detail jsonb not null default '{}',
  at timestamptz not null default now(),
  ticket_closed_at timestamptz
);
create index ticket_event_idx on helpdesk.ticket_event (tenant_id, ticket_id, at);

create table helpdesk.rating (
  tenant_id uuid not null references core.tenant(id),
  ticket_id uuid primary key references helpdesk.ticket(id) on delete cascade,
  score int not null check (score between 1 and 5),
  rated_at timestamptz not null default now()
);

create table helpdesk.access_resource (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  key text not null check (key ~ '^[a-z0-9][a-z0-9-]{1,59}$'),
  name text not null check (length(name) between 2 and 120),
  owner_user_id uuid not null,
  set_at timestamptz not null default now(),
  unique (tenant_id, key)
);

-- The demo's pinned clock, so SLA time left and the month's figures don't follow the wall clock.
create table helpdesk.clock_pin (
  tenant_id uuid primary key references core.tenant(id),
  now_at timestamptz not null
);

select core.enable_tenant_rls('helpdesk.queue');
select core.enable_tenant_rls('helpdesk.sla');
select core.enable_tenant_rls('helpdesk.ticket');
select core.enable_tenant_rls('helpdesk.ticket_event');
select core.enable_tenant_rls('helpdesk.rating');
select core.enable_tenant_rls('helpdesk.access_resource');
select core.enable_tenant_rls('helpdesk.clock_pin');
grant select, insert, update, delete on all tables in schema helpdesk to amax_app;
