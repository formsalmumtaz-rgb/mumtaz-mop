-- 111_category_material_from_dose.sql
-- RECONSTRUCTED 19 Aug 2026: this change was applied to the database but never
-- written to disk, so a rebuild from empty would have missed it. See D-MIG1.
--
-- est_material_cost is what the estimate path reads when a category has no bill
-- of materials. It was 0 for every restaurant preset, so adding one to an
-- estimate priced the chemical at nothing. Derived from the dosage the presets
-- carry, at the same concentrate price quick-pricing uses, so the two cannot
-- disagree.
update service_categories sc
   set est_material_cost = round(
         (sc.mixes * sc.ml_per_mix / 1000.0)
         * coalesce((select (value #>> '{}')::numeric from settings
                      where tenant_id = sc.tenant_id and service_line_id is null
                        and key = 'pricing.blitz_price_per_litre'), 0), 2),
       updated_at = now()
 where sc.mixes is not null and sc.ml_per_mix is not null;
