-- Review round 10.
-- 1. Cards stored before createdAt existed get their conversation's created_at: no later than the
--    card itself, so they expire no later than they should, never after their key record is pruned.
-- 2. "I confirmed" notes written before round 9 held the write's full result, which the model reads
--    back. They're cut to the confirmation itself.
alter table chat.conversation no force row level security;
update chat.conversation c set pending = (
  select coalesce(jsonb_agg(case when p ? 'createdAt' then p else p || jsonb_build_object('createdAt', to_jsonb(c.created_at)) end order by i), '[]'::jsonb)
  from jsonb_array_elements(c.pending) with ordinality e(p, i))
where exists (select 1 from jsonb_array_elements(c.pending) p where not p ? 'createdAt');
update chat.conversation c set messages = (
  select jsonb_agg(case when m->'content'->0->>'text' ~ '^\(I confirmed ".*"\. Result: '
    then jsonb_set(m, '{content,0,text}', to_jsonb(regexp_replace(m->'content'->0->>'text', '\. Result: .*$', '.)')))
    else m end order by i)
  from jsonb_array_elements(c.messages) with ordinality e(m, i))
where c.messages::text like '%. Result: %';
alter table chat.conversation force row level security;
