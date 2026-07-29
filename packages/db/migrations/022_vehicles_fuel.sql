-- 022_vehicles_fuel.sql
-- Tier 1 · Item 2 (job costing) — vehicle running cost basis.
--   * vehicles — the physical asset master (mutable reference data). Optionally
--     linked to its inventory van (stock_locations) and current primary driver.
--   * vehicle_fuel_purchases — APPEND-ONLY fuel receipts (litres + dirhams +
--     odometer). Primary costing source per owner: purchased litres/dirhams vs
--     odometer delta => rolling cost per km. Odometer here is the FUEL-recon
--     cross-check basis, not a per-job input (per-job distance is job_distance).
--   * vehicle_cost_per_km — tank-to-tank cost/km per vehicle: fuel spent to cover
--     the measured span (fills after the first) ÷ (max−min odometer). Needs ≥2
--     fills with odometer; otherwise null and 023 flags the job cost estimated.
--
-- Ledger postings (Dr Vehicle Running Cost / Cr Payable) and vehicle absorption +
-- variance are wired in 023, consistent with the labour accounts seeded in 019.
-- Additive. Fuel purchases append-only; no other invariant touched. RLS isolated.

create table vehicles (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references tenants(id),
  service_line_id     uuid references service_lines(id),
  code                text,
  name                text,
  registration_plate  text,
  stock_location_id   uuid references stock_locations(id),   -- the inventory van, if it carries stock
  technician_id       uuid references technicians(id),        -- current primary driver (assignment history deferred)
  vehicle_type        text,
  current_odometer_km numeric check (current_odometer_km is null or current_odometer_km >= 0),
  is_active           boolean not null default true,
  is_assumed          boolean not null default false,
  assumed_note        text,
  confirmed_by        uuid, confirmed_at timestamptz,
  created_at          timestamptz not null default now(), created_by uuid,
  updated_at          timestamptz not null default now(), updated_by uuid,
  unique (tenant_id, code)
);
create index vehicles_technician_idx on vehicles (technician_id);
create index vehicles_location_idx on vehicles (stock_location_id);
create trigger vehicles_touch before update on vehicles for each row execute function set_updated_at();
alter table vehicles enable row level security;
create policy tenant_isolation on vehicles
  using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
grant select, insert, update, delete on vehicles to mop_app;

create table vehicle_fuel_purchases (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id),
  service_line_id uuid references service_lines(id),
  vehicle_id      uuid not null references vehicles(id),
  purchase_date   date not null default current_date,
  litres          numeric not null check (litres > 0),
  amount          numeric not null check (amount >= 0),
  currency        text not null default 'AED',
  odometer_km     numeric check (odometer_km is null or odometer_km >= 0),
  supplier_id     uuid references suppliers(id),
  reference_no    text,
  note            text,
  snapshot        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(), created_by uuid
);
create index vehicle_fuel_vehicle_idx on vehicle_fuel_purchases (vehicle_id, odometer_km);
create trigger vehicle_fuel_purchases_append_only before update or delete on vehicle_fuel_purchases
  for each row execute function enforce_append_only();
alter table vehicle_fuel_purchases enable row level security;
create policy tenant_isolation on vehicle_fuel_purchases
  using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
grant select, insert, update, delete on vehicle_fuel_purchases to mop_app;

-- Rolling (lifetime) cost/km per vehicle, tank-to-tank. 023 can window it to a
-- trailing period (settings cost.fuel_cost_km_window_days) when costing a job.
create view vehicle_cost_per_km with (security_invoker = true) as
select
  f.tenant_id,
  f.vehicle_id,
  count(*)                                            as fills,
  min(f.odometer_km)                                  as odo_min,
  max(f.odometer_km)                                  as odo_max,
  (max(f.odometer_km) - min(f.odometer_km))           as km_span,
  sum(f.amount)                                       as total_fuel_cost,
  (sum(f.amount) - (array_agg(f.amount order by f.odometer_km, f.purchase_date))[1]) as fuel_cost_for_span,
  case
    when count(*) >= 2 and (max(f.odometer_km) - min(f.odometer_km)) > 0
    then round((sum(f.amount) - (array_agg(f.amount order by f.odometer_km, f.purchase_date))[1])
               / (max(f.odometer_km) - min(f.odometer_km)), 4)
    else null
  end                                                 as cost_per_km
from vehicle_fuel_purchases f
where f.odometer_km is not null
group by f.tenant_id, f.vehicle_id;
grant select on vehicle_cost_per_km to mop_app;

-- ── Vehicle GL accounts + settings (ASSUMED; postings wired in 023) ────
do $$
declare v_tenant uuid; v_sl uuid;
begin
  select id into v_tenant from tenants where name = 'Mumtaz Integrated Services Group';
  if v_tenant is null then return; end if;
  select id into v_sl from service_lines where tenant_id = v_tenant and code = 'pest_control';

  insert into accounts(tenant_id, code, name, account_type, is_assumed, assumed_note) values
    (v_tenant, '5300', 'Vehicle Running Cost',          'expense',   true, 'ASSUMED GL code — confirm'),
    (v_tenant, '5310', 'Vehicle Cost Variance',         'expense',   true, 'ASSUMED GL code — confirm'),
    (v_tenant, '2390', 'Vehicle Absorption Clearing',   'liability', true, 'ASSUMED GL code — confirm')
  on conflict (tenant_id, code) do nothing;

  insert into settings(tenant_id, service_line_id, key, value, description, is_assumed) values
    (v_tenant, v_sl,  'cost.standard_vehicle_rate_per_km', '0'::jsonb, 'STANDARD vehicle absorption rate (AED/km) — set before enabling absorption', true),
    (v_tenant, v_sl,  'cost.fuel_cost_km_window_days',     '90'::jsonb, 'Trailing window for rolling fuel cost/km', false),
    (v_tenant, null,  'cost.account_code.vehicle',          '"5300"'::jsonb, 'GL Dr vehicle cost into job cost',      true),
    (v_tenant, null,  'cost.account_code.vehicle_variance', '"5310"'::jsonb, 'GL for vehicle cost variance',          true),
    (v_tenant, null,  'cost.account_code.vehicle_clearing', '"2390"'::jsonb, 'GL vehicle absorption clearing',        true);
end $$;
