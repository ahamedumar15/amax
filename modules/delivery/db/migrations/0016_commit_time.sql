-- 008 AC-6: drafting timesheet hours from commits is off until an Admin switches it on for a legal
-- entity, after its people were told (notified_at). Commit data drafts timesheets only.
create table delivery.commit_time (
  tenant_id uuid not null references core.tenant(id),
  legal_entity_id uuid not null references core.legal_entity(id),
  enabled boolean not null,
  notified_at timestamptz,
  set_by text not null,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, legal_entity_id)
);
select core.enable_tenant_rls('delivery.commit_time');
grant select, insert, update on delivery.commit_time to amax_app;
