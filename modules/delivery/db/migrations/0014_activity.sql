-- 008 AC-4: what agents, pipelines and people did through ingestion, for the Overview's Agent
-- activity feed. Who did it is kept as ids (the actor, and the person an agent or principal acted
-- for); names are read at display time, so an erased person leaves the feed with their name.
create table delivery.activity (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  at timestamptz not null default now(),
  actor_id text not null,
  actor_kind text not null check (actor_kind in ('user', 'agent', 'service', 'system')),
  for_user_id uuid,
  project_id uuid references delivery.project(id),
  text text not null,
  detail text
);
create index activity_recent on delivery.activity (tenant_id, at desc);
select core.enable_tenant_rls('delivery.activity');
grant select, insert on delivery.activity to amax_app;
