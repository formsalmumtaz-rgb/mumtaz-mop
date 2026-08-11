-- 049_facilities_management_division.sql
-- Facilities Management division (§ FM/Manpower). Configuration, not code
-- (Art. XVIII): a new service_line with its OWN service types, pricing models,
-- frequencies and category structure. FM contracts flow through the existing
-- estimation → quotation → contract → scheduling pipeline; manpower engagements
-- attach to FM (or any) contracts via the manpower module (mig 046) with
-- deterministic monthly profitability. Categories seeded ASSUMED.

insert into service_lines (tenant_id, code, name)
select t.id, 'facilities_management', 'Facilities Management' from tenants t
where not exists (select 1 from service_lines sl where sl.tenant_id = t.id and sl.code = 'facilities_management');

-- FM service types (incl. manpower supply + duct cleaning specialisms)
insert into service_types (tenant_id, service_line_id, code, name)
select sl.tenant_id, sl.id, v.code, v.name
from service_lines sl
cross join (values
  ('facilities_management','Facilities management'),
  ('manpower_supply','Manpower supply'),
  ('ac_duct_cleaning','AC duct cleaning'),
  ('kitchen_duct_cleaning','Kitchen duct cleaning')
) as v(code, name)
where sl.code = 'facilities_management';

-- FM pricing models (fixed, per-hour, per-person, per-month, per-visit)
insert into pricing_models (tenant_id, service_line_id, code, name, model_type, formula_spec)
select sl.tenant_id, sl.id, v.code, v.name, v.mt, '{}'::jsonb
from service_lines sl
cross join (values
  ('fm_fixed','Fixed price','fixed'),
  ('fm_per_hour','Per hour','per_hour'),
  ('fm_per_person','Per person','per_person'),
  ('fm_per_month','Per month','per_month'),
  ('fm_per_visit','Per visit','per_visit')
) as v(code, name, mt)
where sl.code = 'facilities_management';

-- FM frequencies
insert into frequencies (tenant_id, service_line_id, code, name, period_unit, period_count, visits_per_period)
select sl.tenant_id, sl.id, v.code, v.name, v.unit, v.cnt, v.vpp
from service_lines sl
cross join (values
  ('fm_monthly','Monthly','month',1,1),
  ('fm_quarterly','Quarterly','month',3,1),
  ('fm_half_yearly','Half-yearly','month',6,1)
) as v(code, name, unit, cnt, vpp)
where sl.code = 'facilities_management';

-- FM category structure (names only; operational numbers flagged ASSUMED)
insert into service_categories (tenant_id, service_line_id, code, name, property_type, is_assumed, assumed_note)
select sl.tenant_id, sl.id, v.code, v.name, v.ptype, true,
       'Operational assumptions (crew, duration, material, price) not set — configure before use.'
from service_lines sl
cross join (values
  ('fm_building_small','Building — small','commercial'),
  ('fm_building_large','Building — large','commercial'),
  ('fm_villa_complex','Villa complex','residential'),
  ('fm_manpower','Manpower deployment','commercial')
) as v(code, name, ptype)
where sl.code = 'facilities_management';

-- Point the FM document brand (seeded in mig 043 as 'fm') at the actual service
-- line code so FM documents carry the Facilities Management mark, not the group
-- fallback.
update document_branding set applies_to_service_line_code = 'facilities_management'
 where brand_key = 'fm' and applies_to_service_line_code = 'fm';
