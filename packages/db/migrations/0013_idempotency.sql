-- Review round 7: idempotency keys for writes that may be retried (the chat's "Add it"). Recorded in
-- the same transaction as the write, with its result, so a retry can't write twice.
create table core.idempotency (
  tenant_id uuid not null references core.tenant(id),
  key text not null,
  outcome jsonb,
  created_at timestamptz not null default now(),
  primary key (tenant_id, key)
);
select core.enable_tenant_rls('core.idempotency');
grant select, insert, update on core.idempotency to amax_app;
