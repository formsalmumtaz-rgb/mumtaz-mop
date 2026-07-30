-- 027_costing_gate_fail_closed.sql
-- Harden the environment binding to FAIL CLOSED.
--
-- mig 026 used a DENYLIST ("allow assumed costing unless app.environment =
-- 'production'"). That fails OPEN: an unset, empty, misspelled, or garbage value
-- (exactly the first-deploy case where MOP_ENV is forgotten) is NOT 'production',
-- so it was wrongly ALLOWED. Replace with an ALLOWLIST: assumed costing is
-- permitted ONLY when app.environment is an explicit, recognised non-production
-- value. Everything else — unset, empty, 'production', or anything unrecognised —
-- BLOCKS. Never fail open.
--
-- Function body only; no schema change, no invariant relaxed.

create or replace function fn_cost_config_status(p_tenant uuid, p_service_line uuid)
returns jsonb language plpgsql stable as $$
declare
  missing text[] := '{}'; assumed text[] := '{}'; items text[];
  v_allow boolean; v_oh_on boolean; v_env text; v_toggle boolean;
  v_val numeric; v_asm boolean; v_ready boolean;
begin
  -- FAIL CLOSED: unset/empty => 'unset'; only an explicit dev/staging value permits
  -- assumed costing. Unknown/garbage/'production' all block.
  v_env := lower(coalesce(nullif(trim(current_setting('app.environment', true)), ''), 'unset'));
  v_toggle := coalesce((select (value #>> '{}')::boolean from settings where tenant_id=p_tenant and key='cost.allow_assumed_costing' limit 1), false);
  v_allow := v_toggle and v_env in ('development','staging','dev','test');

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
