-- Review round 8: idempotency records hold only a replay record (resource id and key) and are
-- pruned after 30 days by core.idempotency.prune, which needs delete and an index on age.
grant delete on core.idempotency to amax_app;
create index idempotency_age on core.idempotency (created_at);
