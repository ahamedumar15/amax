-- 045: the record another module created a project from (presales' "presales.opportunity:OPP0042").
-- One project per reference per tenant, so a retried or racing create finds the project it made
-- instead of guessing from key, name and client.
alter table delivery.project add column source_ref text check (source_ref is null or length(source_ref) between 1 and 200);
create unique index project_source_ref_uq on delivery.project (tenant_id, source_ref) where source_ref is not null;
