-- Final review: environment names match without regard to case in every service, so the database
-- enforces the same: "Prod" and "prod" can't both exist in a project.
create unique index environment_name_ci on delivery.environment (project_id, lower(name));
