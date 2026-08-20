-- 129_material_usage.sql
-- PILOT DEFECT 2 — chemical and equipment capture. Specified repeatedly, reported
-- built more than once, and genuinely absent. This is the data half; the screens
-- are the other half and both ship together.
--
-- What was actually there: the chemical master (all ten named products), the
-- substitution groups, treatment_recipes with dose rates, preflight_stock_
-- declarations (0 rows, never written), and stock_movements with the FEFO path.
-- What was NOT there, and is why nothing could work:
--   * NO recipe named its chemical — product_item_id was NULL on all five, so an
--     expected dose could not be computed at all.
--   * NO place to record expected vs actual. Not a missing screen: a missing table.
--   * NO adjuvant: the owner's own example is "100 ml Blitz + 10 ml Pro
--     Surfactant", and the model held exactly one product per recipe.

-- 1. A DUPLICATE I CREATED. mig 107 added item BLITZ "Blitz (concentrate)" when
--    CHEM_BLITZ_RS "Blitz Residual Spray" already existed with a substitution
--    group. Same mistake as the fuel figure: I added a second version of
--    something the platform already had. The real item wins; mine is retired.
update items set is_active = false,
       assumed_note = 'RETIRED: duplicate of CHEM_BLITZ_RS (Blitz Residual Spray), created in error by mig 107.'
 where code = 'BLITZ';

-- 2. LINK EACH RECIPE TO ITS CHEMICAL, by CLOSING the current version and
--    OPENING a new one. Recipe versions are version-immutable (SCHEMA.md F1) and
--    rightly so — a version is what was in force when a job was priced and
--    treated, and editing it in place would rewrite history. So the link is a new
--    version, and every job already treated still points at the old one.
--
--    The chemical is read from the recipe's own NAME, not invented: "Bedbug
--    Treatment — Tandom" is Tandom. Rodent baiting is deliberately left UNLINKED —
--    "bait + traps" does not say whether it is Broma, Pasta or Top Bait Max, and
--    guessing which poison goes down is not a decision software gets to make.
-- Two statements, not one: a data-modifying CTE would close and insert inside the
-- same snapshot, and the "one open version per recipe" unique index would see
-- both rows at once and reject the pair.
update treatment_recipe_versions v set effective_to = current_date
  from treatment_recipes r, items i
 where v.recipe_id = r.id and v.effective_to is null and v.product_item_id is null
   and i.tenant_id = r.tenant_id and i.is_active
   and ((r.code = 'bedbug_tandom'    and i.code = 'CHEM_TANDOM')
     or (r.code = 'termite_spectrum' and i.code = 'CHEM_SPECTRUM')
     or (r.code = 'gel_general'      and i.code = 'CHEM_GEL_BAIT')
     or (r.code = 'spray_general'    and i.code = 'CHEM_BLITZ_RS'));

insert into treatment_recipe_versions
  (recipe_id, version_no, effective_from, product_item_id, dose_rate, dose_unit_id,
   dilution_ratio, dilution_value, coverage_per_unit, coverage_unit_id, site_variation,
   notes, is_assumed, source_ref)
select v.recipe_id, v.version_no + 1, current_date, i.id, v.dose_rate, v.dose_unit_id,
       v.dilution_ratio, v.dilution_value, v.coverage_per_unit, v.coverage_unit_id, v.site_variation,
       concat_ws(' | ', nullif(v.notes,''), 'Product linked 19 Aug 2026 — the previous version named no chemical, so no expected dose could be computed.'),
       true, v.source_ref
  from treatment_recipe_versions v
  join treatment_recipes r on r.id = v.recipe_id
  join items i on i.tenant_id = r.tenant_id and i.is_active
   and ((r.code = 'bedbug_tandom'    and i.code = 'CHEM_TANDOM')
     or (r.code = 'termite_spectrum' and i.code = 'CHEM_SPECTRUM')
     or (r.code = 'gel_general'      and i.code = 'CHEM_GEL_BAIT')
     or (r.code = 'spray_general'    and i.code = 'CHEM_BLITZ_RS'))
 where v.effective_to = current_date and v.product_item_id is null
   and not exists (select 1 from treatment_recipe_versions x
                    where x.recipe_id = v.recipe_id and x.effective_to is null);

-- 3. ADJUVANTS — the surfactant that goes in with the concentrate.
create table if not exists treatment_recipe_adjuvants (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id),
  version_id      uuid not null references treatment_recipe_versions(id),
  item_id         uuid not null references items(id),
  dose_rate       numeric not null check (dose_rate > 0),
  dose_unit_id    uuid references units(id),
  per_litres      numeric,     -- e.g. 10 ml per 10 L of mixed water
  note            text,
  created_at      timestamptz not null default now(),
  unique (version_id, item_id)
);
alter table treatment_recipe_adjuvants enable row level security;
drop policy if exists tenant_isolation on treatment_recipe_adjuvants;
create policy tenant_isolation on treatment_recipe_adjuvants
  using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
