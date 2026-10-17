-- core.audit_event is append-only for everyone, not only the app role. An owner who disables this
-- trigger can still edit rows, which is why each row is also hash-chained (verifyAuditChain).
create function core.audit_append_only() returns trigger language plpgsql as $$
begin
  raise exception 'core.audit_event is append-only';
end $$;

create trigger audit_append_only before update or delete on core.audit_event
  for each row execute function core.audit_append_only();
create trigger audit_no_truncate before truncate on core.audit_event
  for each statement execute function core.audit_append_only();
