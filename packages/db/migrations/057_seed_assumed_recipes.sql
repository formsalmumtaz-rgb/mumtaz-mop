-- 057_seed_assumed_recipes.sql
-- Seed ASSUMED treatment recipes so the field app can carry a treatment reference
-- offline (T2). Two starter pest-control recipes per tenant with an open version.
-- Values are ASSUMED starter figures (BLOCKED.md A5) — flagged is_assumed and
-- editable; confirm method & dosing before relying on them. Dosing/coverage in the
-- human `dilution_ratio`/`notes` text (unit FKs left null to avoid cross-tenant
-- unit coupling); the deterministic dosing engine is refined in the costing phase.

insert into treatment_recipes (tenant_id, service_line_id, code, name, is_assumed, assumed_note)
select sl.tenant_id, sl.id, v.code, v.name, true,
       'ASSUMED starter recipe — confirm treatment method and dosing before relying on it.'
from service_lines sl
cross join (values
  ('spray_general', 'Residual Spray — General'),
  ('gel_general',   'Gel Bait — General')
) as v(code, name)
where sl.code = 'pest_control'
on conflict (tenant_id, service_line_id, code) do nothing;

insert into treatment_recipe_versions (recipe_id, version_no, dose_rate, dilution_ratio, dilution_value, coverage_per_unit, is_assumed, notes)
select r.id, 1,
       case when r.code = 'spray_general' then 50 else 9 end,
       case when r.code = 'spray_general' then '50 ml concentrate per 10 L water' else null end,
       case when r.code = 'spray_general' then 0.005 else null end,
       case when r.code = 'spray_general' then 200 else 100 end,
       true,
       case when r.code = 'spray_general'
            then 'Residual spray to skirting, harbourage and cracks. ~200 m² per mix. ASSUMED.'
            else 'Gel bait to cracks/crevices. ~9 g per 100 m². ASSUMED.' end
from treatment_recipes r
where r.code in ('spray_general', 'gel_general')
  and not exists (select 1 from treatment_recipe_versions v where v.recipe_id = r.id);
