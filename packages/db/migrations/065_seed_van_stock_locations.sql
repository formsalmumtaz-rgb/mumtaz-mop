-- 065_seed_van_stock_locations.sql
-- Release 1 item 5 (spec Part E): the schema has supported warehouse/van/site
-- stock locations since mig 007, but only the MAIN warehouse row was ever seeded
-- (mig 018) — so warehouse→van issue had nowhere to issue TO. Seed the two team
-- vans as ASSUMED, editable rows (Art. X §4). Data-only: no schema objects, no
-- invariant touched, schema fingerprint unchanged.

do $$
declare
  v_tenant uuid; v_sl uuid;
begin
  select id into v_tenant from tenants where name = 'Mumtaz Integrated Services Group';
  select id into v_sl from service_lines where tenant_id = v_tenant and code = 'pest_control';

  insert into stock_locations (tenant_id, service_line_id, code, name, location_type, is_assumed, assumed_note)
  select v_tenant, v_sl, x.code, x.name, 'van', true,
         'ASSUMED van name - confirm, and link the vehicle (vehicles.stock_location_id) when confirmed'
    from (values ('VAN-A', 'Team A Van'), ('VAN-B', 'Team B Van')) as x(code, name)
  on conflict (tenant_id, code) do nothing;
end $$;
