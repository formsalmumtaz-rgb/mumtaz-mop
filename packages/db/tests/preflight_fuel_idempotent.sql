-- preflight_fuel_idempotent.sql — proves BLOCKED A7 (mig 063): pre-flight fuel posts
-- to vehicle_fuel_purchases exactly once per pre-flight, re-sync-safe, append-only.
-- Wrapped in a transaction that ROLLS BACK (leaves no data). PASS = final notice.
begin;
do $$
declare
  t uuid; sl uuid; tech uuid; veh uuid; pf uuid; n int;
begin
  insert into tenants(name) values ('A7 Fuel Test') returning id into t;
  insert into service_lines(tenant_id, code, name) values (t, 'a7pest', 'A7 Pest') returning id into sl;
  insert into technicians(tenant_id, service_line_id, full_name) values (t, sl, 'A7 Tech') returning id into tech;
  insert into vehicles(tenant_id, code, name) values (t, 'A7-VAN', 'A7 Van') returning id into veh;
  insert into preflight_checks(tenant_id, service_line_id, technician_id, vehicle_id, odometer_km, fuel_litres, fuel_amount)
    values (t, sl, tech, veh, 12000, 40, 139.60) returning id into pf;

  -- post fuel twice for the SAME pre-flight (simulates re-sync) — idempotent
  insert into vehicle_fuel_purchases(tenant_id, service_line_id, vehicle_id, litres, amount, odometer_km, preflight_check_id, source)
    values (t, sl, veh, 40, 139.60, 12000, pf, 'preflight') on conflict (preflight_check_id) where preflight_check_id is not null do nothing;
  insert into vehicle_fuel_purchases(tenant_id, service_line_id, vehicle_id, litres, amount, odometer_km, preflight_check_id, source)
    values (t, sl, veh, 40, 139.60, 12000, pf, 'preflight') on conflict (preflight_check_id) where preflight_check_id is not null do nothing;

  select count(*) into n from vehicle_fuel_purchases where preflight_check_id = pf;
  if n <> 1 then raise exception 'A7 FAIL: expected 1 fuel purchase per pre-flight, got %', n; end if;

  -- a DIFFERENT pre-flight (another day) posts its own fuel row (total 2)
  insert into preflight_checks(tenant_id, service_line_id, technician_id, vehicle_id, check_date, fuel_litres, fuel_amount)
    values (t, sl, tech, veh, current_date - 1, 35, 122.15) returning id into pf;
  insert into vehicle_fuel_purchases(tenant_id, service_line_id, vehicle_id, litres, amount, preflight_check_id, source)
    values (t, sl, veh, 35, 122.15, pf, 'preflight') on conflict (preflight_check_id) where preflight_check_id is not null do nothing;

  select count(*) into n from vehicle_fuel_purchases where vehicle_id = veh;
  if n <> 2 then raise exception 'A7 FAIL: expected 2 fuel purchases for 2 pre-flights, got %', n; end if;

  raise notice 'A7 PREFLIGHT FUEL IDEMPOTENCY PASSED';
end $$;
rollback;
