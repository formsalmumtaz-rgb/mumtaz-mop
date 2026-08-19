-- 110_owner_pricing_answers.sql
-- Owner answers, 19 Aug 2026 (BLOCKED §0.7b).
--
-- 1. FUEL — I INVENTED A FIGURE THE SYSTEM ALREADY HAD.
--    mig 108 seeded `cost.vehicle_litres_per_100km` = 12 as ASSUMED. But
--    `cost.vehicle_km_per_litre` = 5 already existed, service-line scoped and NOT
--    assumed — the real figure from the costing engine — and
--    `cost.standard_vehicle_rate_per_km` = 0.698 is already exactly 3.49 / 5.
--    So the platform had both the consumption and the derived per-km cost, and I
--    added a third, wronger number beside them. That is the "data entered once"
--    rule broken by the code that is supposed to enforce it.
--    The invented setting is deleted; quick-pricing reads the engine's own
--    per-km rate. Travel costs roughly double, which is the correct direction:
--    a pickup does 5 km/L, not the 8.3 km/L my 12 L/100km implied.
delete from settings where key = 'cost.vehicle_litres_per_100km';

-- 2. RESTAURANT B AND C — the difference is TIME AND CREW, not chemical.
--    Owner: "Only A (1 mix) and D (3 mixes) differ on dose." B and C both take
--    2 mixes = 100 ml; B is ~45 min with one technician, C ~60 min with two.
--    These are now stated facts, so they stop being ASSUMED.
update service_categories set
  mixes = 2, ml_per_mix = 50, max_ml = null,
  crew_size = 1, est_duration_hours = 0.75, buffer_minutes = 10,
  notes = 'Owner-stated: 2 mixes = 100 ml, ~45 min, one technician. Dose is the same as C; B and C differ on time and crew, not chemical.',
  is_assumed = false, assumed_note = null, confirmed_at = now(), updated_at = now()
 where code = 'com_rest_b';

update service_categories set
  mixes = 2, ml_per_mix = 50, max_ml = null,
  crew_size = 2, est_duration_hours = 1.0, buffer_minutes = 15,
  notes = 'Owner-stated: 2 mixes = 100 ml, ~60 min, two technicians. Dose is the same as B; the difference is time and crew.',
  is_assumed = false, assumed_note = null, confirmed_at = now(), updated_at = now()
 where code = 'com_rest_c';

-- D keeps its ASSUMED duration/crew — the owner confirmed only its dose cap.
-- Its note is corrected so it no longer implies more was confirmed than was.
update service_categories set
  notes = 'Full-size restaurant. MAX 3 mixes = 150 ml — never more (owner-stated, enforced). Duration and crew size remain ASSUMED.',
  updated_at = now()
 where code = 'com_rest_d';

-- 3. DUBAI UPLIFT — the 15% midpoint is confirmed, so it stops being ASSUMED.
update settings
   set is_assumed = false, confirmed_at = now(), updated_at = now(),
       description = 'Dubai quotes carry +15% over the Sharjah-based suggestion. Owner-ratified 19 Aug 2026 from a stated range of +10-20%. GUIDANCE shown beside the suggested price — never applied silently, never rounded for you.'
 where key = 'pricing.emirate_factor';
