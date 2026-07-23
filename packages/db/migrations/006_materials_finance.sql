-- 006_materials_finance.sql
-- MOP K1 — materials and finance. TWO SEPARATE LEDGERS (owner req):
--   * stock_movements  : PHYSICAL, append-only, smallest unit, per job/technician/location
--   * journal_lines    : FINANCIAL, append-only, debits=credits (DB-enforced), valued
--                        cost entries traceable back to the stock movements they value.
-- Plus invoices/invoice_lines with PINT AE fields and frozen tax identity (F3).

-- ── Items & stock structure ────────────────────────────────────────────
create table items (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id),
  service_line_id uuid references service_lines(id),
  code            text,
  name            text not null,
  item_type       text not null check (item_type in ('chemical','consumable','equipment')),
  base_unit_id    uuid references units(id),
  msds_ref        text,
  attributes      jsonb not null default '{}'::jsonb,
  is_active       boolean not null default true,
  is_assumed      boolean not null default false,
  assumed_note    text,
  confirmed_by    uuid, confirmed_at timestamptz,
  created_at      timestamptz not null default now(), created_by uuid,
  updated_at      timestamptz not null default now(), updated_by uuid,
  unique (tenant_id, code)
);
create trigger items_touch before update on items for each row execute function set_updated_at();
create trigger items_validate_attrs before insert or update on items
  for each row execute function tg_validate_attributes('item');

-- deferred FK from 003: a recipe version's product is an item
alter table treatment_recipe_versions
  add constraint treatment_recipe_versions_product_fk
  foreign key (product_item_id) references items(id);

create table item_batches (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id),
  item_id           uuid not null references items(id),
  batch_no          text,
  expiry_date       date,
  msds_ref          text,
  emirate_approvals jsonb not null default '{}'::jsonb,   -- per-emirate approval status/expiry
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(), created_by uuid,
  updated_at        timestamptz not null default now(), updated_by uuid
);
create index item_batches_item_idx on item_batches (item_id);
create trigger item_batches_touch before update on item_batches for each row execute function set_updated_at();

create table stock_locations (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id),
  service_line_id uuid references service_lines(id),
  code            text,
  name            text not null,
  location_type   text not null check (location_type in ('warehouse','van','site')),
  technician_id   uuid references technicians(id),   -- for a van tied to a technician
  vehicle_ref     text,
  is_active       boolean not null default true,
  is_assumed      boolean not null default false,
  assumed_note    text,
  confirmed_by    uuid, confirmed_at timestamptz,
  created_at      timestamptz not null default now(), created_by uuid,
  updated_at      timestamptz not null default now(), updated_by uuid,
  unique (tenant_id, code)
);
create trigger stock_locations_touch before update on stock_locations for each row execute function set_updated_at();

-- ── Physical ledger: stock_movements (append-only, granular) ───────────
create table stock_movements (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references tenants(id),
  service_line_id    uuid references service_lines(id),
  item_id            uuid not null references items(id),
  batch_id           uuid references item_batches(id),
  from_location_id   uuid references stock_locations(id),
  to_location_id     uuid references stock_locations(id),
  movement_type      text not null check (movement_type in ('receipt','transfer','consumption','adjustment','return')),
  quantity           numeric not null,                    -- in the smallest unit
  unit_id            uuid references units(id),
  job_id             uuid references jobs(id),            -- per job
  technician_id      uuid references technicians(id),     -- per technician
  recipe_version_id  uuid references treatment_recipe_versions(id),
  client_uuid        uuid,                                -- offline idempotency
  snapshot           jsonb not null default '{}'::jsonb,  -- frozen valuation/context (F2)
  occurred_at        timestamptz not null default now(),
  device_occurred_at timestamptz,
  created_at         timestamptz not null default now(), created_by uuid,
  unique (tenant_id, client_uuid)
);
create index stock_movements_item_idx on stock_movements (item_id);
create index stock_movements_job_idx on stock_movements (job_id);
create trigger stock_movements_append_only before update or delete on stock_movements
  for each row execute function enforce_append_only();

-- ── Financial ledger: chart of accounts + journal (append-only, balanced) ─
create table accounts (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id),
  code              text not null,
  name              text not null,
  account_type      text not null check (account_type in ('asset','liability','equity','income','expense')),
  parent_account_id uuid references accounts(id),
  is_active         boolean not null default true,
  is_assumed        boolean not null default false,
  assumed_note      text,
  confirmed_by      uuid, confirmed_at timestamptz,
  created_at        timestamptz not null default now(), created_by uuid,
  updated_at        timestamptz not null default now(), updated_by uuid,
  unique (tenant_id, code)
);
create trigger accounts_touch before update on accounts for each row execute function set_updated_at();

