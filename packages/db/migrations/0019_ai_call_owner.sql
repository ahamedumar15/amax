-- 048 chat cost: each model call names the person it ran for and the chat conversation, when there
-- is one. Both stay null for jobs. No foreign keys: ai.call becomes append-only (050), so deleting a
-- user or a conversation must never have to update or cascade into it.
alter table ai.call add column user_id uuid;
alter table ai.call add column conversation_id uuid;
create index call_tenant_user_at on ai.call (tenant_id, user_id, at);
create index call_tenant_conversation on ai.call (tenant_id, conversation_id) where conversation_id is not null;

-- Calls logged before this migration carry the person only in caller ("user:<id>"). The backfill
-- happens here, once, so no runtime code ever updates ai.call rows.
alter table ai.call no force row level security;
update ai.call c set user_id = u.id
from auth.user u
where c.user_id is null
  and c.caller ~* '^user:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and u.id = substring(c.caller from 6)::uuid
  and u.tenant_id = c.tenant_id;
alter table ai.call force row level security;
