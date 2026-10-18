-- 066 career: the history that predates amax (AC-9), a per-person cutover after which the tree reads
-- live through other modules' contracts (AC-1), technology tags per person and project (AC-3), and
-- the tenant's pinned "today" (the demo's Oct 16).
create schema career;
grant usage on schema career to amax_app;

create table career.settings (
  tenant_id uuid primary key references core.tenant(id),
  today date
);

-- Events before `through` come from career.history; later ones from hr, allocations and learning.
create table career.import (
  tenant_id uuid not null references core.tenant(id),
  person_id uuid not null,
  through date not null,
  source text not null check (length(source) between 1 and 200),
  imported_by text not null,
  imported_at timestamptz not null default now(),
  primary key (tenant_id, person_id)
);

-- One imported event: kind and detail as in contracts.ts, with who recorded and approved it.
create table career.history (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  person_id uuid not null,
  kind text not null check (kind in ('joined', 'grade', 'move', 'project', 'certification')),
  effective_on date not null,
  detail jsonb not null,
  recorded_by text,
  recorded_for text,
  recorded_at timestamptz,
  approved_by text,
  approved_at timestamptz,
  source_module text not null check (source_module in ('hr', 'allocations', 'learning', 'delivery')),
  source_label text not null,
  source_href text check (source_href ~ '^/[A-Za-z0-9/_?=&.-]*$'),
  trace_ref text
);
create index history_person_idx on career.history (tenant_id, person_id, effective_on);

-- `project` is delivery's key when it has one, else the project's name. A proposed tag shows as a
-- faint leaf until a person confirms it through chat (tag_technology).
create table career.technology (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  person_id uuid not null,
  project text not null check (length(project) between 1 and 160),
  name text not null check (length(name) between 1 and 60),
  status text not null check (status in ('proposed', 'confirmed')),
  source text not null check (length(source) between 1 and 120),
  proposed_by text not null,
  proposed_for text,
  proposed_at timestamptz not null default now(),
  confirmed_by text,
  confirmed_at timestamptz
);
create unique index technology_one_idx on career.technology (tenant_id, person_id, project, lower(name));

select core.enable_tenant_rls('career.settings');
select core.enable_tenant_rls('career.import');
select core.enable_tenant_rls('career.history');
select core.enable_tenant_rls('career.technology');
grant select, insert, update on all tables in schema career to amax_app;
