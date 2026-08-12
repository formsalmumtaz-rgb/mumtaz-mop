-- 062_treatment_costing_engine.sql
-- Costing engine — real configuration, part 3 of 3 (consumption, cycle, engine).
--
-- Adds:
--   * fn_setting_num(tenant, service_line, key)      — scoped numeric setting reader
--   * treatment_visit_consumption                    — per-m² material consumption by visit type
--   * treatment.cycle_pattern / treatment.gel_visits_per_year  — the visit cycle (configurable)
--   * fn_pest_treatment_costing(...)                 — the survey→annual-plan costing engine
--
-- Consumption is DERIVED and flagged ASSUMED (Art. X §4):
--   spray  Blitz 50 ml + Pro Surfactant 10 ml cover a medium restaurant (recipe
--          coverage 200 m²)  ->  Blitz 0.25 ml/m², Surfactant 0.05 ml/m²
--   gel    9 g covers a 2BHK apartment (~100 m²)  ->  0.09 g/m²
-- The 200 m² medium-restaurant area is itself an assumption (recipe-derived).
--
-- New table follows the baseline convention (tenant_id, RLS tenant_isolation,
-- grant to mop_app). It is editable config, not a transaction record — not
-- append-only. No structural invariant touched. The engine is STABLE (reads only).

-- ── Scoped numeric setting reader ───────────────────────────────────────────
create or replace function fn_setting_num(p_tenant uuid, p_service_line uuid, p_key text)
returns numeric language sql stable as $$
  select (value #>> '{}')::numeric from settings
   where tenant_id = p_tenant and key = p_key
     and (service_line_id = p_service_line or service_line_id is null)
   order by service_line_id nulls last limit 1;
$$;
grant execute on function fn_setting_num(uuid, uuid, text) to mop_app;
grant execute on function fn_labour_rate_from_basis(jsonb) to mop_app;

-- ── Per-m² material consumption by visit type ───────────────────────────────
create table if not exists treatment_visit_consumption (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id),
  service_line_id  uuid references service_lines(id),
  visit_type       text not null check (visit_type in ('spray','gel','inspection')),
  item_id          uuid not null references items(id),
  qty_per_m2       numeric not null check (qty_per_m2 >= 0),  -- in the item's base unit per m²
  is_assumed       boolean not null default false,
  assumed_note     text,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(), created_by uuid,
  updated_at       timestamptz not null default now(), updated_by uuid,
  unique (tenant_id, service_line_id, visit_type, item_id)
);
alter table treatment_visit_consumption enable row level security;
create policy tenant_isolation on treatment_visit_consumption
  using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
grant select, insert, update, delete on treatment_visit_consumption to mop_app;

-- ── Seed consumption + cycle ────────────────────────────────────────────────
do $$
declare
  v_tenant uuid; v_sl uuid; i_blitz uuid; i_surf uuid; i_gel uuid;
begin
  select id into v_tenant from tenants where name = 'Mumtaz Integrated Services Group';
  select id into v_sl from service_lines where tenant_id = v_tenant and code = 'pest_control';
  select id into i_blitz from items where tenant_id = v_tenant and code = 'CHEM_BLITZ_RS';
  select id into i_surf  from items where tenant_id = v_tenant and code = 'CHEM_PRO_SURF';
  select id into i_gel   from items where tenant_id = v_tenant and code = 'CHEM_GEL_BAIT';

  insert into treatment_visit_consumption(tenant_id, service_line_id, visit_type, item_id, qty_per_m2, is_assumed, assumed_note) values
    (v_tenant, v_sl, 'spray', i_blitz, 0.25, true, 'DERIVED: 50 ml Blitz over a medium restaurant (recipe coverage 200 m²). The 200 m² area is assumed.'),
    (v_tenant, v_sl, 'spray', i_surf, 0.05, true, 'DERIVED: 10 ml Pro Surfactant over 200 m². Surfactant landed cost is itself ASSUMED (BLOCKED A13).'),
    (v_tenant, v_sl, 'gel',   i_gel,  0.09, true, 'DERIVED: 9 g gel covers a 2BHK apartment (~100 m²). Estimate by area; actual grams are recorded per job and variance self-corrects the rate.')
  on conflict (tenant_id, service_line_id, visit_type, item_id) do update
    set qty_per_m2 = excluded.qty_per_m2, is_assumed = excluded.is_assumed, assumed_note = excluded.assumed_note, updated_at = now();

  insert into settings(tenant_id, service_line_id, key, value, description, is_assumed) values
    (v_tenant, v_sl, 'treatment.cycle_pattern',
      '["spray","gel","spray","spray","inspection"]'::jsonb,
      'ASSUMED treatment cycle (repeats): v1 spray, v2 gel, v3 spray, v4 spray, v5 inspection-led (gel if activity else spray). Configurable per service category later.', true),
    (v_tenant, v_sl, 'treatment.gel_visits_per_year', to_jsonb(6::numeric),
      'ASSUMED gel visits per 24-visit year (rest are spray). Drives annual material mix.', true)
  on conflict (tenant_id, service_line_id, key) do update
    set value = excluded.value, description = excluded.description, is_assumed = excluded.is_assumed, updated_at = now();
