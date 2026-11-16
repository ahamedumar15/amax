-- 108: one GitHub login holds every email GitHub verified for it, and each email is one person's per provider.
alter table auth.git_identity drop constraint if exists git_identity_tenant_id_provider_login_key;
create unique index git_identity_login_email on auth.git_identity (tenant_id, provider, lower(login), lower(coalesce(email, '')));
create unique index git_identity_email on auth.git_identity (tenant_id, provider, lower(email)) where email is not null;
