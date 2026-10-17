-- 042 follow-up: projects that had no tenant-wide environments to copy (e.g. one created by the
-- 039 sync on a tenant without fixtures) get the defaults, like any new project.
alter table delivery.environment no force row level security;
insert into delivery.environment (tenant_id, project_id, name, position, is_prod)
select p.tenant_id, p.id, d.name, d.position, d.name = 'Prod'
from delivery.project p
cross join (values ('Dev', 1), ('QA', 2), ('UAT', 3), ('Prod', 4)) as d(name, position)
where not exists (select 1 from delivery.environment e where e.project_id = p.id);
alter table delivery.environment force row level security;
