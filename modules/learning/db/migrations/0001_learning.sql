-- 024 learning: programmes, who enrolled and how far they got, the hours they spent, the
-- certifications they hold (with expiry) and the reminders sent before one lapses.
-- People are hr.person ids; their names stay in hr.
create schema learning;
grant usage on schema learning to amax_app;

create table learning.programme (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  number int not null,
  title text not null,
  kind text not null check (kind in ('certification', 'workshop', 'compliance', 'leadership', 'course')),
  delivery text not null check (delivery in ('internal', 'external')),
  mandatory boolean not null default false,
  detail text,
  starts_on date not null,
  ends_on date,
  created_by text not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, number),
  check (ends_on is null or ends_on >= starts_on)
);

-- Progress is 0 to 100; completing an enrolment sets it to 100 and records the day.
create table learning.enrolment (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  programme_id uuid not null references learning.programme(id),
  person_id uuid not null,
  enrolled_on date not null,
  progress int not null default 0 check (progress between 0 and 100),
  completed_on date,
  enrolled_by text not null,
  completed_by text,
  unique (programme_id, person_id),
  check ((completed_on is null) = (progress < 100))
);

-- Hours spent on one day; the participation chart counts the people with hours in each month.
create table learning.attendance (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  enrolment_id uuid not null references learning.enrolment(id),
  on_date date not null,
  hours numeric(6,2) not null check (hours > 0 and hours <= 24)
);

create table learning.certification (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  person_id uuid not null,
  name text not null,
  issuer text,
  programme_id uuid references learning.programme(id),
  issued_on date not null,
  expires_on date,
  recorded_by text not null,
  check (expires_on is null or expires_on > issued_on)
);

-- A scheduled reminder goes once per window before the expiry; a person can ask for more.
create table learning.reminder (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  certification_id uuid not null references learning.certification(id),
  expires_on date not null,
  kind text not null check (kind in ('scheduled', 'manual')),
  window_days int,
  sent_at timestamptz not null default now(),
  requested_by text not null
);

create unique index on learning.reminder (certification_id, expires_on, window_days) where kind = 'scheduled';
create index on learning.enrolment (programme_id);
create index on learning.enrolment (person_id);
create index on learning.attendance (enrolment_id, on_date);
create index on learning.certification (tenant_id, expires_on);

select core.enable_tenant_rls('learning.programme');
select core.enable_tenant_rls('learning.enrolment');
select core.enable_tenant_rls('learning.attendance');
select core.enable_tenant_rls('learning.certification');
select core.enable_tenant_rls('learning.reminder');
grant select, insert, update on all tables in schema learning to amax_app;
