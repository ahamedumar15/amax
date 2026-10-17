-- Review round 2: regions became a closed list of codes (AU, LK, ...). Stored values written as free
-- text before that are mapped to their code when they name a known region. Anything else is left as
-- is: blockedReason reports it as unrecognised, so AI stays off until an Admin picks one.
-- The code/name table below is a snapshot of REGIONS in packages/ai/src/policy.ts as of this
-- migration. It is deliberately not kept in sync: later changes to REGIONS need their own migration.
alter table ai.settings no force row level security;
create function pg_temp.region_code(v text) returns text language sql immutable as $$
  select coalesce((select code from (values
    ('AU', 'australia'), ('LK', 'sri lanka'), ('US', 'united states'), ('EU', 'european union'),
    ('UK', 'united kingdom'), ('SG', 'singapore'), ('IN', 'india'), ('CA', 'canada')) r(code, name)
    where lower(trim(v)) in (lower(code), name)), v)
$$;
update ai.settings set
  data_region = pg_temp.region_code(data_region), db_region = pg_temp.region_code(db_region),
  storage_region = pg_temp.region_code(storage_region), ai_region = pg_temp.region_code(ai_region);
alter table ai.settings force row level security;
