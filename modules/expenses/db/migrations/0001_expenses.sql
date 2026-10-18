-- 018 expenses: categories with a per-claim limit and a receipt threshold per legal entity, receipts
-- (the file lives in object storage; the row keeps its key and text), and claims that go to the
-- claimant's manager, then Finance, then are paid through payroll or by bank. Amounts are
-- numeric(19,4) with their currency.
create schema expenses;
grant usage on schema expenses to amax_app;

create table expenses.category (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  legal_entity_id uuid not null references core.legal_entity(id),
  key text not null,
  name text not null,
  currency char(3) not null,
  claim_limit numeric(19,4) not null check (claim_limit > 0),
  receipt_over numeric(19,4) not null default 0 check (receipt_over >= 0),
  health boolean not null default false,
  unique (tenant_id, legal_entity_id, key)
);

create table expenses.receipt (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  user_id uuid not null,
  legal_entity_id uuid not null references core.legal_entity(id),
  storage_key text,
  filename text not null,
  content_type text not null,
  size_bytes integer not null default 0,
  ocr_text text,
  uploaded_by text not null,
  created_at timestamptz not null default now()
);

create table expenses.claim (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  number text not null,
  person_id uuid not null,
  user_id uuid,
  person_name text not null,
  manager_user_id uuid,
  legal_entity_id uuid not null references core.legal_entity(id),
  category_id uuid not null references expenses.category(id),
  receipt_id uuid references expenses.receipt(id),
  spent_on date not null,
  merchant text not null,
  description text not null,
  amount numeric(19,4) not null check (amount > 0),
  currency char(3) not null,
  over_limit boolean not null default false,
  status text not null default 'submitted' check (status in ('submitted', 'manager_approved', 'approved', 'rejected', 'paid', 'withdrawn')),
  pay_via text check (pay_via in ('payroll', 'bank')),
  payroll_period text,
  submitted_by text not null,
  manager_decided_by text,
  manager_decided_at timestamptz,
  finance_decided_by text,
  finance_decided_at timestamptz,
  decision_comment text,
  paid_on date,
  paid_reference text,
  paid_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, number)
);

create unique index on expenses.claim (receipt_id) where receipt_id is not null and status <> 'withdrawn';
create index on expenses.claim (status);

select core.enable_tenant_rls('expenses.category');
select core.enable_tenant_rls('expenses.receipt');
select core.enable_tenant_rls('expenses.claim');
grant select, insert, update, delete on all tables in schema expenses to amax_app;
