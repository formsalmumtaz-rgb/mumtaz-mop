-- 018_default_store.sql
-- Purchases must land in a tracked location for on-hand valuation to work, but
-- 010_seed created no stock_locations. Seed one default warehouse (ASSUMED —
-- confirm the real store name) so the first goods receipt has a home. Vans are
-- added as technicians are equipped; the purchase screen can receive into either.
-- Additive, idempotent; no ledger/append-only table touched; no invariant relaxed.
do $$
declare v_tenant uuid; v_sl uuid;
begin
  select id into v_tenant from tenants where name = 'Mumtaz Integrated Services Group';
  if v_tenant is null then return; end if;
  select id into v_sl from service_lines where tenant_id = v_tenant and code = 'pest_control';
  insert into stock_locations(tenant_id, service_line_id, code, name, location_type, is_assumed, assumed_note)
  select v_tenant, v_sl, 'MAIN', 'Main Store', 'warehouse', true,
         'Default store — confirm the real warehouse name/location'
  where not exists (
    select 1 from stock_locations where tenant_id = v_tenant and location_type = 'warehouse'
  );
end $$;
