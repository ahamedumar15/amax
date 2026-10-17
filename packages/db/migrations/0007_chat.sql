-- 005 amax chat: one conversation per user at a time, stored server-side so provider turns go back
-- unchanged and the browser can't forge tool results.
create schema chat;
grant usage on schema chat to amax_app;

create table chat.conversation (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  user_id uuid not null references auth.user(id) on delete cascade,
  messages jsonb not null default '[]',
  pending jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index conversation_user on chat.conversation (tenant_id, user_id, updated_at desc);

select core.enable_tenant_rls('chat.conversation');
grant select, insert, update, delete on chat.conversation to amax_app;
