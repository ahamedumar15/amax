-- 017 finance: contracts per project (fixed price, time and materials with a cap, retainer), their
-- milestones, invoices and credit notes with tax per legal entity, payments, the billing agent's
-- invoice drafts and the approved time behind them, and stored exchange rates. Amounts are
-- numeric(19,4) with their currency; each invoice keeps its base-currency amount at the stored rate.
create schema finance;
grant usage on schema finance to amax_app;

create table finance.settings (
  tenant_id uuid primary key references core.tenant(id),
  today date,
  monthly_target numeric(19,4) not null default 0,
  target_currency char(3) not null default 'USD'
);

create table finance.fx_rate (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  from_currency char(3) not null,
  to_currency char(3) not null,
  rate numeric(19,8) not null check (rate > 0),
  as_of date not null,
  source text not null,
  unique (tenant_id, from_currency, to_currency, as_of)
);

create table finance.contract (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  legal_entity_id uuid not null references core.legal_entity(id),
  project_id uuid not null,
  client text not null,
  kind text not null check (kind in ('fixed', 'tm', 'retainer')),
  currency char(3) not null,
  value numeric(19,4) not null check (value > 0),
  hourly_rate numeric(19,4) check (hourly_rate > 0),
  monthly_fee numeric(19,4) check (monthly_fee > 0),
  starts_on date not null,
  renews_on date,
  payment_days int not null default 30 check (payment_days between 0 and 180),
  tax_treatment text not null default 'standard' check (tax_treatment in ('standard', 'export')),
  created_by text not null,
  created_at timestamptz not null default now(),
  check (kind <> 'tm' or hourly_rate is not null),
  check (kind <> 'retainer' or monthly_fee is not null)
);

create table finance.milestone (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  contract_id uuid not null references finance.contract(id),
  label text not null,
  amount numeric(19,4) not null check (amount > 0),
  release_version text,
  status text not null default 'pending' check (status in ('pending', 'drafted', 'invoiced')),
  position int not null
);

create table finance.invoice (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  contract_id uuid not null references finance.contract(id),
  legal_entity_id uuid not null references core.legal_entity(id),
  number text not null,
  kind text not null check (kind in ('invoice', 'credit_note')),
  source text not null check (source in ('tm', 'milestone', 'retainer', 'credit')),
  credits_id uuid references finance.invoice(id),
  period text,
  milestone_id uuid references finance.milestone(id),
  description text not null,
  hours numeric(10,2),
  currency char(3) not null,
  subtotal numeric(19,4) not null,
  tax numeric(19,4) not null,
  total numeric(19,4) not null,
  tax_lines jsonb not null default '[]',
  fx_rate numeric(19,8) not null,
  base_currency char(3) not null,
  base_subtotal numeric(19,4) not null,
  issued_on date not null,
  due_on date not null,
  issued_by text not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, number),
  check ((kind = 'credit_note') = (credits_id is not null))
);

create table finance.payment (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  invoice_id uuid not null references finance.invoice(id),
  amount numeric(19,4) not null check (amount > 0),
  currency char(3) not null,
  received_on date not null,
  reference text,
  recorded_by text not null,
  created_at timestamptz not null default now()
);

create table finance.billable (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  contract_id uuid not null references finance.contract(id),
  period text not null,
  source text not null check (source in ('time', 'fixtures')),
  hours numeric(10,2) not null,
  amount numeric(19,4) not null,
  updated_at timestamptz not null default now(),
  unique (contract_id, period, source)
);

create table finance.draft (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  contract_id uuid not null references finance.contract(id),
  source text not null check (source in ('tm', 'milestone')),
  period text,
  milestone_id uuid references finance.milestone(id),
  description text not null,
  hours numeric(10,2),
  amount numeric(19,4) not null check (amount > 0),
  status text not null default 'open' check (status in ('open', 'invoiced', 'superseded')),
  invoice_id uuid references finance.invoice(id),
  created_at timestamptz not null default now()
);

select core.enable_tenant_rls('finance.settings');
select core.enable_tenant_rls('finance.fx_rate');
select core.enable_tenant_rls('finance.contract');
select core.enable_tenant_rls('finance.milestone');
select core.enable_tenant_rls('finance.invoice');
select core.enable_tenant_rls('finance.payment');
select core.enable_tenant_rls('finance.billable');
select core.enable_tenant_rls('finance.draft');
grant select, insert, update, delete on all tables in schema finance to amax_app;
