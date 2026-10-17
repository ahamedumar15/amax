-- 049 chat history: a title from the first message, an archive flag, and the pins the person had
-- in context, so a past chat can be listed, searched and reopened as it was.
alter table chat.conversation
  add column title text,
  add column archived_at timestamptz,
  add column pins jsonb not null default '[]';

-- Existing rows: the title is the first message, whitespace collapsed and cut to 80 characters (the
-- engine's rule). A conversation with no messages was never shown, so it's archived as it stands.
alter table chat.conversation no force row level security;
update chat.conversation set title = left(btrim(regexp_replace(messages->0->'content'->0->>'text', '\s+', ' ', 'g')), 80)
where title is null and messages->0->>'role' = 'user' and messages->0->'content'->0->>'type' = 'text';
update chat.conversation set archived_at = updated_at where archived_at is null and jsonb_array_length(messages) = 0;
alter table chat.conversation force row level security;

create index conversation_history on chat.conversation (tenant_id, user_id, updated_at desc) where archived_at is null;
