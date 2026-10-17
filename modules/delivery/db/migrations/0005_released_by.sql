-- Review round 1: remember which deployment released a release's proposals, so voiding some other
-- record (a Dev deploy, or one on an environment that is no longer Prod) can't un-release them.
alter table delivery.deployment add column released boolean not null default false;

alter table delivery.deployment no force row level security;
update delivery.deployment d set released = true
from delivery.environment e
where e.id = d.environment_id and e.is_prod and d.status = 'deployed' and d.voided_at is null;
alter table delivery.deployment force row level security;
