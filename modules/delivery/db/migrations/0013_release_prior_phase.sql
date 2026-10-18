-- 044 AC-1: the phase each proposal had before a Prod deployment released it, keyed by proposal id,
-- so voiding that deployment restores exactly it. Records made before this migration hold none; their
-- proposals go back to Verified, as before.
alter table delivery.deployment add column prior_phases jsonb not null default '{}'::jsonb;
