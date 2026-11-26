-- 128: a completed release keeps the day it completed on, the day `completion` was judged by, so a later change of the
-- project's zone can't move the day away from its On time or Late.
alter table delivery.release add column completed_day date;

-- Releases completed before 128, in their project's zone now: the entity's own zone, else UTC. Release tracking (0025)
-- hadn't reached main, so these are dev and test rows only.
update delivery.release r set completed_day = (r.completed_at at time zone coalesce(
    (select z.timezone from delivery.project p join workflows.entity_zone z on z.legal_entity_id = p.legal_entity_id where p.id = r.project_id),
    'UTC'))::date
  where r.completed_at is not null;

alter table delivery.release drop constraint release_completed_whole;
alter table delivery.release add constraint release_completed_whole check (
  (status = 'completed') = (completed_at is not null and completed_day is not null and completion is not null and completing_deployment_id is not null)
  or status is null);