create table journal_entries (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id),
  service_line_id uuid references service_lines(id),
  entry_no        text,
  entry_date      date not null default current_date,
  memo            text,
  source_type     text,      -- 'job_completion','invoice','stock_valuation','manual_adjustment'
  source_id       uuid,
  created_at      timestamptz not null default now(), created_by uuid
);
create index journal_entries_source_idx on journal_entries (source_type, source_id);

create table journal_lines (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id),
  journal_entry_id  uuid not null references journal_entries(id),
  account_id        uuid not null references accounts(id),
  debit             numeric not null default 0 check (debit >= 0),
  credit            numeric not null default 0 check (credit >= 0),
  currency          text not null default 'AED',
  stock_movement_id uuid references stock_movements(id),   -- traceable to the movement it values
  memo              text,
  created_at        timestamptz not null default now(), created_by uuid,
  -- a line is exactly one of debit or credit
  check ((debit > 0 and credit = 0) or (credit > 0 and debit = 0))
);
create index journal_lines_entry_idx on journal_lines (journal_entry_id);
create index journal_lines_stock_idx on journal_lines (stock_movement_id);

-- debits = credits per entry — enforced in the DB (Art. V §3), deferred to commit
-- so all lines of an entry can be inserted within one transaction.
create or replace function enforce_balanced_entry() returns trigger
language plpgsql as $$
declare
  v_entry  uuid;
  v_debit  numeric;
  v_credit numeric;
  v_count  integer;
begin
  v_entry := coalesce(new.journal_entry_id, old.journal_entry_id);
  select coalesce(sum(debit),0), coalesce(sum(credit),0), count(*)
    into v_debit, v_credit, v_count
    from journal_lines where journal_entry_id = v_entry;
  if v_count > 0 and v_debit <> v_credit then
    raise exception 'Journal entry % is unbalanced: debits % <> credits % (Constitution Art. V §3).',
      v_entry, v_debit, v_credit;
  end if;
  return null;
end $$;
create constraint trigger journal_lines_balanced
  after insert or update or delete on journal_lines
  deferrable initially deferred
  for each row execute function enforce_balanced_entry();

-- journal_lines are append-only (corrections are reversing entries)
create trigger journal_lines_append_only before update or delete on journal_lines
  for each row execute function enforce_append_only();

-- ── Invoices (PINT AE fields; frozen tax identity at issue) ────────────
create table invoices (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references tenants(id),
  service_line_id     uuid references service_lines(id),
  invoice_number      text,
  document_type       text not null default 'tax_invoice'
                      check (document_type in ('tax_invoice','commercial_invoice','credit_note','debit_note')),
  customer_id         uuid references customers(id),
  contract_id         uuid references contracts(id),
  job_id              uuid references jobs(id),
  issue_date          date,
  due_date            date,
  tax_point_date      date,
  -- frozen seller identity (our licence entity) at issue
  seller_legal_name   text,
  seller_trn          text,
  seller_address      text,
  seller_peppol_id    text,                 -- 0235:<TIN>
  -- frozen buyer identity at issue (F3)
  buyer_legal_name    text,
  buyer_trn           text,
  buyer_address       text,
  buyer_place_of_supply text,
  buyer_customer_type text,
  buyer_peppol_id     text,
  -- money
  currency            text not null default 'AED',
  vat_treatment       text not null default 'standard'
                      check (vat_treatment in ('standard','zero_rated','exempt','reverse_charge')),
  subtotal            numeric not null default 0,
  vat_total           numeric not null default 0,
  total               numeric not null default 0,
  status              text not null default 'draft'
                      check (status in ('draft','queued','issued','paid','cancelled')),
  snapshot            jsonb not null default '{}'::jsonb,   -- full frozen snapshot for reprint
  generated_document_id uuid references generated_documents(id),
  created_at          timestamptz not null default now(), created_by uuid,
  updated_at          timestamptz not null default now(), updated_by uuid,
  unique (tenant_id, invoice_number)
);
create index invoices_customer_idx on invoices (customer_id);
create index invoices_job_idx on invoices (job_id);
create trigger invoices_touch before update on invoices for each row execute function set_updated_at();

create table invoice_lines (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references tenants(id),
  invoice_id            uuid not null references invoices(id),
  line_no               integer,
  description           text,
  contract_service_id   uuid references contract_services(id),
  service_type_id       uuid references service_types(id),
  price_list_version_id uuid references price_list_versions(id),   -- frozen ref
  quantity              numeric not null default 1,
  unit_id               uuid references units(id),
  unit_price            numeric not null default 0,   -- frozen
  currency              text not null default 'AED',  -- frozen
  vat_rate              numeric not null default 0,    -- frozen (percent, e.g. 5.0)
  vat_amount            numeric not null default 0,
  line_total            numeric not null default 0,
  snapshot              jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(), created_by uuid
);
create index invoice_lines_invoice_idx on invoice_lines (invoice_id);
