-- 139_the_vocabulary_people_actually_use.sql
-- Items 3, 4, 5, 6 of the walkthrough. One migration because they are one
-- problem: the lists a new person is asked to choose from do not match the
-- business, so the screen has to be explained before it can be used.

-- ══ ITEM 4 — services belong to a division ═════════════════════════════
-- The pest control flow offered AC duct cleaning and facilities management,
-- because the picker listed every service_type in the tenant. Division scoping
-- is a query fix (below, in the app); what the data needed was the REST of the
-- pest control menu and an explicit order, since "General Pest Control first,
-- Termite last" is a real sales preference and alphabetical is not.
alter table service_types add column if not exists sort_order integer;
comment on column service_types.sort_order is
  'Display order within the division. General Pest Control is 1 because it is the default sale; Termite is last because it is the rare, priced-differently one.';

update service_types st set sort_order = v.ord
  from (values
    ('general_pest', 1), ('cockroach', 2), ('bed_bug', 3), ('rodent', 4),
    ('mosquito', 5), ('fly', 6), ('ant', 7), ('termite', 99)
  ) as v(code, ord)
 where st.code = v.code
   and st.service_line_id in (select id from service_lines where code = 'pest_control');

-- The four the menu was missing. ASSUMED (Art. X §4) — these are the standard
-- UAE pest-control menu items, not something the owner has confirmed selling.
insert into service_types (tenant_id, service_line_id, code, name, description, sort_order, is_active, is_assumed, assumed_note)
select sl.tenant_id, sl.id, v.code, v.name, v.descr, v.ord, true, true,
       'ASSUMED: standard UAE pest-control menu item, added so the picker is complete. Confirm or deactivate in Settings → Master data.'
  from service_lines sl
 cross join (values
    ('mosquito', 'Mosquito Control', 'Larviciding and adulticide fogging of breeding sites and perimeters.', 5),
    ('fly',      'Fly Control',      'Bait, traps and residual treatment for filth and fruit flies.', 6),
    ('ant',      'Ant Control',      'Gel and residual treatment for pharaoh, ghost and carpenter ants.', 7)
 ) as v(code, name, descr, ord)
 where sl.code = 'pest_control'
   and not exists (select 1 from service_types x
                    where x.service_line_id = sl.id and x.code = v.code);

-- Fogging is a METHOD, not a service someone buys — it is how mosquito and fly
-- control are delivered. Left active but sorted to the end rather than deleted,
-- because estimate lines already reference it.
update service_types set sort_order = 100
 where code = 'fogging'
   and service_line_id in (select id from service_lines where code = 'pest_control');

-- ══ ITEM 5 — three pricing models, not twenty-six ══════════════════════
-- Per person, per day, per floor, per duct, per apartment… twenty-six rows in
-- the dropdown, of which three describe how this business actually sells.
alter table pricing_models add column if not exists is_advanced boolean not null default false;
comment on column pricing_models.is_advanced is
  'True = hidden from the default picker, reachable under "advanced". The everyday list is per treatment / per month / per year; everything else is real but rare, and a 26-item dropdown is how a new person gets it wrong.';

-- Per year did not exist at all, which is why annual AMCs were being priced as
-- "fixed periodic" and nobody could tell what period.
-- model_type is a closed set and had no annual member, which is the root of the
-- problem: with no way to SAY "per year", annual AMCs were stored as
-- "fixed periodic" and the period lived in someone's head.
alter table pricing_models drop constraint if exists pricing_models_model_type_chk;
alter table pricing_models add constraint pricing_models_model_type_chk
  check (model_type = any (array['fixed','per_hour','per_day','per_person','per_month',
                                 'per_year','per_visit','per_sqm','per_apartment','per_room',
                                 'per_floor','per_duct','per_linear_metre','quantity_unit',
                                 'formula','custom']));

