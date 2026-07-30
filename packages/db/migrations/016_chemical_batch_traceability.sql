-- 016_chemical_batch_traceability.sql
-- Tier 1 · Item 1 — chemical batch traceability & unit costing.
--
-- Adds the physical + financial machinery to trace a chemical batch through
-- purchase → vehicle → technician → customer → service → date, with a frozen
-- unit cost per batch, so consumption can be VALUED at that batch's cost and
-- posted to the ledger as ONE balanced entry per consumption event (never one
-- per unit). "Where was batch XYZ used" is answerable in a single query
-- (view batch_usage_trace).
--
-- Design decisions (owner-approved, session 2026-07-28):
--   * Perpetual inventory. Receipt posts Dr Inventory / Cr Payable|Cash;
--     consumption posts Dr Expense / Cr Inventory. Both valued at BASE-unit cost.
--     Ledger posting itself lives in the worker/ops layer (event-driven); this
--     migration lays the schema, the deterministic batch picker, the on-hand and
--     trace views, and the ASSUMED chart-of-accounts + settings it resolves.
--   * Specific identification per batch (NOT weighted-average): each purchase is
--     its own cost lot (its own item_batches row); batch.unit_cost is frozen.
--   * Batch allocation strategy is settings-driven: default 'fefo_then_fifo'
--     (nearest expiry; ties/nulls fall back to oldest received), also 'fifo' and
--     'manual'. Deterministic — no model call (Constitution Art. I).
--   * Vehicle (van) inventory is the operational source of consumption: the
--     picker scopes on-hand to the technician's van location.
--   * Recipe/chemical descriptors and the recurring-stock flag live on the ITEM
--     master; shelf-life is an optional item field for future compliance.
--
-- Unit conversion: the units catalogue (002) had NO conversion factor, so
-- "10 L @ AED 100 → per ml" was not derivable in-DB. Added base_unit_id +
-- to_base_factor to units (physical facts, not a business rule) and fn_to_base_qty.
--
-- Invariants: additive only. New append-only table (item_purchases) and a frozen
-- valuation basis (item_batches.unit_cost/supplier_id/received_at). debits=credits
-- unchanged (existing deferred constraint). RLS enabled + tenant-isolation policy
-- on every new table (009's blanket sweep only covered tables that existed then);
-- views run security_invoker so base-table RLS still applies to the caller.

-- ── 1. Unit conversion (physical facts) ────────────────────────────────
alter table units add column base_unit_id   uuid references units(id);
alter table units add column to_base_factor numeric not null default 1 check (to_base_factor > 0);

-- Quantity in p_unit_id expressed in that unit's base unit (factor 1 if unknown).
create or replace function fn_to_base_qty(p_unit_id uuid, p_qty numeric)
returns numeric language sql stable as $$
  select p_qty * coalesce((select to_base_factor from units where id = p_unit_id), 1);
$$;

-- ── 2. Chemical descriptors on the item master ─────────────────────────
alter table items add column active_ingredient          text;
alter table items add column intended_service_type_ids  uuid[] not null default '{}'::uuid[];  -- soft refs to service_types; UI validates
alter table items add column is_recurring_stock         boolean not null default false;        -- regularly-stocked / reordered
alter table items add column shelf_life_days            integer check (shelf_life_days is null or shelf_life_days > 0);

-- ── 3. Suppliers (editable reference data) ─────────────────────────────
create table suppliers (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id),
  service_line_id uuid references service_lines(id),
  code            text,
  name            text not null,
  trn             text,
  attributes      jsonb not null default '{}'::jsonb,
  is_active       boolean not null default true,
  is_assumed      boolean not null default false,
  assumed_note    text,
  confirmed_by    uuid, confirmed_at timestamptz,
  created_at      timestamptz not null default now(), created_by uuid,
  updated_at      timestamptz not null default now(), updated_by uuid,
  unique (tenant_id, code)
);
create trigger suppliers_touch before update on suppliers for each row execute function set_updated_at();
alter table suppliers enable row level security;
create policy tenant_isolation on suppliers
  using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
grant select, insert, update, delete on suppliers to mop_app;

-- ── 4. Batch cost + provenance (frozen valuation basis) ────────────────
alter table item_batches add column supplier_id   uuid references suppliers(id);
alter table item_batches add column unit_cost      numeric check (unit_cost is null or unit_cost >= 0);  -- per BASE unit, frozen at receipt
alter table item_batches add column cost_currency  text not null default 'AED';
alter table item_batches add column received_at    timestamptz;                                          -- receipt date (drives FIFO)

