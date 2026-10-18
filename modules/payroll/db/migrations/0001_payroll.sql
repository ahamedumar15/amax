-- 014 payroll: pay groups and their own pay components, runs that step Draft → Agent check → HR
-- approval → Finance approval → Bank file → Payslips sent, payslips and their lines, the agent's
-- explained changes since last period, and the bank file. Amounts are numeric(19,4) with the run's
-- currency, never floats. People are hr.person ids; the name is kept on payslips and changes.
-- Every amount here is 002 class 'pay': only Payroll and Admin (and the person, for their own
-- payslip once sent) read it; Finance reads totals by entity and cost centre only.
create schema payroll;
grant usage on schema payroll to amax_app;

-- A pay group: who is paid together, how often, in what currency and by which country pack.
create table payroll.pay_group (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  legal_entity_id uuid not null references core.legal_entity(id),
  name text not null,
  currency char(3) not null,
  pack text not null,
  frequency text not null default 'monthly' check (frequency in ('monthly')),
  created_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create table payroll.pay_group_member (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  pay_group_id uuid not null references payroll.pay_group(id),
  person_id uuid not null,
  unique (pay_group_id, person_id)
);

-- The group's own pay components for a person: recurring allowances (no end) and one-offs for a
-- period (overtime, a final settlement, a no-pay deduction). Base salary comes from hr (011).
create table payroll.pay_component (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  pay_group_id uuid not null references payroll.pay_group(id),
  legal_entity_id uuid not null references core.legal_entity(id),
  person_id uuid not null,
  code text not null,
  label text not null,
  kind text not null check (kind in ('earning', 'deduction')),
  amount numeric(19,4) not null check (amount >= 0),
  currency char(3) not null,
  starts_on date not null,
  ends_on date,
  basis text,
  recorded_by text not null,
  created_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on)
);

-- One run per pay group and month. `status` is the last step completed; each step records who and when.
create table payroll.run (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  pay_group_id uuid not null references payroll.pay_group(id),
  legal_entity_id uuid not null references core.legal_entity(id),
  period date not null check (extract(day from period) = 1),
  period_end date not null,
  currency char(3) not null,
  pack text not null,
  status text not null check (status in ('draft', 'checked', 'hr_approved', 'finance_approved', 'bank_file', 'payslips_sent')),
  sources jsonb not null default '{}',
  drafted_by text not null,
  drafted_at timestamptz not null default now(),
  checked_by text,
  checked_at timestamptz,
  hr_approved_by text,
  hr_approved_at timestamptz,
  finance_approved_by text,
  finance_approved_at timestamptz,
  bank_file_by text,
  bank_file_at timestamptz,
  sent_by text,
  sent_at timestamptz,
  unique (pay_group_id, period)
);

create table payroll.payslip (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  run_id uuid not null references payroll.run(id),
  legal_entity_id uuid not null references core.legal_entity(id),
  person_id uuid not null,
  user_id uuid,
  person_name text not null,
  employee_no text not null,
  cost_centre text not null,
  currency char(3) not null,
  working_days int not null,
  days_paid numeric(5,1) not null,
  gross numeric(19,4) not null,
  deductions numeric(19,4) not null,
  net numeric(19,4) not null,
  employer_cost numeric(19,4) not null,
  flags text[] not null default '{}',
  period_end date not null,
  unique (run_id, person_id)
);

create table payroll.payslip_line (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  payslip_id uuid not null references payroll.payslip(id) on delete cascade,
  legal_entity_id uuid not null references core.legal_entity(id),
  person_id uuid not null,
  position int not null,
  code text not null,
  label text not null,
  kind text not null check (kind in ('earning', 'deduction', 'employer')),
  amount numeric(19,4) not null,
  basis text,
  period_end date not null,
  unique (payslip_id, position)
);

-- 014 AC-2: each person whose net pay moved since the last period, with the agent's explanation.
-- `decision` is set only by accepting the matching 006 suggestion; HR can't approve the run while any
-- change is undecided (open, queried, dismissed or expired).
create table payroll.change (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  run_id uuid not null references payroll.run(id),
  legal_entity_id uuid not null references core.legal_entity(id),
  person_id uuid not null,
  user_id uuid,
  person_name text not null,
  kind text not null check (kind in ('joiner', 'leaver', 'pay')),
  was_net numeric(19,4) not null,
  now_net numeric(19,4) not null,
  amount numeric(19,4) not null,
  currency char(3) not null,
  explanation text not null,
  needs_check boolean not null default false,
  confidence numeric(3,2) not null,
  decision text check (decision in ('accepted')),
  decided_by text,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (run_id, person_id),
  check ((decision is null) = (decided_by is null))
);

-- The bank file, made once two different people approved its 006 suggestion. Only its size, total
-- and digest are kept here: the account numbers stay in hr.
create table payroll.bank_file (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  run_id uuid not null unique references payroll.run(id),
  legal_entity_id uuid not null references core.legal_entity(id),
  rows int not null,
  total numeric(19,4) not null,
  currency char(3) not null,
  digest text not null,
  approved_by text not null,
  created_at timestamptz not null default now()
);

create index on payroll.payslip (run_id);
create index on payroll.payslip (tenant_id, user_id);
create index on payroll.payslip_line (payslip_id);
create index on payroll.change (run_id);
create index on payroll.pay_component (pay_group_id, person_id);

select core.enable_tenant_rls('payroll.pay_group');
select core.enable_tenant_rls('payroll.pay_group_member');
select core.enable_tenant_rls('payroll.pay_component');
select core.enable_tenant_rls('payroll.run');
select core.enable_tenant_rls('payroll.payslip');
select core.enable_tenant_rls('payroll.payslip_line');
select core.enable_tenant_rls('payroll.change');
select core.enable_tenant_rls('payroll.bank_file');
grant select, insert, update, delete on all tables in schema payroll to amax_app;
