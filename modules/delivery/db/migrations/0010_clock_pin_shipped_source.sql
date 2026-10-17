-- 041 review: "Shipped to Prod per week" counts proposal.released_at, the source "Released this
-- month" reads, so the roll-up's shipped column goes. A new migration, 0009 unchanged, and "if
-- exists" for a database migrated while the branch briefly had 0009 without it (review round 3).
alter table delivery.weekly_stat drop column if exists shipped;
comment on table delivery.weekly_stat is 'Weekly task roll-ups. project_id null = the portfolio''s own total, never the sum of the per-project rows.';

-- 041 review: "today" for a tenant's date windows (week charts, this month, the release map). A row
-- pins it, per tenant, as a validated date: the visual tests pin fixtures.md's Oct 16, 2026. No row =
-- the real date. Module data, not process environment (module standard: no host env in modules).
create table delivery.clock_pin (
  tenant_id uuid primary key references core.tenant(id),
  today date not null
);
select core.enable_tenant_rls('delivery.clock_pin');
grant select, insert, update, delete on delivery.clock_pin to amax_app;
