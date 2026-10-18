-- 062: the one repo a project's proposals sync from (normalised, e.g. github.com/example/portal), and
-- every push the amax plugin made, applied or refused, for the project's Repo sync card. Who pushed
-- stays an id, as in delivery.activity.
alter table delivery.project add column repo_url text check (repo_url is null or length(repo_url) between 3 and 300);
-- The commit time a proposal was last pushed from, kept apart from meta (which every sync replaces), so
-- a push from an older commit is refused whatever synced in between.
alter table delivery.proposal add column synced_commit_at timestamptz;

create table delivery.sync_push (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  project_id uuid not null references delivery.project(id),
  at timestamptz not null default now(),
  actor_id text not null,
  actor_kind text not null check (actor_kind in ('user', 'agent', 'service', 'system')),
  for_user_id uuid,
  repo_url text not null,
  ref text not null,
  sha text not null,
  committed_at timestamptz not null,
  outcome text not null check (outcome in ('applied', 'refused')),
  created int not null default 0,
  updated int not null default 0,
  unchanged int not null default 0,
  skipped jsonb not null default '[]',
  reason text
);
create index sync_push_recent on delivery.sync_push (tenant_id, project_id, at desc);
select core.enable_tenant_rls('delivery.sync_push');
-- update: erasure anonymises who pushed (retention rule in module.ts).
grant select, insert, update, delete on delivery.sync_push to amax_app;