end $$;

-- ── The costing engine ──────────────────────────────────────────────────────
-- Given a site (area, distance) returns the full annual pest-treatment costing:
-- per-visit material/labour(incl. travel)/fuel/overhead, annual direct cost,
-- suggested minimum price at a target margin, and margin at any price entered.
create or replace function fn_pest_treatment_costing(
  p_tenant          uuid,
  p_service_line    uuid,
  p_area_m2         numeric,
  p_one_way_km      numeric  default null,   -- null → cost.default_job_one_way_km
  p_visits_per_year integer  default null,   -- null → schedule.fnb_visits_per_year
  p_gel_visits      integer  default null,   -- null → treatment.gel_visits_per_year
  p_target_margin   numeric  default null,   -- null → cost.target_margin_default
  p_price_per_visit numeric  default null    -- optional: margin at this price
) returns jsonb language plpgsql stable as $$
declare
  s_labour numeric; s_fuel_price numeric; s_km_per_l numeric;
  s_treat_hours numeric; s_travel_speed numeric; s_default_km numeric;
  s_overhead_enabled boolean; s_overhead_rate numeric; s_margin numeric;
  one_way numeric; round_trip numeric; travel_hours numeric; labour_hours numeric;
  labour_pv numeric; fuel_pv numeric; overhead_pv numeric;
  rate_spray numeric; rate_gel numeric; mat_spray numeric; mat_gel numeric;
  spray_pv numeric; gel_pv numeric;
  n_visits int; n_gel int; n_spray int;
  ann_material numeric; ann_labour numeric; ann_fuel numeric; ann_overhead numeric; ann_direct numeric;
  cost_pv numeric; suggested_pv numeric;
  assumptions jsonb; any_assumed boolean;
  margin_at_price numeric; ann_revenue numeric; ann_profit numeric;
