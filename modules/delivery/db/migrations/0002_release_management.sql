-- 042 release management: environments belong to a project (a project may stop at Dev, or call its
-- last stage Staging), at most one is Prod, and deployments can be voided with a reason.
alter table delivery.environment no force row level security;
alter table delivery.deployment no force row level security;

alter table delivery.environment add column project_id uuid references delivery.project(id);

insert into delivery.environment (tenant_id, project_id, name, position, is_prod)
select p.tenant_id, p.id, e.name, e.position, e.is_prod
from delivery.project p join delivery.environment e on e.tenant_id = p.tenant_id and e.project_id is null;

update delivery.deployment d set environment_id = pe.id
from delivery.environment te, delivery.release r, delivery.environment pe
where d.environment_id = te.id and te.project_id is null and r.id = d.release_id and pe.project_id = r.project_id and pe.name = te.name;

delete from delivery.environment where project_id is null;
alter table delivery.environment drop constraint environment_tenant_id_name_key;
alter table delivery.environment alter column project_id set not null;
alter table delivery.environment add constraint environment_project_name unique (project_id, name);
create unique index environment_one_prod on delivery.environment (project_id) where is_prod;

alter table delivery.deployment add column voided_at timestamptz;
alter table delivery.deployment add column void_reason text;
alter table delivery.deployment add column voided_by text;

alter table delivery.environment force row level security;
alter table delivery.deployment force row level security;
