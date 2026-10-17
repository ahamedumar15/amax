-- Final review: environment names match without regard to case in every service, so the database
-- enforces the same: "Prod" and "prod" can't both exist in a project. Names that already differ only
-- by case (possible before, when names matched exactly) are merged first: the earliest-positioned
-- row is kept, its duplicates' deployments move to it, and it stays Prod if any of them was.
-- The migration runner applies each file in one transaction (packages/db/src/migrate.ts), which the
-- temporary table and the RLS off/on pair rely on: a failure rolls all of it back.
alter table delivery.environment no force row level security;
alter table delivery.deployment no force row level security;
create temporary table env_merge on commit drop as
  select e.id as dup, k.id as keep, e.is_prod as dup_prod from delivery.environment e
  join lateral (select k.id from delivery.environment k where k.project_id = e.project_id and lower(k.name) = lower(e.name) order by k.position, k.id limit 1) k on true
  where k.id <> e.id;
update delivery.deployment d set environment_id = m.keep from env_merge m where d.environment_id = m.dup;
delete from delivery.environment e using env_merge m where e.id = m.dup;
-- After the duplicates are gone, so the one-Prod-per-project constraint holds throughout.
update delivery.environment k set is_prod = true from env_merge m where k.id = m.keep and m.dup_prod;
alter table delivery.deployment force row level security;
alter table delivery.environment force row level security;
create unique index environment_name_ci on delivery.environment (project_id, lower(name));