begin
  s_labour       := coalesce(fn_setting_num(p_tenant, p_service_line, 'cost.standard_labour_rate_hourly'), 0);
  s_fuel_price   := coalesce(fn_setting_num(p_tenant, p_service_line, 'cost.fuel_price_per_litre'), 0);
  s_km_per_l     := nullif(coalesce(fn_setting_num(p_tenant, p_service_line, 'cost.vehicle_km_per_litre'), 0), 0);
  s_treat_hours  := coalesce(fn_setting_num(p_tenant, p_service_line, 'cost.treatment_hours_per_visit'), 0);
  s_travel_speed := nullif(coalesce(fn_setting_num(p_tenant, p_service_line, 'cost.travel_speed_kmh'), 0), 0);
  s_default_km   := coalesce(fn_setting_num(p_tenant, p_service_line, 'cost.default_job_one_way_km'), 0);
  s_overhead_rate:= coalesce(fn_setting_num(p_tenant, p_service_line, 'cost.overhead_rate_per_labour_hour'), 0);
  select coalesce((value #>> '{}')::boolean, false) into s_overhead_enabled from settings
    where tenant_id = p_tenant and key = 'cost.overhead_enabled'
      and (service_line_id = p_service_line or service_line_id is null) order by service_line_id nulls last limit 1;

  one_way    := coalesce(p_one_way_km, s_default_km);
  round_trip := one_way * 2;
  travel_hours := case when s_travel_speed is null then 0 else round(round_trip / s_travel_speed, 4) end;
  labour_hours := s_treat_hours + travel_hours;               -- travel time IS paid labour
  labour_pv    := round(labour_hours * s_labour, 2);
  fuel_pv      := case when s_km_per_l is null then 0 else round(round_trip / s_km_per_l * s_fuel_price, 2) end;
  overhead_pv  := case when s_overhead_enabled then round(s_overhead_rate * labour_hours, 2) else 0 end;

  -- per-m² material cost by visit type (Σ qty_per_m2 × landed unit cost)
  select coalesce(sum(c.qty_per_m2 * fn_item_standard_cost(p_tenant, c.item_id)), 0) into rate_spray
    from treatment_visit_consumption c
   where c.tenant_id = p_tenant and (c.service_line_id = p_service_line or c.service_line_id is null)
     and c.visit_type = 'spray' and c.is_active;
  select coalesce(sum(c.qty_per_m2 * fn_item_standard_cost(p_tenant, c.item_id)), 0) into rate_gel
    from treatment_visit_consumption c
   where c.tenant_id = p_tenant and (c.service_line_id = p_service_line or c.service_line_id is null)
     and c.visit_type = 'gel' and c.is_active;
  mat_spray := round(coalesce(p_area_m2, 0) * rate_spray, 2);
  mat_gel   := round(coalesce(p_area_m2, 0) * rate_gel, 2);

  spray_pv := round(mat_spray + labour_pv + fuel_pv + overhead_pv, 2);
  gel_pv   := round(mat_gel   + labour_pv + fuel_pv + overhead_pv, 2);

  n_visits := coalesce(p_visits_per_year, fn_setting_num(p_tenant, p_service_line, 'schedule.fnb_visits_per_year')::int, 24);
  n_gel    := coalesce(p_gel_visits, fn_setting_num(p_tenant, p_service_line, 'treatment.gel_visits_per_year')::int, 6);
  n_spray  := greatest(n_visits - n_gel, 0);

  ann_material := round(n_spray * mat_spray + n_gel * mat_gel, 2);
  ann_labour   := round(n_visits * labour_pv, 2);
  ann_fuel     := round(n_visits * fuel_pv, 2);
  ann_overhead := round(n_visits * overhead_pv, 2);
  ann_direct   := round(ann_material + ann_labour + ann_fuel + ann_overhead, 2);
  cost_pv      := case when n_visits > 0 then round(ann_direct / n_visits, 2) else 0 end;

  s_margin     := coalesce(p_target_margin, fn_setting_num(p_tenant, p_service_line, 'cost.target_margin_default'), 0);
  suggested_pv := case when s_margin < 1 then round(cost_pv / (1 - s_margin), 2) else null end;

  if p_price_per_visit is not null then
    ann_revenue := round(p_price_per_visit * n_visits, 2);
    ann_profit  := round(ann_revenue - ann_direct, 2);
    margin_at_price := case when p_price_per_visit <> 0 then round((p_price_per_visit - cost_pv) / p_price_per_visit * 100, 1) else null end;
  end if;

  -- which inputs are assumptions (flag, never present as fact)
  select coalesce(jsonb_agg(distinct x order by x), '[]'::jsonb) into assumptions from (
    select key as x from settings where tenant_id = p_tenant and is_assumed
      and key in ('cost.treatment_hours_per_visit','cost.travel_speed_kmh','cost.default_job_one_way_km',
                  'cost.target_margin_default','cost.overhead_rate_per_labour_hour',
                  'treatment.gel_visits_per_year','treatment.cycle_pattern')
    union all
    select 'consumption:' || c.visit_type as x from treatment_visit_consumption c
      where c.tenant_id = p_tenant and c.is_assumed and (c.service_line_id = p_service_line or c.service_line_id is null)
    union all
    select 'material:' || it.name as x from items it
      join treatment_visit_consumption c on c.item_id = it.id
      where c.tenant_id = p_tenant and it.is_assumed and (c.service_line_id = p_service_line or c.service_line_id is null)
  ) s;
  any_assumed := jsonb_array_length(assumptions) > 0;

  return jsonb_build_object(
    'inputs', jsonb_build_object(
      'area_m2', p_area_m2, 'one_way_km', one_way, 'round_trip_km', round_trip,
      'visits_per_year', n_visits, 'gel_visits', n_gel, 'spray_visits', n_spray),
    'per_visit', jsonb_build_object(
      'treatment_hours', s_treat_hours, 'travel_hours', travel_hours, 'labour_hours', labour_hours,
      'labour_cost', labour_pv, 'fuel_cost', fuel_pv, 'overhead_cost', overhead_pv,
      'spray', jsonb_build_object('material_cost', mat_spray, 'total_cost', spray_pv),
      'gel',   jsonb_build_object('material_cost', mat_gel,   'total_cost', gel_pv)),
    'annual', jsonb_build_object(
      'material', ann_material, 'labour', ann_labour, 'fuel', ann_fuel, 'overhead', ann_overhead,
      'total_direct_cost', ann_direct, 'cost_per_visit_blended', cost_pv),
    'pricing', jsonb_build_object(
      'target_margin', s_margin,
      'suggested_min_price_per_visit', suggested_pv,
      'suggested_min_annual', case when suggested_pv is not null then round(suggested_pv * n_visits, 2) else null end,
      'adhoc_reference_per_visit', fn_setting_num(p_tenant, p_service_line, 'pricing.pest_fnb_medium_adhoc_per_visit'),
      'amc_reference_per_visit',   fn_setting_num(p_tenant, p_service_line, 'pricing.pest_fnb_medium_amc_per_visit')),
    'at_price', case when p_price_per_visit is not null then jsonb_build_object(
      'price_per_visit', p_price_per_visit, 'annual_revenue', ann_revenue,
      'annual_profit', ann_profit, 'margin_pct', margin_at_price) else null end,
    'is_assumed', any_assumed,
    'assumptions', assumptions);
end $$;
grant execute on function fn_pest_treatment_costing(uuid, uuid, numeric, numeric, integer, integer, numeric, numeric) to mop_app;
