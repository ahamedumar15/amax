-- Review round 4: what happened to each confirm card (actionId -> 'confirmed' | 'cancelled'), so a
-- retry after a lost reply can say "already done" or "already cancelled" instead of guessing.
alter table chat.conversation add column decided jsonb not null default '{}';