-- One per division, matching how the existing per_month family is stored.
insert into pricing_models (tenant_id, service_line_id, code, name, model_type, is_active, is_assumed, assumed_note)
select sl.tenant_id, sl.id,
       case sl.code when 'pest_control' then 'per_year'
                    when 'cleaning' then 'cln_per_year'
                    else 'fm_per_year' end,
       'Per year', 'per_year', true, true,
       'ASSUMED: added so an annual AMC can say so rather than being priced as "fixed periodic" with no stated period. Confirm the label in Settings → Master data.'
  from service_lines sl
 where not exists (select 1 from pricing_models pm
                    where pm.tenant_id = sl.tenant_id and pm.service_line_id = sl.id
                      and pm.model_type = 'per_year');

update pricing_models set is_advanced = true;
update pricing_models set is_advanced = false
 where model_type in ('per_visit', 'per_month', 'per_year');

-- ══ ITEM 6 — the mixing presets, corrected ════════════════════════════
-- Supersedes the earlier B/C = 2 each ruling.
--   A = 1 mix (50 ml) · B = 2 mixes (100 ml) · C = 3 mixes (150 ml) = THE MAX.
-- Beyond three mixes is a custom scope, never a preset.
update service_categories set mixes = 1, ml_per_mix = 50, max_ml = 150 where code = 'com_rest_a';
update service_categories set mixes = 2, ml_per_mix = 50, max_ml = 150 where code = 'com_rest_b';
update service_categories set mixes = 3, ml_per_mix = 50, max_ml = 150, crew_size = 2 where code = 'com_rest_c';

-- Restaurant D is RETIRED, not capped. With C now holding three mixes, a capped
-- D would be a second name for the same dose — and two presets that mean the
-- same thing is precisely the kind of thing that needs explaining. Deactivated
-- rather than deleted: estimate lines reference it.
update service_categories
   set is_active = false,
       notes = coalesce(notes || ' | ', '') ||
               'RETIRED 20 Aug 2026: three mixes is the maximum preset (Restaurant C). Anything larger is a custom scope — hotel-scale or additional services — and is quoted, not preset.'
 where code = 'com_rest_d';

-- Three mixes is the ceiling, enforced rather than remembered.
alter table service_categories drop constraint if exists service_categories_max_three_mixes;
alter table service_categories add constraint service_categories_max_three_mixes
  check (mixes is null or mixes <= 3);

comment on column service_categories.mixes is
  'Number of 50 ml mixes for this preset. Maximum 3 — beyond that it is a custom scope, not a preset (walkthrough item 6).';

-- ══ ITEM 3 — property type is the premises, not the billing category ═══
-- residential/commercial/industrial is how the money is categorised. It is not
-- what the building IS, and the survey question set, the municipality rules and
-- the night-shift default all key off what the building is.
alter table facility_types add column if not exists default_night_shift boolean not null default false;
alter table facility_types add column if not exists billing_category text;
alter table facility_types add column if not exists sort_order integer;
alter table facility_types drop constraint if exists facility_types_billing_category_check;
alter table facility_types add constraint facility_types_billing_category_check
  check (billing_category is null or billing_category in ('residential', 'commercial', 'industrial'));

comment on column facility_types.default_night_shift is
  'These premises are normally treated after closing — F&B, retail food, malls. Defaults the job to the night window instead of the operator remembering per site.';
comment on column facility_types.billing_category is
  'The residential/commercial/industrial bucket this premises type bills under. Kept as a SEPARATE field because it is a billing category, not a property type (walkthrough item 3).';

