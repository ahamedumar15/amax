-- 013 onboarding: checklist templates by legal entity and role, the checklist hr.person.joined or
-- left starts for a person, its tasks by owner, and the exit questionnaire link a leaver answers once.
-- People are hr.person ids; the name is kept on the checklist so IT, who can't read hr, sees who it is.
create schema onboarding;
grant usage on schema onboarding to amax_app;

-- A template applies to a legal entity and a role (department or job title); null means any. The
-- most specific match wins.
create table onboarding.template (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  kind text not null check (kind in ('joiner', 'leaver')),
  title text not null,
  legal_entity_id uuid references core.legal_entity(id),
  role text,
  created_at timestamptz not null default now()
);

-- `due_days`: days from the start (joining day, or last day) the task is due; negative is before.
create table onboarding.template_task (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  template_id uuid not null references onboarding.template(id),
  position int not null,
  title text not null,
  owner text not null check (owner in ('HR', 'ITAdmin', 'Manager')),
  due_days int not null default 0,
  unique (template_id, position)
);

create table onboarding.checklist (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  kind text not null check (kind in ('joiner', 'leaver')),
  person_id uuid not null,
  person_name text not null,
  employee_no text not null,
  job_title text,
  department text,
  legal_entity_id uuid not null references core.legal_entity(id),
  manager_user_id uuid,
  manager_name text,
  template_id uuid references onboarding.template(id),
  starts_on date not null,
  completed_on date,
  created_by text not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, kind, person_id)
);

-- A task goes to a role (owner_user_id null) or to one person, the manager. `access` marks the IT
-- task that carries a grant or revoke suggestion (013 AC-2); completing it changes nothing elsewhere.
create table onboarding.task (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  checklist_id uuid not null references onboarding.checklist(id),
  position int not null,
  title text not null,
  owner text not null check (owner in ('HR', 'ITAdmin', 'Manager')),
  owner_user_id uuid,
  access text check (access in ('grant', 'revoke')),
  due_on date not null,
  done_on date,
  completed_by text,
  note text,
  unique (checklist_id, position),
  check ((done_on is null) = (completed_by is null))
);

-- 013 AC-3: one link per leaver's checklist. Only a keyed digest of the token is kept; answering sets
-- answered_at, after which the link never works again.
create table onboarding.exit_link (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  checklist_id uuid not null unique references onboarding.checklist(id),
  person_id uuid not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  issued_by text not null,
  issued_at timestamptz not null default now(),
  answered_at timestamptz,
  answers jsonb
);

create index on onboarding.task (checklist_id);
create index on onboarding.task (tenant_id, due_on) where done_on is null;
create index on onboarding.checklist (tenant_id, starts_on);

select core.enable_tenant_rls('onboarding.template');
select core.enable_tenant_rls('onboarding.template_task');
select core.enable_tenant_rls('onboarding.checklist');
select core.enable_tenant_rls('onboarding.task');
select core.enable_tenant_rls('onboarding.exit_link');
grant select, insert, update on all tables in schema onboarding to amax_app;

-- The leaver opens their link signed out, before the tenant is known: the digest alone finds it,
-- like a bearer token (auth.lookup_token).
grant usage on schema onboarding to amax_lookup;
grant select on onboarding.exit_link to amax_lookup;
create policy lookup_read on onboarding.exit_link for select to amax_lookup using (true);
create function onboarding.lookup_exit_link(p_hash text) returns uuid
language sql stable security definer set search_path = onboarding, pg_temp as $$
  select tenant_id from onboarding.exit_link where token_hash = p_hash
$$;
alter function onboarding.lookup_exit_link(text) owner to amax_lookup;
revoke all on function onboarding.lookup_exit_link(text) from public;
grant execute on function onboarding.lookup_exit_link(text) to amax_app;
