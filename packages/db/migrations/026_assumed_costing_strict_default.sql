-- 026_assumed_costing_strict_default.sql
-- Strict-block is the DEFAULT; computing on ASSUMED cost config is opt-in for dev
-- only, and CANNOT take effect in production regardless of the setting.
--
-- Environment binding: fn_cost_config_status now reads the GUC `app.environment`
-- (missing => 'production'). Assumed costing is permitted only when the per-tenant
-- toggle cost.allow_assumed_costing is true AND the environment is NOT production.
-- So production is fail-safe: unset env => production => assumed costing is denied
-- even if the toggle was somehow left on.
--
-- Byte-identical/additive: function body only + flips the seeded toggle to false
-- (strict default). Per-environment specifics (setting app.environment, and the
-- dev opt-in) are environment configuration, applied out of band and recorded in
-- DECISIONS.md — never seeded true by this migration, so a fresh production build
-- is strict by default.

create or replace function fn_cost_config_status(p_tenant uuid, p_service_line uuid)
returns jsonb language plpgsql stable as $$
declare
  missing text[] := '{}'; assumed text[] := '{}'; items text[];
  v_allow boolean; v_oh_on boolean; v_env text;
  v_val numeric; v_asm boolean; v_ready boolean;
begin
  -- environment binding: unknown/unset => production => never allow assumed costing
  v_env := lower(coalesce(nullif(current_setting('app.environment', true), ''), 'production'));
  v_allow := coalesce((select (value #>> '{}')::boolean from settings where tenant_id=p_tenant and key='cost.allow_assumed_costing' limit 1), false)
             and v_env <> 'production';

  select (value #>> '{}')::numeric, is_assumed into v_val, v_asm from settings
    where tenant_id=p_tenant and key='cost.standard_labour_rate_hourly' order by service_line_id nulls last limit 1;
  if coalesce(v_val,0) <= 0 then missing := array_append(missing,'standard labour rate');
  elsif v_asm then assumed := array_append(assumed,'standard labour rate'); end if;

  select (value #>> '{}')::numeric, is_assumed into v_val, v_asm from settings
    where tenant_id=p_tenant and key='cost.standard_vehicle_rate_per_km' order by service_line_id nulls last limit 1;
  if coalesce(v_val,0) <= 0 then missing := array_append(missing,'standard vehicle rate');
  elsif v_asm then assumed := array_append(assumed,'standard vehicle rate'); end if;

  v_oh_on := coalesce((select (value #>> '{}')::boolean from settings where tenant_id=p_tenant and key='cost.overhead_enabled' limit 1), false);
  if v_oh_on then
    select (value #>> '{}')::numeric, is_assumed into v_val, v_asm from settings
      where tenant_id=p_tenant and key='cost.overhead_rate_per_labour_hour' order by service_line_id nulls last limit 1;
    if coalesce(v_val,0) <= 0 then missing := array_append(missing,'overhead rate');
    elsif v_asm then assumed := array_append(assumed,'overhead rate'); end if;
  end if;

  if exists (select 1 from accounts where tenant_id=p_tenant and code in ('5200','5210','2290','5300','5310','2390') and is_assumed) then
    assumed := array_append(assumed,'GL account codes (labour, vehicle)');
  end if;
  if v_oh_on and exists (select 1 from accounts where tenant_id=p_tenant and code in ('5400','5410','2490') and is_assumed) then
    assumed := array_append(assumed,'GL account codes (overhead)');
  end if;

  v_ready := (array_length(missing,1) is null) and (v_allow or array_length(assumed,1) is null);
  items := missing || (case when v_allow then '{}'::text[] else assumed end);
  return jsonb_build_object(
    'ready', v_ready,
    'config_assumed', array_length(assumed,1) is not null,
    'environment', v_env,
    'assumed_allowed', v_allow,
    'unconfirmed', coalesce(array_length(items,1),0),
    'items', to_jsonb(items),
    'assumed_items', to_jsonb(assumed),
    'missing_items', to_jsonb(missing));
end $$;

-- Strict default everywhere this migration runs (incl. a fresh production build).
-- Dev re-enables out of band (env-bound), recorded in DECISIONS.md.
do $$
declare v_tenant uuid;
begin
  select id into v_tenant from tenants where name = 'Mumtaz Integrated Services Group';
  if v_tenant is null then return; end if;
  update settings set value = 'false'::jsonb, is_assumed = true
    where tenant_id = v_tenant and key = 'cost.allow_assumed_costing';
end $$;
