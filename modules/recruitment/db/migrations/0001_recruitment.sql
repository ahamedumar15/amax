-- 023 recruitment: open roles, candidates, their applications through the stages, interviews and
-- offers sent for e-signature. A candidate's name, email and CV are 002 class 'candidate': only HR
-- reads them. A candidate not hired is anonymised twelve months after the decision (032).
create schema recruitment;
grant usage on schema recruitment to amax_app;

-- An open role: how many people it hires, and who raised it (a person, or the resourcing agent from demand).
create table recruitment.role (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  legal_entity_id uuid not null references core.legal_entity(id),
  title text not null,
  department text not null,
  openings int not null check (openings > 0),
  skills text[] not null default '{}',
  status text not null default 'open' check (status in ('open', 'filled', 'closed')),
  raised_by text not null,
  reason text,
  opened_at timestamptz not null default now(),
  closed_at timestamptz
);

create table recruitment.candidate (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  legal_entity_id uuid not null references core.legal_entity(id),
  name text not null,
  email text,
  source text not null,
  cv jsonb not null default '[]',
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

-- One candidate for one role. Each stage reached keeps its time, so the funnel counts what happened.
-- `agent_score` and `agent_evidence` are the screening agent's proposal (a 006 suggestion);
-- `match_score` is set only when a person accepts it. No agent ever sets stage 'rejected'.
create table recruitment.application (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  legal_entity_id uuid not null references core.legal_entity(id),
  role_id uuid not null references recruitment.role(id),
  candidate_id uuid not null references recruitment.candidate(id),
  stage text not null default 'applied' check (stage in ('applied', 'screening', 'interview', 'offer', 'hired', 'rejected', 'withdrawn')),
  rounds int not null default 3 check (rounds between 1 and 6),
  applied_at timestamptz not null default now(),
  screened_at timestamptz,
  interviewed_at timestamptz,
  offered_at timestamptz,
  hired_at timestamptz,
  closed_at timestamptz,
  close_note text,
  agent_score int check (agent_score between 0 and 100),
  agent_evidence jsonb not null default '[]',
  match_score int check (match_score between 0 and 100),
  person_id uuid,
  hr_confirmed_by text,
  hr_confirmed_at timestamptz,
  moved_by text not null,
  unique (role_id, candidate_id)
);

create table recruitment.interview (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  application_id uuid not null references recruitment.application(id),
  round int not null,
  scheduled_at timestamptz not null,
  outcome text check (outcome in ('passed', 'failed')),
  recorded_by text not null,
  unique (application_id, round)
);

-- An offer sent for e-signature through a provider adapter (Zoho Sign first). Only the envelope id
-- is kept; the signed document stays with the provider.
create table recruitment.offer (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  application_id uuid not null references recruitment.application(id),
  legal_entity_id uuid not null references core.legal_entity(id),
  provider text not null,
  envelope_id text not null,
  status text not null default 'sent' check (status in ('sent', 'signed', 'declined')),
  starts_on date not null,
  sent_at timestamptz not null default now(),
  signed_at timestamptz,
  sent_by text not null
);

create index on recruitment.application (role_id, stage);
create index on recruitment.application (candidate_id);
create index on recruitment.interview (application_id);
create index on recruitment.offer (application_id);

select core.enable_tenant_rls('recruitment.role');
select core.enable_tenant_rls('recruitment.candidate');
select core.enable_tenant_rls('recruitment.application');
select core.enable_tenant_rls('recruitment.interview');
select core.enable_tenant_rls('recruitment.offer');
grant select, insert, update, delete on all tables in schema recruitment to amax_app;
