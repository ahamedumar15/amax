-- 108: one GitHub login holds every email GitHub verified for it, and each email is one person's per provider.
alter table auth.git_identity drop constraint if exists git_identity_tenant_id_provider_login_key;

-- Review round 1: rows the old rule (unique on the login, case-sensitive) allowed would stop the new indexes. Of rows
-- with the same email per provider, or the same login and email in another case, one stays: the verified one first,
-- then any (the table records no creation time); each one dropped is named in the migration's notices.
do $$
declare r record;
begin
  for r in
    with ranked as (
      select ctid, tenant_id, provider, login, email,
        row_number() over (partition by tenant_id, provider, lower(email) order by email_verified desc, ctid) as by_email,
        row_number() over (partition by tenant_id, provider, lower(login), lower(coalesce(email, '')) order by email_verified desc, ctid) as by_login
      from auth.git_identity)
    delete from auth.git_identity g using ranked x
    where g.ctid = x.ctid and ((x.email is not null and x.by_email > 1) or x.by_login > 1)
    returning x.tenant_id, x.provider, x.login, x.email
  loop
    raise notice '0033: dropped duplicate git identity % % % (tenant %)', r.provider, r.login, coalesce(r.email, '-'), r.tenant_id;
  end loop;
end $$;

create unique index git_identity_login_email on auth.git_identity (tenant_id, provider, lower(login), lower(coalesce(email, '')));
create unique index git_identity_email on auth.git_identity (tenant_id, provider, lower(email)) where email is not null;
