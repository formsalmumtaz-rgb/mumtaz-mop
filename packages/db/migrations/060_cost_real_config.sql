-- 060_cost_real_config.sql
-- Costing engine - real configuration, part 1 of 3 (labour, vehicle, travel,
-- frequency, pricing reference). Replaces the ASSUMED placeholders seeded in
-- migrations 019/022/025 with owner-provided real numbers (12 Aug 2026), and
-- adds the parameters the pest-treatment costing engine (mig 062) reads.
--
-- Governed by: DECISIONS 7 (labour rate was a placeholder 1700/176; now real),
-- Art. X 4 (unknown values seeded ASSUMED + flagged + editable). Nothing here
-- touches a structural invariant: `settings` is editable config, not append-only;
-- no schema-immutable object is changed. Config-only; job_costs/journal untouched.
--
-- Provenance of every number is in each row's description. is_assumed=false means
-- owner-confirmed (clears the console warning badge); is_assumed=true stays flagged
-- and editable without a deploy.

-- ── Derivation helper: standard hourly labour rate from a cost basis ──────────
-- Fully-loaded monthly cost / productive hours. Lets the owner edit the basis and
-- recompute deterministically (derived, not typed - Art. IV / data-not-code).
create or replace function fn_labour_rate_from_basis(p_basis jsonb)
returns numeric language sql immutable as $$
  select round((
      coalesce((p_basis->>'basic')::numeric, 0)
    + coalesce((p_basis->>'accommodation')::numeric, 0)
    + coalesce((p_basis->>'visa_legal')::numeric, 0)
    + coalesce((p_basis->>'misc')::numeric, 0)
    + coalesce((p_basis->>'basic')::numeric, 0)
        * coalesce((p_basis->>'gratuity_days')::numeric, 0) / 365.0   -- gratuity accrual
  ) / nullif(coalesce((p_basis->>'productive_hours')::numeric, 0), 0), 4);
$$;
comment on function fn_labour_rate_from_basis(jsonb) is
  'Standard hourly labour rate = (basic+accommodation+visa_legal+misc + basic*gratuity_days/365) / productive_hours. Derived from cost.technician_cost_basis.';

do $$
declare
  v_tenant uuid;
  v_sl uuid;
  v_basis jsonb;
  v_rate numeric;
