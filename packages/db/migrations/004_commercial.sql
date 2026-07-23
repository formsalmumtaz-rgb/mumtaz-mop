-- 004_commercial.sql
-- MOP K1 — commercial core: customers, branches, contacts, contracts.
-- Blank = unknown (never defaulted). Money columns carry currency (ASSUMED AED).
-- contracts + contract_services hold every term needed to generate a full
-- agreement document (owner req); the agreement TOOL is Phase 2, not built here.

-- ── Customers ──────────────────────────────────────────────────────────
create table customers (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id),
  service_line_id uuid references service_lines(id),
  code            text,                       -- e.g. CUST-0001 from seed
  legal_name      text,                       -- BLANK-allowed: e-invoicing compliance field (Art. V §7)
  trade_name      text,                       -- what we usually have
  trn             text,                       -- BLANK-allowed tax registration number
  customer_type   text check (customer_type in ('B2B','B2G','B2C')),  -- null = unknown
  emirate         text,
  attributes      jsonb not null default '{}'::jsonb,
  is_active       boolean not null default true,   -- master data: soft-delete only (Art. VII §2)
  is_assumed      boolean not null default false,
  assumed_note    text,
  confirmed_by    uuid, confirmed_at timestamptz,
  created_at      timestamptz not null default now(), created_by uuid,
  updated_at      timestamptz not null default now(), updated_by uuid,
  unique (tenant_id, code)
);
create trigger customers_touch before update on customers for each row execute function set_updated_at();
create trigger customers_validate_attrs before insert or update on customers
  for each row execute function tg_validate_attributes('customer');

-- ── Customer branches (one customer → many sites) ──────────────────────
create table customer_branches (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references tenants(id),
  service_line_id      uuid references service_lines(id),
  customer_id          uuid not null references customers(id),
  code                 text,
  name                 text,
  address              text,
  emirate              text,
  location             geography(Point, 4326),      -- GPS pin; null = unknown (never invented)
  access_notes         text,
  municipality_licence text,
  attributes           jsonb not null default '{}'::jsonb,
  is_active            boolean not null default true,
  is_assumed           boolean not null default false,
  assumed_note         text,
  confirmed_by         uuid, confirmed_at timestamptz,
  created_at           timestamptz not null default now(), created_by uuid,
  updated_at           timestamptz not null default now(), updated_by uuid
);
create index customer_branches_customer_idx on customer_branches (customer_id);
create index customer_branches_geo_idx on customer_branches using gist (location);
create trigger customer_branches_touch before update on customer_branches for each row execute function set_updated_at();
create trigger customer_branches_validate_attrs before insert or update on customer_branches
  for each row execute function tg_validate_attributes('customer_branch');

-- ── Contacts ───────────────────────────────────────────────────────────
create table contacts (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id),
  service_line_id uuid references service_lines(id),
  customer_id  uuid not null references customers(id),
  branch_id    uuid references customer_branches(id),
  name         text,
  phone        text,
  email        text,
  role         text,
  is_primary   boolean not null default false,
  is_active    boolean not null default true,
  is_assumed   boolean not null default false,
  assumed_note text,
  confirmed_by uuid, confirmed_at timestamptz,
  created_at   timestamptz not null default now(), created_by uuid,
  updated_at   timestamptz not null default now(), updated_by uuid
);
create index contacts_customer_idx on contacts (customer_id);
create trigger contacts_touch before update on contacts for each row execute function set_updated_at();

-- ── Contracts ──────────────────────────────────────────────────────────
create table contracts (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id),
  service_line_id   uuid not null references service_lines(id),
  customer_id       uuid not null references customers(id),
  contract_number   text,                     -- NOT unique: real data has duplicates (flagged at import)
  pricing_model_id  uuid references pricing_models(id),   -- fixed_period vs per_treatment
  frequency_id      uuid references frequencies(id),
  price_list_id     uuid references price_lists(id),
  contract_value    numeric,                  -- blank-allowed (unknown)
  currency          text not null default 'AED',          -- ASSUMED default; flagged on seed
  vat_treatment     text not null default 'standard'
                    check (vat_treatment in ('standard','zero_rated','exempt','reverse_charge')),
  lifecycle_status  text not null default 'draft'
                    check (lifecycle_status in ('draft','active','suspended','expired','cancelled')),
  source_status     text,                     -- raw status from seed ('Done','Waiting',...)
  start_date        date,
  end_date          date,
  -- agreement terms (every term in a signed agreement has a home here):
  scope_of_work     text,
  payment_terms     text,
  special_conditions text,
  place_of_supply   text,
  po_number         text,
  signed_at         date,
  signatory_name    text,
  signatory_title   text,
  auto_renew        boolean not null default false,
  renewal_notice_days integer,
  attributes        jsonb not null default '{}'::jsonb,
  is_assumed        boolean not null default false,
  assumed_note      text,
  confirmed_by      uuid, confirmed_at timestamptz,
  created_at        timestamptz not null default now(), created_by uuid,
  updated_at        timestamptz not null default now(), updated_by uuid,
  check (end_date is null or start_date is null or end_date >= start_date)
);
create index contracts_customer_idx on contracts (customer_id);
create index contracts_number_idx on contracts (tenant_id, contract_number);
create trigger contracts_touch before update on contracts for each row execute function set_updated_at();
create trigger contracts_validate_attrs before insert or update on contracts
  for each row execute function tg_validate_attributes('contract');

-- ── Contract services (agreement line items) ───────────────────────────
create table contract_services (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id),
  service_line_id  uuid not null references service_lines(id),
  contract_id      uuid not null references contracts(id),
  branch_id        uuid references customer_branches(id),   -- which site this line covers
  service_type_id  uuid references service_types(id),
  job_type_id      uuid references job_types(id),
  pest_type_id     uuid references pest_types(id),
  frequency_id     uuid references frequencies(id),
  pricing_model_id uuid references pricing_models(id),
  unit_price       numeric,
  currency         text not null default 'AED',
  quantity         numeric not null default 1,
  notes            text,
  is_active        boolean not null default true,
  is_assumed       boolean not null default false,
  assumed_note     text,
  confirmed_by     uuid, confirmed_at timestamptz,
  created_at       timestamptz not null default now(), created_by uuid,
  updated_at       timestamptz not null default now(), updated_by uuid
);
create index contract_services_contract_idx on contract_services (contract_id);
create trigger contract_services_touch before update on contract_services for each row execute function set_updated_at();

-- ── Contract schedule (rows generated in K2; table only in K1) ─────────
create table contract_schedule (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references tenants(id),
  service_line_id     uuid not null references service_lines(id),
  contract_id         uuid not null references contracts(id),
  contract_service_id uuid references contract_services(id),
  branch_id           uuid references customer_branches(id),
  scheduled_date      date not null,
  visit_seq           integer,
  status              text not null default 'planned'
                      check (status in ('planned','job_created','skipped','done')),
  created_at          timestamptz not null default now(), created_by uuid
);
create index contract_schedule_contract_idx on contract_schedule (contract_id, scheduled_date);
