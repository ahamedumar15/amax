-- 059: when an environment or a proposal was made, as releases already record. Chat moves a pin
-- saved under a name (an environment's name, a proposal's key) onto its record's id, and a row made
-- after the pin was saved can't be the one it meant: the name was reused after a rename or a rekey.
-- Rows made before this migration keep null (not known), not the migration's time.
alter table delivery.environment add column created_at timestamptz;
alter table delivery.environment alter column created_at set default now();
alter table delivery.proposal add column created_at timestamptz;
alter table delivery.proposal alter column created_at set default now();
