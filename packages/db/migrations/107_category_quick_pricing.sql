-- 107_category_quick_pricing.sql
-- §3.5 — the category picker drives the estimate in one tap.
--
-- The picker was dead because there was nothing behind it: Restaurant A/B/C/D
-- existed as names with crew_size 1, duration 1.0h and every money field zero.
-- A preset now carries the DOSAGE, and material cost is computed from it against
-- the real batch cost, not typed in as a lump.
--
-- OWNER-STATED (not assumed):
--   * Restaurant A — small kitchen + small cafeteria, ~20 min, 1 mix = 50 ml.
--   * Restaurant D — full-size restaurant, MAX 3 mixes = 150 ml. "Never more."
-- ASSUMED (flagged, editable, must be confirmed):
--   * B and C sit between A and D. Proposed below; nothing about them is known.
--   * D's service duration and crew size — only its dosage cap was given.
alter table service_categories
  add column if not exists mixes       numeric(6,2),
  add column if not exists ml_per_mix  numeric(8,2),
  add column if not exists max_ml      numeric(8,2);

comment on column service_categories.mixes is 'Number of tank mixes for one service of this category.';
comment on column service_categories.ml_per_mix is 'Millilitres of concentrate per mix.';
comment on column service_categories.max_ml is 'HARD CAP on total concentrate for one service. Restaurant D is 150 ml and never more (owner, §3.5).';

-- "Never more" is enforced by the database, not by a screen. A preset that would
-- dose past its own cap cannot be saved. ONLY Restaurant D has a cap: it is the
-- only one the owner put a limit on, and giving A/B/C one would invent a rule
-- that stops the office dosing above a figure that was only ever a proposal.
alter table service_categories drop constraint if exists service_categories_dose_within_cap;
alter table service_categories add constraint service_categories_dose_within_cap
  check (max_ml is null or mixes is null or ml_per_mix is null
         or (mixes * ml_per_mix) <= max_ml);

-- The concentrate itself. Cost comes from item_batches.unit_cost once a purchase
-- is recorded; the settings figure below is only the fallback until then.
insert into items (tenant_id, service_line_id, code, name, item_type, base_unit_id,
                   is_active, is_assumed, assumed_note, concentration)
select t.id, sl.id, 'BLITZ', 'Blitz (concentrate)', 'chemical',
       (select id from units where code = 'ml' limit 1),
       true, true, 'Seeded for category quick-pricing (§3.5). Confirm the product, pack size and supplier.', null
  from tenants t
  join service_lines sl on sl.tenant_id = t.id and sl.code = 'pest_control'
 where not exists (select 1 from items i where i.tenant_id = t.id and i.code = 'BLITZ');

-- Presets. A and D carry the owner's numbers; B and C are proposals.
update service_categories set
  mixes = 1, ml_per_mix = 50, max_ml = null,
  crew_size = 1, est_duration_hours = 0.34, buffer_minutes = 10,
  notes = 'Small kitchen + small cafeteria. ~20 min, 1 mix = 50 ml concentrate + surfactant. Owner-stated.',
  is_assumed = false, confirmed_at = now(), updated_at = now()
 where code = 'com_rest_a';

update service_categories set
  mixes = 2, ml_per_mix = 50, max_ml = null,
  crew_size = 1, est_duration_hours = 0.6, buffer_minutes = 10,
  notes = 'ASSUMED — intermediate between A and D. 2 mixes = 100 ml, ~35 min. Nothing about B was specified; confirm before quoting from it.',
  is_assumed = true,
  assumed_note = 'Size, duration and dosage are a proposal, not a rule (§3.5).',
  updated_at = now()
 where code = 'com_rest_b';

update service_categories set
  mixes = 3, ml_per_mix = 50, max_ml = null,
  crew_size = 1, est_duration_hours = 0.85, buffer_minutes = 15,
  notes = 'ASSUMED — intermediate between A and D. 3 mixes = 150 ml, ~50 min. Nothing about C was specified; confirm before quoting from it.',
  is_assumed = true,
  assumed_note = 'Size, duration and dosage are a proposal, not a rule (§3.5).',
  updated_at = now()
 where code = 'com_rest_c';

update service_categories set
  mixes = 3, ml_per_mix = 50, max_ml = 150,
  crew_size = 2, est_duration_hours = 1.25, buffer_minutes = 15,
  notes = 'Full-size restaurant. MAX 3 mixes = 150 ml — never more (owner-stated). Duration and crew size are ASSUMED.',
  is_assumed = true,
  assumed_note = 'The 150 ml cap is owner-stated and enforced. Duration and crew size are proposals.',
  updated_at = now()
 where code = 'com_rest_d';

-- Pricing guidance settings.
insert into settings (tenant_id, service_line_id, key, value, is_assumed, description)
select t.id, null, s.key, s.value, s.assumed, s.note
  from tenants t
 cross join (values
   ('pricing.emirate_factor', '{"Dubai": 0.15}'::jsonb, true,
    'ASSUMED: Dubai quotes carry +15% over the Sharjah-based suggestion. The owner stated a range of +10-20%; 15% is the midpoint and needs confirming. GUIDANCE shown next to the suggested price — never applied silently and never rounded for you.'),
   ('pricing.blitz_price_per_litre', '85'::jsonb, true,
    'ASSUMED fallback: AED 85 per litre of concentrate, used only until a real purchase gives item_batches.unit_cost. Owner said "1 L is approximately AED 85".')
 ) as s(key, value, assumed, note)
 where not exists (
   select 1 from settings x where x.tenant_id = t.id and x.service_line_id is null and x.key = s.key);
