-- 108_vehicle_consumption_assumed.sql
-- RECONSTRUCTED 19 Aug 2026 for rebuild fidelity. See D-MIG1.
--
-- This seeded cost.vehicle_litres_per_100km = 12 as ASSUMED — a figure I invented
-- when cost.vehicle_km_per_litre = 5 already existed, unassumed, in the costing
-- engine. mig 110 deletes it. The file is reconstructed so the migration sequence
-- tells the truth about what happened rather than quietly omitting a mistake.
insert into settings (tenant_id, service_line_id, key, value, is_assumed, description)
select t.id, null, 'cost.vehicle_litres_per_100km', '12'::jsonb, true,
       'ASSUMED: 12 L/100km for a service van. SUPERSEDED by mig 110 — the platform already held cost.vehicle_km_per_litre = 5.'
  from tenants t
 where not exists (select 1 from settings x
                    where x.tenant_id = t.id and x.service_line_id is null
                      and x.key = 'cost.vehicle_litres_per_100km');