-- Once set, the valuation basis is immutable (Baseline v1 frozen-snapshot class).
-- Corrections are new batch lots or adjustment movements, never edits.
create or replace function enforce_batch_cost_immutable() returns trigger
language plpgsql as $$
begin
  if old.unit_cost is not null and new.unit_cost is distinct from old.unit_cost then
    raise exception 'item_batches.unit_cost is frozen once set (valuation basis). Create a new batch lot or post an adjustment.';
  end if;
  if old.supplier_id is not null and new.supplier_id is distinct from old.supplier_id then
    raise exception 'item_batches.supplier_id is frozen once set (receipt provenance).';
  end if;
  if old.received_at is not null and new.received_at is distinct from old.received_at then
    raise exception 'item_batches.received_at is frozen once set (receipt provenance).';
  end if;
  return new;
end $$;
create trigger item_batches_cost_immutable before update on item_batches
  for each row execute function enforce_batch_cost_immutable();

-- ── 5. Purchases (append-only goods receipt) ───────────────────────────
create table item_purchases (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references tenants(id),
  service_line_id     uuid references service_lines(id),
  item_id             uuid not null references items(id),
  batch_id            uuid references item_batches(id),      -- the cost lot this receipt created
  supplier_id         uuid references suppliers(id),
  purchase_date       date not null default current_date,
  pack_quantity       numeric not null check (pack_quantity > 0),  -- number of packs
  pack_size           numeric not null check (pack_size > 0),      -- size of one pack (e.g. 10)
  pack_unit_id        uuid references units(id),                   -- unit of pack_size (e.g. 'l')
  base_unit_id        uuid references units(id),                   -- item base unit at receipt (e.g. 'ml')
  total_base_quantity numeric not null check (total_base_quantity > 0),  -- pack_quantity*pack_size in base units
  total_cost          numeric not null check (total_cost >= 0),
  currency            text not null default 'AED',
  unit_cost           numeric generated always as (total_cost / total_base_quantity) stored,  -- per base unit; derived, immutable
  payment_mode        text not null default 'payable' check (payment_mode in ('payable','cash')),
  reference_no        text,                                  -- supplier invoice / GRN ref
  journal_entry_id    uuid references journal_entries(id),   -- Dr Inventory / Cr Payable|Cash
  stock_movement_id   uuid references stock_movements(id),   -- the 'receipt' movement
  snapshot            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(), created_by uuid
);
create index item_purchases_item_idx  on item_purchases (item_id);
create index item_purchases_batch_idx on item_purchases (batch_id);
create trigger item_purchases_append_only before update or delete on item_purchases
  for each row execute function enforce_append_only();
alter table item_purchases enable row level security;
create policy tenant_isolation on item_purchases
  using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
grant select, insert, update, delete on item_purchases to mop_app;

-- ── 6. On-hand per batch per location (base units) ─────────────────────
-- Movement-type-agnostic: a movement adds at to_location and removes at
-- from_location. Only batch-tracked movements count (batch_id not null).
create view batch_stock_on_hand with (security_invoker = true) as
select tenant_id, item_id, batch_id, location_id, sum(qty_base) as qty_base
from (
  select tenant_id, item_id, batch_id, to_location_id   as location_id,  fn_to_base_qty(unit_id, quantity) as qty_base
    from stock_movements where batch_id is not null and to_location_id   is not null
  union all
  select tenant_id, item_id, batch_id, from_location_id as location_id, -fn_to_base_qty(unit_id, quantity) as qty_base
    from stock_movements where batch_id is not null and from_location_id is not null
) s
group by tenant_id, item_id, batch_id, location_id;
grant select on batch_stock_on_hand to mop_app;

-- ── 7. Batch usage trace — "where was batch XYZ used" in one query ──────
-- One row per consumption: batch → item, job → customer, technician, vehicle
-- (from_location), date, quantity (base units) and valued cost at batch cost.
create view batch_usage_trace with (security_invoker = true) as
select
  m.tenant_id,
  m.batch_id,
  b.batch_no,
  b.expiry_date,
  m.item_id,
  i.name                                   as item_name,
  m.job_id,
  j.customer_id,
  cu.trade_name                            as customer,
  m.technician_id,
  t.full_name                              as technician,
  m.from_location_id                       as vehicle_location_id,
  loc.name                                 as vehicle_location,
  loc.vehicle_ref,
  m.quantity,
  m.unit_id,
  fn_to_base_qty(m.unit_id, m.quantity)                                 as qty_base,
  b.unit_cost,
  round(fn_to_base_qty(m.unit_id, m.quantity) * coalesce(b.unit_cost, 0), 2) as valued_cost,
  b.cost_currency                          as currency,
  m.occurred_at
