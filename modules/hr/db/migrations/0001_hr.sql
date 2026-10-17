-- 011 hr: people records. Pay fields are class 'pay', bank details 'bank'; each document has its own class.
create schema hr;
grant usage on schema hr to amax_app;

create table hr.person (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  user_id uuid references auth.user(id),
  legal_entity_id uuid not null references core.legal_entity(id),
  employee_no text not null,
  name text not null,
  initials text not null,
  title text not null,
  work_email text,
  location text,
  status text not null default 'active' check (status in ('joining', 'active', 'left')),
  joined_on date,
  left_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, employee_no),
  unique (tenant_id, user_id)
);

create table hr.employment (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  person_id uuid not null references hr.person(id),
  legal_entity_id uuid not null references core.legal_entity(id),
  department text not null,
  grade text,
  manager_person_id uuid references hr.person(id),
  contract text not null default 'permanent' check (contract in ('permanent', 'fixed-term', 'contractor', 'intern')),
  fte numeric(3,2) not null default 1 check (fte > 0 and fte <= 1),
  starts_on date not null,
  ends_on date,
  next_review date,
  currency char(3) not null default 'LKR',
  base_salary numeric(19,4),
  epf_number text,
  bank_name text,
  bank_account text,
  updated_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on),
  unique (person_id, starts_on)
);
create index employment_person on hr.employment (person_id, starts_on);
create index employment_manager on hr.employment (manager_person_id);

create table hr.document (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  person_id uuid not null references hr.person(id),
  title text not null,
  class text not null default 'personal' check (class in ('personal', 'pay', 'health', 'bank', 'performance', 'candidate')),
  status text not null default 'signed' check (status in ('signed', 'received', 'requested', 'missing')),
  dated_on date,
  file_ref text,
  updated_at timestamptz not null default now()
);
create index document_person on hr.document (person_id);

create table hr.probation (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  person_id uuid not null references hr.person(id),
  ends_on date not null,
  status text not null default 'open' check (status in ('open', 'passed', 'extended', 'failed')),
  outcome_note text,
  updated_at timestamptz not null default now()
);
create index probation_person on hr.probation (person_id);

select core.enable_tenant_rls('hr.person');
select core.enable_tenant_rls('hr.employment');
select core.enable_tenant_rls('hr.document');
select core.enable_tenant_rls('hr.probation');
grant select, insert, update, delete on all tables in schema hr to amax_app;