grant select on treatment_recipe_adjuvants to mop_app;

comment on table treatment_recipe_adjuvants is
  'Extra products that go into the mix with the primary concentrate — a surfactant, a tracer dye. Dose is per litre of mixed water, not per site.';

-- Pro Surfactant with the general residual spray: 10 ml per 10 L of mix.
-- ASSUMED — the owner gave "100 ml Blitz + 10 ml Pro Surfactant in 20 L water"
-- as an EXAMPLE; the rate is inferred from it and needs confirming.
insert into treatment_recipe_adjuvants (tenant_id, version_id, item_id, dose_rate, dose_unit_id, per_litres, note)
-- units are per-tenant, so the lookup must be too: an unscoped
-- (select id from units where code='ml') returns one row per tenant.
select r.tenant_id, v.id, i.id, 10, (select id from units where code='ml' and tenant_id = r.tenant_id), 20,
       'ASSUMED 10 ml per 20 L of mixed water, taken directly from the owner''s example "100 ml Blitz + 10 ml Pro Surfactant in 20 L water". Confirm it holds at other mix sizes.'
  from treatment_recipe_versions v
  join treatment_recipes r on r.id = v.recipe_id
  join items i on i.tenant_id = r.tenant_id and i.code = 'CHEM_PRO_SURF'
 where r.code = 'spray_general' and v.effective_to is null
   and not exists (select 1 from treatment_recipe_adjuvants a where a.version_id = v.id and a.item_id = i.id);

-- 4. Bait station keys — named in the spec, missing from the equipment list.
insert into preflight_checklist_items (tenant_id, kind, code, label, sort_order, is_active, is_assumed)
select t.id, 'equipment', 'bait_station_keys', 'Bait station keys', 6, true, false
  from tenants t
 where not exists (select 1 from preflight_checklist_items x
                    where x.tenant_id = t.id and x.kind = 'equipment' and x.code = 'bait_station_keys');

-- 5. EXPECTED VS ACTUAL — the record that did not exist.
--
-- Both numbers are kept forever. The variance between them is the point: it is
-- what makes costing real, what lets a recipe correct itself against what is
-- actually used, and what shows over- or under-dosing per technician and per site
-- over time. Storing only the actual would throw all of that away.
create table if not exists job_material_usage (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null references tenants(id),
  job_id                 uuid not null references jobs(id),
  item_id                uuid not null references items(id),
  recipe_version_id      uuid references treatment_recipe_versions(id),

  expected_qty           numeric check (expected_qty is null or expected_qty >= 0),
  actual_qty             numeric not null check (actual_qty >= 0),
  unit_id                uuid references units(id),

  mixes                  integer check (mixes is null or mixes > 0),
  water_litres           numeric check (water_litres is null or water_litres > 0),

  -- substitution stays visible: what was used, and what it stood in for
  substituted_for_item_id uuid references items(id),

  -- the technician's answer when they went past the soft warning
  over_expected_ack      boolean not null default false,
  note                   text,

  client_uuid            uuid unique,
  device_time            timestamptz,
  created_at             timestamptz not null default now(),
  created_by             uuid
);
create index if not exists job_material_usage_job_idx on job_material_usage (tenant_id, job_id);
create index if not exists job_material_usage_item_idx on job_material_usage (tenant_id, item_id);

comment on table job_material_usage is
  'What the recipe EXPECTED and what the technician ACTUALLY used, per job per product. Both kept: the variance is the most valuable operational number the platform holds (defect 2).';
comment on column job_material_usage.substituted_for_item_id is
  'Set when the technician used a different product from the same substitution group — Fendona for Blitz. The swap is recorded, never silently normalised away.';

alter table job_material_usage enable row level security;
drop policy if exists tenant_isolation on job_material_usage;
create policy tenant_isolation on job_material_usage
  using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
grant select, insert on job_material_usage to mop_app;

-- Expected vs actual, ready to read. Variance in the item's own unit and as a
-- percentage, so "20 ml over" and "double the dose" are both visible.
create or replace view job_material_variance as
  select u.tenant_id, u.job_id, j.scheduled_date, j.customer_id,
         i.name as product, un.code as unit,
         u.expected_qty, u.actual_qty,
         u.actual_qty - u.expected_qty as variance,
         case when u.expected_qty > 0
              then round(((u.actual_qty - u.expected_qty) / u.expected_qty) * 100, 1) end as variance_pct,
         u.mixes, u.water_litres,
         s.name as substituted_for,
         u.over_expected_ack, u.note,
         (select t.full_name from job_assignments ja join technicians t on t.id = ja.technician_id
           where ja.job_id = u.job_id limit 1) as technician
    from job_material_usage u
    join jobs j on j.id = u.job_id
    join items i on i.id = u.item_id
    left join items s on s.id = u.substituted_for_item_id
    left join units un on un.id = u.unit_id;

grant select on job_material_variance to mop_app;
