-- Review round 1: each AI call records the policy version that decided redaction and blocking, and
-- the model id the provider actually returned. A model without a known price has an unknown cost.
alter table ai.call add column policy_version int;
alter table ai.call add column provider_model text;
alter table ai.call alter column cost_usd drop not null;
alter table ai.call alter column cost_usd drop default;
