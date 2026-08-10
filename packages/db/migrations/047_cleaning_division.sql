-- 047_cleaning_division.sql
-- Cleaning division (§9). Adding a division is CONFIGURATION, not code (Art. XVIII):
-- a new service_line plus its OWN service types, pricing models, frequencies, and
-- category structure. Cleaning is fully independent of pest control — its
-- categories carry their own (configurable) material-cost assumptions and never
-- inherit pest-control chemical/recipe logic. Categories seeded ASSUMED so the
-- owner sets real crew/duration/material/price before use.

-- Division
insert into service_lines (tenant_id, code, name)
select t.id, 'cleaning', 'Cleaning' from tenants t
where not exists (select 1 from service_lines sl where sl.tenant_id = t.id and sl.code = 'cleaning');

-- Cleaning service types (standard — names only, real)
insert into service_types (tenant_id, service_line_id, code, name)
select sl.tenant_id, sl.id, v.code, v.name
from service_lines sl
cross join (values
  ('general_cleaning','General cleaning'),
  ('deep_cleaning','Deep cleaning'),
  ('routine_cleaning','Routine cleaning'),
  ('adhoc_cleaning','Ad-hoc cleaning')
) as v(code, name)
where sl.code = 'cleaning';

-- Cleaning pricing models (typed; formulas empty — configured later)
insert into pricing_models (tenant_id, service_line_id, code, name, model_type, formula_spec)
select sl.tenant_id, sl.id, v.code, v.name, v.mt, '{}'::jsonb
from service_lines sl
cross join (values
  ('cln_per_hour','Per hour','per_hour'),
  ('cln_per_person','Per person','per_person'),
  ('cln_per_visit','Per visit','per_visit'),
  ('cln_fixed','Fixed price','fixed')
) as v(code, name, mt)
where sl.code = 'cleaning';

-- Cleaning frequencies (deterministic scheduler spec)
insert into frequencies (tenant_id, service_line_id, code, name, period_unit, period_count, visits_per_period)
select sl.tenant_id, sl.id, v.code, v.name, v.unit, v.cnt, v.vpp
from service_lines sl
cross join (values
  ('cln_daily','Daily','day',1,1),
  ('cln_weekly','Weekly','week',1,1),
  ('cln_monthly','Monthly','month',1,1)
) as v(code, name, unit, cnt, vpp)
where sl.code = 'cleaning';

-- Cleaning category structure (names only; operational numbers flagged ASSUMED)
insert into service_categories (tenant_id, service_line_id, code, name, property_type, is_assumed, assumed_note)
select sl.tenant_id, sl.id, v.code, v.name, v.ptype, true,
       'Operational assumptions (crew, duration, material, price) not set — configure before use.'
from service_lines sl
cross join (values
  ('cln_apartment','Apartment','residential'),
  ('cln_villa','Villa','residential'),
  ('cln_office','Office','commercial'),
  ('cln_restaurant','Restaurant','commercial')
) as v(code, name, ptype)
where sl.code = 'cleaning';