-- The premises we actually serve. Existing rows are updated in place; the six
-- the list was missing are added.
-- facility_types is per division (service_line_id NOT NULL), so a premises type
-- is added to every division that serves it — a restaurant is a restaurant
-- whether it is being sprayed or having its ducts cleaned.
insert into facility_types (tenant_id, service_line_id, code, name, description, is_active, is_assumed, assumed_note)
select sl.tenant_id, sl.id, v.code, v.name, v.descr, true, true,
       'ASSUMED: premises type added from the owner''s list (walkthrough item 3). Confirm the municipality category and night-shift default in Settings → Master data.'
  from service_lines sl
 cross join (values
   ('hotel',                'Hotel',                 'Hotels and serviced apartments — kitchens, guest floors, back of house.'),
   ('cafeteria',            'Cafeteria',             'Cafeterias and canteens.'),
   ('grocery',              'Grocery',               'Small groceries and convenience stores.'),
   ('hypermarket',          'Hypermarket',           'Hypermarkets — large-format food retail.'),
   ('residential_building', 'Residential building',  'Whole residential buildings — common areas, chutes, basements.'),
   ('production_facility',  'Production facility',   'Food and non-food production facilities.'),
   ('pharmacy',             'Pharmacy',              'Pharmacies.'),
   ('hospital',             'Hospital',              'Hospitals and inpatient medical facilities.'),
   ('other',                'Other',                 'Anything not listed — describe it in the survey notes.')
 ) as v(code, name, descr)
 where not exists (select 1 from facility_types f
                    where f.tenant_id = sl.tenant_id and f.service_line_id = sl.id and f.code = v.code);

-- Billing category, night-shift default and display order for every premises
-- type. Night shift is true where the premises cannot be treated while trading.
update facility_types f set
  billing_category = v.billing,
  default_night_shift = v.night,
  sort_order = v.ord
  from (values
    ('hotel',                'commercial',  true,   1),
    ('restaurant',           'commercial',  true,   2),
    ('cafeteria',            'commercial',  true,   3),
    ('grocery',              'commercial',  true,   4),
    ('supermarket',          'commercial',  true,   5),
    ('hypermarket',          'commercial',  true,   6),
    ('residential_building', 'residential', false,  7),
    ('villa',                'residential', false,  8),
    ('apartment',            'residential', false,  9),
    ('office',               'commercial',  false, 10),
    ('factory',              'industrial',  false, 11),
    ('production_facility',  'industrial',  true,  12),
    ('warehouse',            'industrial',  false, 13),
    ('mosque',               'commercial',  false, 14),
    ('school',               'commercial',  true,  15),
    ('clinic',               'commercial',  false, 16),
    ('hospital',             'commercial',  false, 17),
    ('pharmacy',             'commercial',  false, 18),
    ('labour_camp',          'residential', false, 19),
    ('construction',         'industrial',  false, 20),
    ('mall_retail_complex',  'commercial',  true,  21),
    ('ship_vessel_rig',      'industrial',  false, 22),
    ('other',                null,          false, 99)
  ) as v(code, billing, night, ord)
 where f.code = v.code;

-- Exactly three names in the everyday list. "Per treatment" and "Per visit" are
-- the same model_type and were both showing — two words for one thing is the
-- kind of choice that makes a person stop and ask which one is right.
update pricing_models set is_advanced = true
 where model_type = 'per_visit' and code not in ('per_treatment', 'cln_per_visit', 'fm_per_visit');
update pricing_models set name = 'Per treatment'
 where model_type = 'per_visit' and not is_advanced;

-- Every division needs all three everyday models. Cleaning had no monthly one,
-- so a monthly cleaning contract had nothing honest to be priced as.
insert into pricing_models (tenant_id, service_line_id, code, name, model_type, is_active, is_advanced, is_assumed, assumed_note)
select sl.tenant_id, sl.id,
       case sl.code when 'cleaning' then 'cln_per_month' else sl.code || '_per_month' end,
       'Per month', 'per_month', true, false, true,
       'ASSUMED: added so every division can price monthly. Confirm in Settings → Master data.'
  from service_lines sl
 where not exists (select 1 from pricing_models pm
                    where pm.tenant_id = sl.tenant_id and pm.service_line_id = sl.id
                      and pm.model_type = 'per_month');
