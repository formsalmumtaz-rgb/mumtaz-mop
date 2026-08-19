-- 119_refuel_payer_and_receipt.sql
-- §3.8 — "Refuel flow: band + litres + amount + vehicle + RECEIPT PHOTO + PAYER
-- (cash or top-up account; TEAMS MAY FUEL FOR EACH OTHER, so capture who paid or
-- reconciliation breaks)."
--
-- vehicle_fuel_purchases recorded litres, amount, vehicle and odometer but not
-- WHO PAID or the evidence. The owner's parenthesis is the whole point: a
-- technician who fills someone else's van out of their own cash float is owed
-- that money back, and with only the vehicle on the record there is nothing to
-- reconcile the float against. The van says where the fuel went; it cannot say
-- whose money it was.
alter table vehicle_fuel_purchases
  add column if not exists paid_by_technician_id uuid references technicians(id),
  add column if not exists payment_source        text,
  add column if not exists receipt_photo_key     text,
  add column if not exists fuel_band             integer;

comment on column vehicle_fuel_purchases.paid_by_technician_id is
  'WHO paid, which is not necessarily whose van it is — crews fuel for each other. Cash reconciliation is read against this, not against the vehicle.';
comment on column vehicle_fuel_purchases.payment_source is
  'cash = out of a technician''s float, and they are owed it back. top_up_account = the company fuel card, and nobody is out of pocket.';
comment on column vehicle_fuel_purchases.receipt_photo_key is
  'R2 key of the pump receipt. The evidence for the amount.';
comment on column vehicle_fuel_purchases.fuel_band is
  'The gauge band at the moment of filling (3.8 scale), captured alongside litres so a wildly inconsistent pair is visible.';

alter table vehicle_fuel_purchases drop constraint if exists vehicle_fuel_purchases_payment_source_check;
alter table vehicle_fuel_purchases add constraint vehicle_fuel_purchases_payment_source_check
  check (payment_source is null or payment_source in ('cash', 'top_up_account'));

alter table vehicle_fuel_purchases drop constraint if exists vehicle_fuel_purchases_fuel_band_check;
alter table vehicle_fuel_purchases add constraint vehicle_fuel_purchases_fuel_band_check
  check (fuel_band is null or fuel_band = any (array[0, 10, 20, 40, 60, 80, 99, 100]));

-- Cash spent out of pocket, per technician: what the office owes each person back.
-- Nothing is computed from the vehicle here — only from who actually paid.
create or replace view fuel_cash_owed_to_technicians as
  select f.tenant_id, f.paid_by_technician_id as technician_id, t.full_name,
         count(*)::int as fills,
         sum(f.amount)::numeric as cash_spent,
         min(f.purchase_date) as first_fill,
         max(f.purchase_date) as last_fill
    from vehicle_fuel_purchases f
    join technicians t on t.id = f.paid_by_technician_id
   where f.payment_source = 'cash'
   group by f.tenant_id, f.paid_by_technician_id, t.full_name;

comment on view fuel_cash_owed_to_technicians is
  '3.8: fuel paid out of technicians own cash, per person. The reconciliation the owner asked for -- reads the PAYER, never the vehicle.';

grant select on fuel_cash_owed_to_technicians to mop_app;
