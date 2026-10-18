create schema notifications;
grant usage on schema notifications to amax_app;

-- One notification per event per person (030 AC-5): a redelivered event or a second rule never repeats it.
create table notifications.notification (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  user_id uuid not null references auth.user(id),
  event_id uuid not null,
  rule_id text not null,
  module text not null,
  module_title text not null,
  category text not null,
  urgency text not null default 'normal' check (urgency in ('normal', 'urgent')),
  title text not null,
  body text,
  href text,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (tenant_id, event_id, user_id)
);
create index notification_inbox_idx on notifications.notification (tenant_id, user_id, read_at, created_at desc);

-- What was sent, to whom and on which channel. The address is looked up at send time, never stored.
create table notifications.delivery (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  notification_id uuid not null references notifications.notification(id) on delete cascade,
  user_id uuid not null references auth.user(id),
  channel text not null check (channel in ('email', 'teams')),
  adapter text,
  status text not null check (status in ('pending', 'digest', 'sent', 'failed', 'skipped')),
  not_before timestamptz not null default now(),
  attempts int not null default 0,
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (notification_id, channel)
);
create index delivery_digest_idx on notifications.delivery (tenant_id, status) where status = 'digest';

-- No row means the defaults: email on, Teams off, no digest. The bell always shows new items.
create table notifications.preference (
  tenant_id uuid not null references core.tenant(id),
  user_id uuid not null references auth.user(id),
  category text not null,
  email boolean not null,
  teams boolean not null,
  digest boolean not null,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, user_id, category)
);

-- Read in the person's legal entity's time zone.
create table notifications.quiet_hours (
  tenant_id uuid not null references core.tenant(id),
  user_id uuid not null references auth.user(id),
  starts time not null,
  ends time not null,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, user_id),
  check (starts <> ends)
);

select core.enable_tenant_rls('notifications.notification');
select core.enable_tenant_rls('notifications.delivery');
select core.enable_tenant_rls('notifications.preference');
select core.enable_tenant_rls('notifications.quiet_hours');
grant select, insert, update, delete on all tables in schema notifications to amax_app;
