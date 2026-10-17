-- Email + password sign-in, for deployments without an identity provider (e.g. the hosted demo).
-- Only a salted scrypt hash is stored. Repeated failures lock the account for a while.
alter table auth.user add column password_hash text;
alter table auth.user add column failed_logins int not null default 0;
alter table auth.user add column locked_until timestamptz;