from stock_movements m
join item_batches   b   on b.id  = m.batch_id
join items          i   on i.id  = m.item_id
left join jobs      j   on j.id  = m.job_id
left join customers cu  on cu.id = j.customer_id
left join technicians t on t.id  = m.technician_id
left join stock_locations loc on loc.id = m.from_location_id
where m.movement_type = 'consumption';
grant select on batch_usage_trace to mop_app;

-- ── 8. Deterministic batch picker (Automation-first) ───────────────────
-- Returns the batch to consume from at a location under the given strategy, or
-- NULL when strategy='manual' (caller must specify the batch explicitly) or no
-- lot has stock on hand there.
create or replace function fn_alloc_batch(
  p_tenant   uuid,
  p_item     uuid,
  p_location uuid,
  p_strategy text default 'fefo_then_fifo'
) returns uuid language plpgsql stable as $$
declare v_batch uuid;
begin
  if p_strategy = 'manual' then
    return null;
  end if;
  select soh.batch_id into v_batch
    from batch_stock_on_hand soh
    join item_batches b on b.id = soh.batch_id
   where soh.tenant_id = p_tenant
     and soh.item_id   = p_item
     and soh.location_id = p_location
     and soh.qty_base  > 0
     and b.is_active
   order by
     -- FEFO: nearest expiry first; FIFO ignores expiry. Ties/nulls -> oldest received.
     case when p_strategy = 'fifo' then null else b.expiry_date end asc nulls last,
     b.received_at asc nulls last,
     b.created_at  asc
   limit 1;
  return v_batch;
end $$;

-- ── 9. Seed: unit factors (facts), ASSUMED accounts + inventory settings ─
do $$
declare
  v_tenant uuid; v_sl uuid; v_ml uuid; v_g uuid;
begin
  select id into v_tenant from tenants where name = 'Mumtaz Integrated Services Group';
  if v_tenant is null then return; end if;   -- rebuild-safe if seed not present
  select id into v_sl from service_lines where tenant_id = v_tenant and code = 'pest_control';
  select id into v_ml from units where tenant_id = v_tenant and code = 'ml';
  select id into v_g  from units where tenant_id = v_tenant and code = 'g';

  -- unit conversion factors (physics): 1 L = 1000 ml, 1 kg = 1000 g; bases point to self
  update units set base_unit_id = v_ml                       where tenant_id = v_tenant and code = 'ml';
  update units set base_unit_id = v_g                        where tenant_id = v_tenant and code = 'g';
  update units set base_unit_id = v_ml, to_base_factor = 1000 where tenant_id = v_tenant and code = 'l';
  update units set base_unit_id = v_g,  to_base_factor = 1000 where tenant_id = v_tenant and code = 'kg';

  -- ASSUMED chart-of-accounts for perpetual inventory (confirm against client CoA)
  insert into accounts(tenant_id, code, name, account_type, is_assumed, assumed_note) values
    (v_tenant, '1300', 'Inventory — Chemicals',        'asset',     true, 'ASSUMED GL code — confirm against client chart of accounts'),
    (v_tenant, '5100', 'Cost of Chemicals Consumed',   'expense',   true, 'ASSUMED GL code — confirm'),
    (v_tenant, '2100', 'Accounts Payable — Suppliers', 'liability', true, 'ASSUMED GL code — confirm'),
    (v_tenant, '5190', 'Inventory Rounding',           'expense',   true, 'ASSUMED GL code — confirm')
  on conflict (tenant_id, code) do nothing;

  -- inventory settings: batch strategy (service-line scoped) + account-code map (tenant scoped)
  insert into settings(tenant_id, service_line_id, key, value, description, is_assumed) values
    (v_tenant, v_sl,  'inventory.batch_allocation_strategy', '"fefo_then_fifo"'::jsonb,
      'Batch pick order at consumption. Allowed: fefo_then_fifo (default), fifo, manual.', true),
    (v_tenant, null,  'inventory.account_code.asset',   '"1300"'::jsonb, 'GL Dr on receipt / Cr on consumption (inventory asset)', true),
    (v_tenant, null,  'inventory.account_code.expense', '"5100"'::jsonb, 'GL Dr on consumption (cost of chemicals)',              true),
    (v_tenant, null,  'inventory.account_code.payable', '"2100"'::jsonb, 'GL Cr on receipt when payment_mode=payable',            true),
    (v_tenant, null,  'inventory.account_code.rounding','"5190"'::jsonb, 'GL for residual valuation rounding',                    true);
end $$;
