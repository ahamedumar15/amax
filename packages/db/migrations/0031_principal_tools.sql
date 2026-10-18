-- 008 AC-1: a service credential may be limited to named tools (CI: sync_proposal, mark_task_done,
-- record_deployment). Null keeps every tool its scopes allow, as before.
alter table auth.service_principal add column tools text[];
