-- 041: weekly roll-ups for the charts: the portfolio's "Tasks done per week" (planned vs done) and
-- Proposals' "Shipped to Prod per week". Fixtures seed them; 008 ingestion will write them from task
-- and deployment events. project_id null = the whole portfolio.
create table delivery.weekly_stat (
  tenant_id uuid not null references core.tenant(id),
  project_id uuid references delivery.project(id),
  week date not null,
  planned int not null default 0,
  done int not null default 0,
  shipped int not null default 0,
  unique nulls not distinct (tenant_id, project_id, week)
);
select core.enable_tenant_rls('delivery.weekly_stat');
grant select, insert, update, delete on delivery.weekly_stat to amax_app;

-- 041: the project page's sprint line ("Sprint 18 runs Mon Oct 12 to Fri Oct 23").
alter table delivery.project add column sprint_start date;
alter table delivery.project add column sprint_end date;
