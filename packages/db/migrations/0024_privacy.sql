do $$ begin
  if not exists (select from pg_roles where rolname = 'amax_privacy') then create role amax_privacy nologin; end if;
end $$;
grant amax_privacy to current_user;

create schema privacy;
grant usage on schema privacy to amax_app;

create table privacy.retention_period (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  rule text not null,
  legal_entity_id uuid references core.legal_entity(id),
  period text not null check (period ~ '^P(\d+Y)?(\d+M)?(\d+W)?(\d+D)?$' and period <> 'P'),
  set_by text not null,
  set_at timestamptz not null default now()
);
create unique index retention_period_rule on privacy.retention_period (tenant_id, rule, coalesce(legal_entity_id, '00000000-0000-0000-0000-000000000000'));

create table privacy.legal_hold (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  kind text not null check (kind in ('person', 'matter')),
  label text not null,
  subjects text[] not null check (cardinality(subjects) > 0),
  reason text not null,
  placed_by text not null,
  placed_at timestamptz not null default now(),
  released_by text,
  released_at timestamptz
);

create table privacy.request (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  kind text not null check (kind in ('access', 'erasure')),
  subject_user_id uuid,
  subject_label text not null,
  subject_key text not null,
  subjects text[] not null check (cardinality(subjects) > 0),
  status text not null default 'open' check (status in ('open', 'approved', 'completed', 'cancelled')),
  inventory jsonb not null default '[]',
  package jsonb,
  opened_by text not null,
  opened_at timestamptz not null default now(),
  approved_by text,
  completed_at timestamptz,
  erased int
);
create index request_open on privacy.request (tenant_id, status, opened_at desc);

create table privacy.purge_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  at timestamptz not null default now(),
  rule text not null,
  label text not null,
  class text not null,
  action text not null check (action in ('delete', 'anonymise')),
  n int not null check (n >= 0)
);
create index purge_log_at on privacy.purge_log (tenant_id, at);

select core.enable_tenant_rls('privacy.retention_period');
select core.enable_tenant_rls('privacy.legal_hold');
select core.enable_tenant_rls('privacy.request');
select core.enable_tenant_rls('privacy.purge_log');
grant select, insert, update, delete on privacy.retention_period to amax_app;
grant select, insert, update on privacy.legal_hold, privacy.request to amax_app;
grant select, insert, delete on privacy.purge_log to amax_app;

grant usage on schema core, privacy to amax_privacy;
grant select, update on privacy.request to amax_privacy;
grant execute on function core.erase_subject(text) to amax_privacy;

create function privacy.erase_request(request_id uuid) returns int language plpgsql security definer
set search_path = privacy, core, pg_temp as $$
declare
  r privacy.request;
  s text;
  n int := 0;
begin
  select * into r from privacy.request r0 where r0.id = request_id and r0.tenant_id = core.current_tenant() for update;
  if r.id is null or r.kind <> 'erasure' or r.status <> 'approved' then
    raise exception 'erase_request: % is not an approved erasure request', request_id;
  end if;
  if r.approved_by is null or r.approved_by = r.opened_by then
    raise exception 'erase_request: % needs a second person to approve it', request_id;
  end if;
  foreach s in array r.subjects loop
    n := n + core.erase_subject(s);
  end loop;
  return n;
end $$;
alter function privacy.erase_request(uuid) owner to amax_privacy;
revoke all on function privacy.erase_request(uuid) from public;
grant execute on function privacy.erase_request(uuid) to amax_app;
