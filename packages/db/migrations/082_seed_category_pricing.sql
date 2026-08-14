-- 082_seed_category_pricing.sql
-- Flow item 6: the survey/estimate category picker was completely dead — all 17
-- service_categories had no default_pricing_model_id, and the UI disabled every
-- unpriced option. Seed the attachment so the picker works:
--   * pest categories → the 'Per treatment' (per_visit) model;
--   * cleaning + FM  → their line's 'Fixed price' model;
--   * est_duration_hours → 1.0 for pest (matches cost.treatment_hours_per_visit,
--     itself ASSUMED and flagged), left 0 elsewhere (no source);
--   * crew_size → 1 where currently 0 (a visit needs at least one technician).
-- PRICES ARE NOT INVENTED (the standing order): default_unit_price stays 0 —
-- the estimate line arrives with the price EMPTY next to the suggested-price and
-- reference-rate chips (Flow item 5), and the operator decides. Everything here
-- is ASSUMED-flagged and editable under Service categories.

do $$
declare v_t uuid;
begin
  select id into v_t from tenants where name = 'Mumtaz Integrated Services Group';

  -- pest: Per treatment (per_visit) on the pest line
  update service_categories sc
     set default_pricing_model_id = (
           select pm.id from pricing_models pm
            where pm.tenant_id = sc.tenant_id and pm.service_line_id = sc.service_line_id
              and pm.model_type = 'per_visit'
            order by (pm.name = 'Per treatment') desc, pm.name limit 1),
         est_duration_hours = case when sc.est_duration_hours = 0 then 1.0 else sc.est_duration_hours end,
         crew_size = greatest(coalesce(sc.crew_size, 1), 1),
         is_assumed = true,
         assumed_note = coalesce(sc.assumed_note, '') ||
           ' Pricing model + duration seeded 082 (ASSUMED): per-treatment model, 1.0h from cost.treatment_hours_per_visit. Price deliberately left unset - never invented.'
   where sc.tenant_id = v_t and sc.default_pricing_model_id is null
     and sc.service_line_id = (select id from service_lines where tenant_id = v_t and code = 'pest_control');

  -- cleaning + FM: Fixed price on their own line
  update service_categories sc
     set default_pricing_model_id = (
           select pm.id from pricing_models pm
            where pm.tenant_id = sc.tenant_id and pm.service_line_id = sc.service_line_id
              and pm.model_type = 'fixed'
            order by (pm.name = 'Fixed price') desc, pm.name limit 1),
         crew_size = greatest(coalesce(sc.crew_size, 1), 1),
         is_assumed = true,
         assumed_note = coalesce(sc.assumed_note, '') ||
           ' Pricing model seeded 082 (ASSUMED): fixed-price model. Duration/price left unset - no source.'
   where sc.tenant_id = v_t and sc.default_pricing_model_id is null
     and sc.service_line_id in (select id from service_lines where tenant_id = v_t and code in ('cleaning','facilities_management'));
end $$;
