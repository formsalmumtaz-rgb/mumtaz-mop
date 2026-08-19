-- 120_fuel_purchase_reversal.sql
-- A fuel purchase had no sanctioned way to be undone. Receipts have one
-- (fn_reverse_receipt + receipt_reversals); vehicle_fuel_purchases is equally
-- append-only but had nothing, so a mistaken or duplicated fill was permanent
-- with no correction path at all. That is a design gap, not an inconvenience:
-- append-only without a reversal route means the only remedy is a direct
-- database edit, which is exactly what append-only exists to prevent.
--
-- Built the same shape as the receipt one: the original row is NEVER touched, a
-- reversal row is appended beside it, and everything that reads fuel excludes
-- reversed purchases.
create table if not exists vehicle_fuel_purchase_reversals (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id),
  purchase_id uuid not null references vehicle_fuel_purchases(id),
  reason      text,
  created_at  timestamptz not null default now(),
  created_by  uuid,
  unique (purchase_id)
);

create index if not exists vfp_reversals_tenant_idx
  on vehicle_fuel_purchase_reversals (tenant_id, created_at desc);

comment on table vehicle_fuel_purchase_reversals is
  'One row per reversed fuel purchase. The purchase itself is never deleted or edited (Art. VII §2); this is what cancels it.';

-- The reversal record is itself append-only: cancelling a cancellation is a new
-- purchase, not an edit of the reversal.
create or replace function vfp_reversals_insert_only()
returns trigger language plpgsql as $$
begin
  raise exception 'vehicle_fuel_purchase_reversals is append-only: to undo a reversal, record the purchase again';
end $$;
drop trigger if exists vfp_reversals_append_only on vehicle_fuel_purchase_reversals;
create trigger vfp_reversals_append_only
  before update or delete on vehicle_fuel_purchase_reversals
  for each row execute function vfp_reversals_insert_only();

alter table vehicle_fuel_purchase_reversals enable row level security;
drop policy if exists tenant_isolation on vehicle_fuel_purchase_reversals;
create policy tenant_isolation on vehicle_fuel_purchase_reversals
  using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
grant select, insert on vehicle_fuel_purchase_reversals to mop_app;

-- Idempotent, like fn_reverse_receipt: reversing twice is a no-op, not an error.
-- A reason is required — an unexplained reversal in a fuel ledger is indefensible
-- when somebody is being reimbursed against it.
create or replace function fn_reverse_fuel_purchase(p_purchase uuid, p_reason text)
returns void language plpgsql as $$
declare f record;
begin
  select * into f from vehicle_fuel_purchases where id = p_purchase;
  if not found then raise exception 'Fuel purchase not found'; end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'A reason is required to reverse a fuel purchase';
  end if;
  if exists (select 1 from vehicle_fuel_purchase_reversals r where r.purchase_id = p_purchase) then
    return;  -- already reversed
  end if;
  insert into vehicle_fuel_purchase_reversals (tenant_id, purchase_id, reason, created_by)
    values (f.tenant_id, p_purchase, btrim(p_reason), app_current_actor());
end $$;

comment on function fn_reverse_fuel_purchase(uuid, text) is
  'Cancels a fuel purchase by appending a reversal. The purchase row is never deleted or edited. Idempotent; a reason is mandatory.';

-- Everything that reads fuel now ignores reversed purchases. Without this the
-- reversal would be a note nobody acts on: the reimbursement view would still owe
-- the money and the cost-per-km would still count the litres.
create or replace view fuel_cash_owed_to_technicians as
  select f.tenant_id, f.paid_by_technician_id as technician_id, t.full_name,
         count(*)::int as fills,
         sum(f.amount)::numeric as cash_spent,
         min(f.purchase_date) as first_fill,
         max(f.purchase_date) as last_fill
    from vehicle_fuel_purchases f
    join technicians t on t.id = f.paid_by_technician_id
   where f.payment_source = 'cash'
     and not exists (select 1 from vehicle_fuel_purchase_reversals r where r.purchase_id = f.id)
   group by f.tenant_id, f.paid_by_technician_id, t.full_name;

comment on view fuel_cash_owed_to_technicians is
  'Fuel paid out of technicians own cash, per person, EXCLUDING reversed purchases. Reads the PAYER, never the vehicle.';

create or replace view vehicle_cost_per_km as
 SELECT tenant_id, vehicle_id,
    count(*) AS fills,
    min(odometer_km) AS odo_min,
    max(odometer_km) AS odo_max,
    max(odometer_km) - min(odometer_km) AS km_span,
    sum(amount) AS total_fuel_cost,
    sum(amount) - (array_agg(amount ORDER BY odometer_km, purchase_date))[1] AS fuel_cost_for_span,
        CASE
            WHEN count(*) >= 2 AND (max(odometer_km) - min(odometer_km)) > 0::numeric
            THEN round((sum(amount) - (array_agg(amount ORDER BY odometer_km, purchase_date))[1]) / (max(odometer_km) - min(odometer_km)), 4)
            ELSE NULL::numeric
        END AS cost_per_km
   FROM vehicle_fuel_purchases f
  WHERE odometer_km IS NOT NULL
    AND NOT EXISTS (select 1 from vehicle_fuel_purchase_reversals r where r.purchase_id = f.id)
  GROUP BY tenant_id, vehicle_id;

grant select on fuel_cash_owed_to_technicians to mop_app;
grant select on vehicle_cost_per_km to mop_app;