begin
  select id into v_tenant from tenants where name = 'Mumtaz Integrated Services Group';
  select id into v_sl from service_lines where tenant_id = v_tenant and code = 'pest_control';

  -- Owner-provided standard technician cost basis (monthly AED), 12 Aug 2026.
  v_basis := jsonb_build_object(
    'basic', 1200, 'accommodation', 200, 'visa_legal', 300, 'misc', 100,
    'gratuity_days', 21, 'productive_hours', 176,
    'gratuity_monthly', round(1200 * 21 / 365.0, 4),
    'monthly_total', round(1200 + 200 + 300 + 100 + 1200 * 21 / 365.0, 4),
    'currency', 'AED', 'source', 'owner 2026-08-12', 'note',
      'Standard/representative pest technician. Real per-technician cost lives in employee_cost_components when captured.'
  );
  v_rate := fn_labour_rate_from_basis(v_basis);  -- 10.6195

  -- 1. Technician cost basis (new, confirmed).
  insert into settings(tenant_id, service_line_id, key, value, description, is_assumed, confirmed_at)
  values (v_tenant, v_sl, 'cost.technician_cost_basis', v_basis,
    'Fully-loaded standard technician monthly cost basis; cost.standard_labour_rate_hourly derives from it via fn_labour_rate_from_basis.',
    false, now())
  on conflict (tenant_id, service_line_id, key) do update
    set value = excluded.value, description = excluded.description, is_assumed = false,
        confirmed_at = now(), updated_at = now();

  -- 2. Standard labour rate - real, derived (was ASSUMED 9.6591 = 1700/176).
  update settings set value = to_jsonb(v_rate), is_assumed = false, confirmed_at = now(), updated_at = now(),
    description = 'STANDARD labour absorption rate (AED/hr), DERIVED from cost.technician_cost_basis (monthly '
      || (v_basis->>'monthly_total') || ' / 176 productive hrs). Owner 2026-08-12. Replaces placeholder 9.6591 (1700/176).'
    where tenant_id = v_tenant and key = 'cost.standard_labour_rate_hourly';

  -- 3. Overhead rate - track new labour (still ASSUMED 15%).
  update settings set value = to_jsonb(round(v_rate * 0.15, 4)), is_assumed = true, updated_at = now(),
    description = 'Overhead absorption rate per labour hour (AED/hr) = 15% of labour rate. The 15% is ASSUMED - confirm.'
    where tenant_id = v_tenant and key = 'cost.overhead_rate_per_labour_hour';

  -- 4. Vehicle rate - fuel-derived (was ASSUMED 0.5). fuel_price / km_per_litre.
  insert into settings(tenant_id, service_line_id, key, value, description, is_assumed, confirmed_at) values
    (v_tenant, v_sl, 'cost.fuel_price_per_litre', to_jsonb(3.49::numeric),
      'Diesel/petrol pump price (AED/L). August 2026. EDITABLE - UAE fuel price is reset monthly.', false, now()),
    (v_tenant, v_sl, 'cost.vehicle_km_per_litre', to_jsonb(5::numeric),
      'Fleet fuel economy (km per litre) for pest service vehicles.', false, now())
  on conflict (tenant_id, service_line_id, key) do update
    set value = excluded.value, description = excluded.description, is_assumed = excluded.is_assumed,
        confirmed_at = now(), updated_at = now();

  update settings set value = to_jsonb(round(3.49 / 5.0, 4)), is_assumed = false, confirmed_at = now(), updated_at = now(),
    description = 'STANDARD vehicle rate (AED/km), DERIVED = fuel_price_per_litre / vehicle_km_per_litre (3.49/5). '
      || 'Fuel only; depreciation/lease is management-accounting (DECISIONS 7.3), never in job cost. Replaces placeholder 0.5.'
    where tenant_id = v_tenant and key = 'cost.standard_vehicle_rate_per_km';

  -- 5. Travel-in-labour parameters. Job paid time = treatment + travel (round trip).
  insert into settings(tenant_id, service_line_id, key, value, description, is_assumed) values
    (v_tenant, v_sl, 'cost.treatment_hours_per_visit', to_jsonb(1.0::numeric),
      'ASSUMED: on-site treatment hours for a standard visit (excludes travel).', true),
    (v_tenant, v_sl, 'cost.travel_speed_kmh', to_jsonb(32::numeric),
      'ASSUMED: average door-to-door travel speed (km/h) to convert round-trip distance into paid travel hours.', true),
    (v_tenant, v_sl, 'cost.default_job_one_way_km', to_jsonb(16::numeric),
      'ASSUMED: default one-way distance base->site (km) when a site has no measured route distance.', true)
  on conflict (tenant_id, service_line_id, key) do update
    set value = excluded.value, description = excluded.description, is_assumed = excluded.is_assumed, updated_at = now();

  -- 6. Frequency - municipality requirement (not negotiable, confirmed).
  insert into settings(tenant_id, service_line_id, key, value, description, is_assumed, confirmed_at) values
    (v_tenant, v_sl, 'schedule.fnb_visits_per_year', to_jsonb(24::numeric),
      'F&B pest-control visits per year in Sharjah & Dubai - MUNICIPALITY REQUIREMENT, not negotiable.', false, now())
  on conflict (tenant_id, service_line_id, key) do update
    set value = excluded.value, description = excluded.description, is_assumed = false, confirmed_at = now(), updated_at = now();

  -- 7. Pricing reference - seed BOTH ad-hoc and AMC; the 2.5x gap is flagged for the owner.
  insert into settings(tenant_id, service_line_id, key, value, description, is_assumed, confirmed_at) values
    (v_tenant, v_sl, 'pricing.pest_fnb_medium_adhoc_per_visit', to_jsonb(250::numeric),
      'Reference ad-hoc price for a medium restaurant single treatment (AED). Owner 2026-08-12.', false, now()),
    (v_tenant, v_sl, 'pricing.pest_fnb_medium_amc_per_visit', to_jsonb(100::numeric),
      'Reference AMC per-visit price for a medium restaurant (AED) = contract 1330/25: 2400 / 24 visits. '
      || 'FLAG: 2.5x below the ad-hoc rate (250) for the SAME service - review whether the AMC rate is sustainable.', false, now())
  on conflict (tenant_id, service_line_id, key) do update
    set value = excluded.value, description = excluded.description, is_assumed = false, confirmed_at = now(), updated_at = now();

  -- 8. Target margin - ASSUMED (owner to confirm); drives suggested minimum price.
  insert into settings(tenant_id, service_line_id, key, value, description, is_assumed) values
    (v_tenant, v_sl, 'cost.target_margin_default', to_jsonb(0.35::numeric),
      'ASSUMED target gross margin (fraction) for suggested minimum price. Confirm the real target.', true)
  on conflict (tenant_id, service_line_id, key) do update
    set value = excluded.value, description = excluded.description, updated_at = now();

  raise notice '060 applied: labour rate = % AED/hr; vehicle rate = % AED/km', v_rate, round(3.49/5.0,4);
end $$;
