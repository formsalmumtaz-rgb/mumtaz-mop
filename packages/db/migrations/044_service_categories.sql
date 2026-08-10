-- 044_service_categories.sql
-- Category Engine (Art. XVIII: data, not code). Each service line defines its own
-- categories (Studio, 1 BHK, Restaurant A…), and each category carries the
-- DETERMINISTIC operational assumptions that drive estimation and scheduling:
-- crew size, duration, buffer, material (chemical/consumable) cost estimate, and
-- a pricing recommendation. Selecting a category on a survey/estimate line
-- auto-fills those numbers through the EXISTING deterministic fn_price /
-- fn_estimate_cost — no per-service branch in code, no AI, fully auditable.
--
-- Categories are editable reference data. Immutability lives on the survey/
-- estimate LINE (est_cost / est_labour_hours / line_total are snapshotted at line
-- creation, as today), so editing a category never rewrites a past estimate.

create table service_categories (
  id                       uuid primary key default gen_random_uuid(),
  tenant_id                uuid not null references tenants(id),
  service_line_id          uuid not null references service_lines(id),
  service_type_id          uuid references service_types(id),     -- optional narrower scope
  code                     text not null,
  name                     text not null,                         -- 'Studio','1 BHK','Restaurant A'
  property_type            text check (property_type is null or property_type in ('residential','commercial','industrial')),
  -- deterministic operational drivers:
  crew_size                integer not null default 1 check (crew_size >= 1),
  est_duration_hours       numeric not null default 0 check (est_duration_hours >= 0),   -- wall-clock per visit
  buffer_minutes           integer not null default 0 check (buffer_minutes >= 0),
  est_material_cost        numeric not null default 0 check (est_material_cost >= 0),     -- chemicals/consumables (AED)
  -- pricing recommendation (fed into the existing pricing model at line creation):
  default_pricing_model_id uuid references pricing_models(id),
  default_measure          numeric not null default 1 check (default_measure >= 0),
  default_unit_price       numeric not null default 0 check (default_unit_price >= 0),
  recommended_price        numeric check (recommended_price is null or recommended_price >= 0),
  notes                    text,
  is_active                boolean not null default true,
  is_assumed               boolean not null default false,
  assumed_note             text,
  confirmed_by             uuid, confirmed_at timestamptz,
  created_at               timestamptz not null default now(), created_by uuid,
  updated_at               timestamptz not null default now(), updated_by uuid,
  unique (tenant_id, service_line_id, code)
);
create index service_categories_line_idx on service_categories (tenant_id, service_line_id);
create trigger service_categories_touch before update on service_categories
  for each row execute function set_updated_at();
alter table service_categories enable row level security;
create policy tenant_isolation on service_categories
  using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
grant select, insert, update, delete on service_categories to mop_app;

-- Additive, nullable link from lines back to the category they were built from
-- (provenance only — the derived numbers stay snapshotted on the line).
alter table survey_lines   add column category_id uuid references service_categories(id);
alter table estimate_lines add column category_id uuid references service_categories(id);

-- Seed the category STRUCTURE for pest control (names only). Operational numbers
-- are left at safe defaults and flagged ASSUMED — the owner configures the real
-- crew/duration/material/price in admin before use (Constitution: ASSUMED →
-- settings-editable → clearly reported; never invent operational values).
insert into service_categories (tenant_id, service_line_id, code, name, property_type, is_assumed, assumed_note)
select sl.tenant_id, sl.id, v.code, v.name, v.ptype, true,
       'Operational assumptions (crew, duration, material, price) not set — configure before use.'
from service_lines sl
cross join (values
  ('res_studio', 'Studio',        'residential'),
  ('res_1bhk',   '1 BHK',         'residential'),
  ('res_2bhk',   '2 BHK',         'residential'),
  ('res_3bhk',   '3 BHK',         'residential'),
  ('res_4bhk',   '4 BHK',         'residential'),
  ('res_villa',  'Villa',         'residential'),
  ('com_rest_a', 'Restaurant A',  'commercial'),
  ('com_rest_b', 'Restaurant B',  'commercial'),
  ('com_rest_c', 'Restaurant C',  'commercial'),
  ('com_rest_d', 'Restaurant D',  'commercial')
) as v(code, name, ptype)
where sl.code = 'pest_control';
