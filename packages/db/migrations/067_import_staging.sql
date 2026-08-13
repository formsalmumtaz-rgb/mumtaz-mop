-- 067_import_staging.sql
-- Bulk-import staging per Art. VII §5 (DOCUMENT 9 §C): imports NEVER write live
-- tables directly. CSV → staging → validation → dry-run report → commit clean rows.
-- Idempotent by batch; rollback by batch id (delete staged rows / archive committed
-- rows by import_batch_id). Account numbers are SYSTEM-assigned at commit — the
-- file's CUST-XXXX ids live only in source_row_id/source_ref and already collide
-- with live codes (proven: file CUST-0001 = Rafid; live CUST-0001 = Calicut).
--
-- Staging rows are working data (fully mutable) — none of this touches an
-- append-only or version-immutable object. Baseline convention: tenant_id, RLS
-- tenant_isolation, grants to mop_app.

create table if not exists import_batches (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id),
  kind         text not null,                     -- 'customer_master'
  source       text not null,                     -- file set description
  status       text not null default 'staged'     -- staged → validated → committed / abandoned
               check (status in ('staged','validated','committed','abandoned')),
  report       jsonb not null default '{}'::jsonb, -- dry-run report (counts + reasons)
  created_at   timestamptz not null default now(), created_by uuid,
  committed_at timestamptz
);

create table if not exists staging_customers (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id),
  batch_id      uuid not null references import_batches(id),
  source_row_id text not null,                    -- file's CUST-XXXX (NOT our code)
  legacy_customer_code text,
  legal_name    text, trade_name text, alias_name text,
  trn text, trade_licence_number text, customer_type text,
  emirate text, address text, po_box text,
  priority text, referred_by text, remarks text,
  shared_trn_group text, possible_dup_group text, missing_fields text,
  -- validation outcome
  disposition   text not null default 'pending'
                check (disposition in ('pending','clean','matched_live','held','rejected')),
  reason        text,
  matched_customer_id uuid references customers(id), -- live match (skip insert, map children)
  live_customer_id    uuid references customers(id), -- set at commit
  unique (batch_id, source_row_id)
);

create table if not exists staging_contacts (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id),
  batch_id      uuid not null references import_batches(id),
  source_row_id text not null,
  contact_type  text, value text, contact_name text, designation text,
  disposition   text not null default 'pending'
                check (disposition in ('pending','clean','held','rejected','committed')),
  reason        text
);

create table if not exists staging_branches (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id),
  batch_id      uuid not null references import_batches(id),
  source_row_id text not null,
  branch_name   text, address text, po_box text, emirate text,
  latitude text, longitude text, location_source text, access_notes text,
  disposition   text not null default 'pending'
                check (disposition in ('pending','clean','held','rejected','committed')),
  reason        text
);

create table if not exists staging_contracts (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id),
  batch_id        uuid not null references import_batches(id),
  contract_number text,
  client_name_raw text, location_raw text, contact_raw text,
  start_date_raw  text, end_date_raw text,
  amount_incl_vat text, frequency_raw text, frequency_norm text, visits_per_year text,
  linked_source_row_id text, match_confidence text,
  dup_contract_flag text, amount_issue text, date_issue text, phone_conflict text,
  disposition     text not null default 'pending'
                  check (disposition in ('pending','clean','held','rejected','committed')),
  reason          text,
  live_contract_id uuid references contracts(id)
);

do $$
declare t text;
begin
  foreach t in array array['import_batches','staging_customers','staging_contacts','staging_branches','staging_contracts'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format('create policy tenant_isolation on %I using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant())', t);
    execute format('grant select, insert, update, delete on %I to mop_app', t);
  end loop;
end $$;

create index if not exists staging_customers_batch_idx on staging_customers (batch_id, disposition);
create index if not exists staging_contracts_batch_idx on staging_contracts (batch_id, disposition);
