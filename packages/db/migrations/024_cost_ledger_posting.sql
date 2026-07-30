-- 024_cost_ledger_posting.sql
-- Tier 1 · Item 2 — post absorbed costs and variances to the ledger.
-- Standard-costing flow (material already posts at 016; this covers labour /
-- vehicle / overhead):
--   * ABSORPTION (per job, atomic in fn_cost_job, gated): standard cost into the
--     P&L against a clearing account —
--       Dr 5200 Direct Labour  / Cr 2290 Labour Clearing
--       Dr 5300 Vehicle Cost    / Cr 2390 Vehicle Clearing
--       Dr 5400 Overhead        / Cr 2490 Overhead Clearing (only if enabled)
--     Recost reverses the superseded row's entry first; idempotent per row.
--   * VARIANCE close (fn_post_cost_variance, per period, idempotent): drain the
--     clearing balance against actuals and book the difference —
--       Labour:  Dr 2290 (absorbed) + Dr/Cr 5210 (variance) / Cr 2295 (actual accrual)
--       Vehicle: Dr 2390 (absorbed) + Dr/Cr 5310 (variance) / Cr 2100 (actual fuel)
--     Overhead has no actual source yet, so no overhead variance is posted.
--
-- Every entry balances (existing deferred debits=credits constraint). Additive:
-- one new ASSUMED account (2295) + functions; no table, no invariant relaxed.

-- 2295 Wages/Labour Accrual — the credit side of ACTUAL labour at period close.
-- A management accrual for the P&L, not WPS payroll (Art. XI: "we store, we export").
do $$
declare v_tenant uuid;
begin
  select id into v_tenant from tenants where name = 'Mumtaz Integrated Services Group';
  if v_tenant is null then return; end if;
  insert into accounts(tenant_id, code, name, account_type, is_assumed, assumed_note) values
    (v_tenant, '2295', 'Labour / Wages Accrual', 'liability', true, 'ASSUMED GL code — confirm')
  on conflict (tenant_id, code) do nothing;
  insert into settings(tenant_id, service_line_id, key, value, description, is_assumed) values
    (v_tenant, null, 'cost.account_code.labour_accrual', '"2295"'::jsonb, 'GL Cr actual labour at period close', true);
end $$;

-- Resolve an account id from a settings account-code mapping key.
create or replace function fn_cost_account(p_tenant uuid, p_key text)
returns uuid language sql stable as $$
  select a.id from settings s
    join accounts a on a.tenant_id = s.tenant_id and a.code = (s.value #>> '{}')
   where s.tenant_id = p_tenant and s.key = p_key
   limit 1;
$$;

-- Post (or reverse) the standard-cost absorption for one job_costs row.
-- No-op when nothing is postable (zero costs or unresolved accounts) so no empty
-- entry is created. Idempotent per (row, direction).
create or replace function fn_post_absorption(p_job_cost uuid, p_reverse boolean default false)
returns uuid language plpgsql as $$
declare
  jc record; v_entry uuid; v_src text;
  a_lab uuid; a_lab_clr uuid; a_veh uuid; a_veh_clr uuid; a_oh uuid; a_oh_clr uuid;
  lab_ok boolean; veh_ok boolean; oh_ok boolean;
begin
  select * into jc from job_costs where id = p_job_cost;
  if not found then return null; end if;
  v_src := case when p_reverse then 'cost_absorption_reversal' else 'cost_absorption' end;
  if exists (select 1 from journal_entries where tenant_id=jc.tenant_id and source_type=v_src and source_id=p_job_cost) then
    return null;
  end if;

  a_lab     := fn_cost_account(jc.tenant_id,'cost.account_code.labour');
  a_lab_clr := fn_cost_account(jc.tenant_id,'cost.account_code.labour_clearing');
  a_veh     := fn_cost_account(jc.tenant_id,'cost.account_code.vehicle');
  a_veh_clr := fn_cost_account(jc.tenant_id,'cost.account_code.vehicle_clearing');
  a_oh      := fn_cost_account(jc.tenant_id,'cost.account_code.overhead');
  a_oh_clr  := fn_cost_account(jc.tenant_id,'cost.account_code.overhead_clearing');

  lab_ok := coalesce(jc.labour_cost,0)  > 0 and a_lab is not null and a_lab_clr is not null;
  veh_ok := coalesce(jc.vehicle_cost,0) > 0 and a_veh is not null and a_veh_clr is not null;
  oh_ok  := coalesce(jc.overhead_cost,0)> 0 and a_oh  is not null and a_oh_clr  is not null;
  if not (lab_ok or veh_ok or oh_ok) then return null; end if;

  insert into journal_entries(tenant_id, service_line_id, source_type, source_id, memo)
    values (jc.tenant_id, jc.service_line_id, v_src, p_job_cost,
            (case when p_reverse then 'Reverse ' else '' end)||'standard cost absorption')
    returning id into v_entry;

  if lab_ok then
    insert into journal_lines(tenant_id, journal_entry_id, account_id, debit, credit, memo) values
      (jc.tenant_id, v_entry, a_lab,     case when p_reverse then 0 else jc.labour_cost end, case when p_reverse then jc.labour_cost else 0 end, 'Direct labour absorbed at standard'),
      (jc.tenant_id, v_entry, a_lab_clr, case when p_reverse then jc.labour_cost else 0 end, case when p_reverse then 0 else jc.labour_cost end, 'Labour absorption clearing');
  end if;
  if veh_ok then
    insert into journal_lines(tenant_id, journal_entry_id, account_id, debit, credit, memo) values
      (jc.tenant_id, v_entry, a_veh,     case when p_reverse then 0 else jc.vehicle_cost end, case when p_reverse then jc.vehicle_cost else 0 end, 'Vehicle absorbed at standard'),
      (jc.tenant_id, v_entry, a_veh_clr, case when p_reverse then jc.vehicle_cost else 0 end, case when p_reverse then 0 else jc.vehicle_cost end, 'Vehicle absorption clearing');
  end if;
  if oh_ok then
    insert into journal_lines(tenant_id, journal_entry_id, account_id, debit, credit, memo) values
      (jc.tenant_id, v_entry, a_oh,     case when p_reverse then 0 else jc.overhead_cost end, case when p_reverse then jc.overhead_cost else 0 end, 'Overhead absorbed at standard'),
      (jc.tenant_id, v_entry, a_oh_clr, case when p_reverse then jc.overhead_cost else 0 end, case when p_reverse then 0 else jc.overhead_cost end, 'Overhead absorption clearing');
  end if;
  return v_entry;
end $$;

-- Period variance close: drain the clearing balances against actuals, book the
-- difference to the variance accounts. Idempotent per period. Gated on config.
create or replace function fn_post_cost_variance(p_tenant uuid, p_from date, p_to date)
returns jsonb language plpgsql as $$
declare
  v_sl uuid; v_status jsonb; v_months numeric; e uuid;
  a_lab_clr uuid; a_lab_var uuid; a_accr uuid; a_veh_clr uuid; a_veh_var uuid; a_pay uuid;
  absorbed_lab numeric; actual_lab numeric; var_lab numeric;
  absorbed_veh numeric; actual_veh numeric; var_veh numeric;
begin
  select id into v_sl from service_lines where tenant_id=p_tenant and code='pest_control';
  v_status := fn_cost_config_status(p_tenant, v_sl);
  if not (v_status->>'ready')::boolean then
    return jsonb_build_object('status','not_configured','unconfirmed',v_status->'items');
  end if;
  if exists (select 1 from journal_entries where tenant_id=p_tenant and source_type='cost_variance'
               and memo like '%'||p_from::text||'..'||p_to::text||'%') then
    return jsonb_build_object('status','already_closed','period', p_from::text||'..'||p_to::text);
  end if;
  v_months := greatest((p_to - p_from)::numeric/30.0, 0.0001);

  a_lab_clr := fn_cost_account(p_tenant,'cost.account_code.labour_clearing');
  a_lab_var := fn_cost_account(p_tenant,'cost.account_code.labour_variance');
  a_accr    := fn_cost_account(p_tenant,'cost.account_code.labour_accrual');
  a_veh_clr := fn_cost_account(p_tenant,'cost.account_code.vehicle_clearing');
  a_veh_var := fn_cost_account(p_tenant,'cost.account_code.vehicle_variance');
  a_pay     := fn_cost_account(p_tenant,'inventory.account_code.payable');

  select coalesce(sum(credit-debit),0) into absorbed_lab from journal_lines where tenant_id=p_tenant and account_id=a_lab_clr;
  select coalesce(sum(credit-debit),0) into absorbed_veh from journal_lines where tenant_id=p_tenant and account_id=a_veh_clr;
  select coalesce(sum(monthly_employment_cost),0)*v_months into actual_lab from employee_cost_components where tenant_id=p_tenant and effective_to is null;
  select coalesce(sum(amount),0) into actual_veh from vehicle_fuel_purchases where tenant_id=p_tenant and purchase_date >= p_from and purchase_date < p_to;
  var_lab := actual_lab - absorbed_lab;
  var_veh := actual_veh - absorbed_veh;

  -- LABOUR: Dr clearing(absorbed) + Dr/Cr variance / Cr accrual(actual)
  if (absorbed_lab <> 0 or actual_lab <> 0) and a_lab_clr is not null and a_accr is not null and a_lab_var is not null then
    insert into journal_entries(tenant_id, service_line_id, source_type, memo)
      values (p_tenant, v_sl, 'cost_variance', 'Labour variance close '||p_from::text||'..'||p_to::text) returning id into e;
    if absorbed_lab <> 0 then insert into journal_lines(tenant_id,journal_entry_id,account_id,debit,credit,memo)
      values (p_tenant,e,a_lab_clr, greatest(absorbed_lab,0), greatest(-absorbed_lab,0), 'Clear absorbed labour'); end if;
    if actual_lab   <> 0 then insert into journal_lines(tenant_id,journal_entry_id,account_id,debit,credit,memo)
      values (p_tenant,e,a_accr, 0, actual_lab, 'Actual labour accrual'); end if;
    if var_lab      <> 0 then insert into journal_lines(tenant_id,journal_entry_id,account_id,debit,credit,memo)
      values (p_tenant,e,a_lab_var, greatest(var_lab,0), greatest(-var_lab,0), 'Labour variance'); end if;
  end if;

  -- VEHICLE: Dr clearing(absorbed) + Dr/Cr variance / Cr payable(actual fuel)
  if (absorbed_veh <> 0 or actual_veh <> 0) and a_veh_clr is not null and a_pay is not null and a_veh_var is not null then
    insert into journal_entries(tenant_id, service_line_id, source_type, memo)
      values (p_tenant, v_sl, 'cost_variance', 'Vehicle variance close '||p_from::text||'..'||p_to::text) returning id into e;
    if absorbed_veh <> 0 then insert into journal_lines(tenant_id,journal_entry_id,account_id,debit,credit,memo)
      values (p_tenant,e,a_veh_clr, greatest(absorbed_veh,0), greatest(-absorbed_veh,0), 'Clear absorbed vehicle'); end if;
    if actual_veh   <> 0 then insert into journal_lines(tenant_id,journal_entry_id,account_id,debit,credit,memo)
      values (p_tenant,e,a_pay, 0, actual_veh, 'Actual fuel payable'); end if;
    if var_veh      <> 0 then insert into journal_lines(tenant_id,journal_entry_id,account_id,debit,credit,memo)
      values (p_tenant,e,a_veh_var, greatest(var_veh,0), greatest(-var_veh,0), 'Vehicle variance'); end if;
  end if;

  return jsonb_build_object('status','closed','period',p_from::text||'..'||p_to::text,
    'absorbed_labour',round(absorbed_lab,2),'actual_labour',round(actual_lab,2),'labour_variance',round(var_lab,2),
    'absorbed_vehicle',round(absorbed_veh,2),'actual_vehicle',round(actual_veh,2),'vehicle_variance',round(var_veh,2));
end $$;

-- Extend fn_cost_job (023) to post absorption ATOMICALLY with the job_costs row:
-- reverse the superseded row's absorption, then post the new row's. Gated exactly
-- as before (no row and no posting while config is ASSUMED).
create or replace function fn_cost_job(p_job uuid)
returns jsonb language plpgsql as $$
declare
  j record; v_status jsonb;
  v_lab_rate numeric; v_veh_rate numeric; v_oh_on boolean; v_oh_rate numeric; v_kmph numeric;
  v_dur_min numeric; v_hours numeric := 0; v_lab_est boolean := false;
  r record; v_min numeric;
  v_distance numeric; v_dist_est boolean := false; v_fuel_est boolean;
  v_material numeric; v_revenue numeric; v_lab_cost numeric; v_veh_cost numeric; v_oh_cost numeric;
  v_conf text; v_prior uuid; v_new uuid;
begin
  select id, tenant_id, service_line_id, status, device_started_at, device_completed_at, started_at, completed_at
    into j from jobs where id = p_job;
  if not found then return jsonb_build_object('status','skipped','reason','job not found'); end if;
  if j.status <> 'completed' then return jsonb_build_object('status','skipped','reason','job not completed'); end if;

  v_status := fn_cost_config_status(j.tenant_id, j.service_line_id);
  if not (v_status->>'ready')::boolean then
    return jsonb_build_object('status','not_configured','unconfirmed',v_status->'items');
  end if;

  v_lab_rate := coalesce((select (value #>> '{}')::numeric from settings where tenant_id=j.tenant_id and key='cost.standard_labour_rate_hourly' and (service_line_id=j.service_line_id or service_line_id is null) order by service_line_id nulls last limit 1), 0);
  v_veh_rate := coalesce((select (value #>> '{}')::numeric from settings where tenant_id=j.tenant_id and key='cost.standard_vehicle_rate_per_km' and (service_line_id=j.service_line_id or service_line_id is null) order by service_line_id nulls last limit 1), 0);
  v_oh_on    := coalesce((select (value #>> '{}')::boolean from settings where tenant_id=j.tenant_id and key='cost.overhead_enabled' and (service_line_id=j.service_line_id or service_line_id is null) order by service_line_id nulls last limit 1), false);
  v_oh_rate  := coalesce((select (value #>> '{}')::numeric from settings where tenant_id=j.tenant_id and key='cost.overhead_rate_per_labour_hour' and (service_line_id=j.service_line_id or service_line_id is null) order by service_line_id nulls last limit 1), 0);
  v_kmph     := coalesce((select (value #>> '{}')::numeric from settings where tenant_id=j.tenant_id and key='cost.avg_km_per_hour' and (service_line_id=j.service_line_id or service_line_id is null) order by service_line_id nulls last limit 1), 20);

  v_dur_min := coalesce(
    extract(epoch from (j.device_completed_at - j.device_started_at))/60,
    extract(epoch from (j.completed_at - j.started_at))/60, 0);

  for r in select ja.technician_id from job_assignments ja where ja.job_id = p_job loop
    select coalesce(le.minutes, extract(epoch from (le.time_out - le.time_in))/60)
      into v_min from job_labour_entries le where le.job_id = p_job and le.technician_id = r.technician_id;
    if v_min is null then v_min := v_dur_min; v_lab_est := true; end if;
    v_hours := v_hours + coalesce(v_min,0)/60.0;
  end loop;
  if not exists (select 1 from job_assignments where job_id = p_job) then v_lab_est := true; end if;
  v_lab_cost := round(coalesce(v_lab_rate,0) * v_hours, 2);

  select distance_km into v_distance from job_distance where job_id = p_job;
  if v_distance is null then v_distance := round(v_hours * v_kmph, 2); v_dist_est := true; end if;
  v_veh_cost := round(coalesce(v_veh_rate,0) * v_distance, 2);
  v_fuel_est := not exists (
    select 1 from job_assignments ja
      join vehicles ve on ve.technician_id = ja.technician_id
      join vehicle_cost_per_km cpk on cpk.vehicle_id = ve.id
     where ja.job_id = p_job and cpk.cost_per_km is not null);

  if v_oh_on then v_oh_cost := round(coalesce(v_oh_rate,0) * v_hours, 2); else v_oh_cost := 0; end if;

  select coalesce(sum(jl.debit),0) into v_material
    from journal_entries je
    join journal_lines jl on jl.journal_entry_id = je.id and jl.debit > 0
    join stock_movements m on m.id = je.source_id
   where je.tenant_id = j.tenant_id and je.source_type = 'stock_valuation' and m.job_id = p_job;

  select sum(total) into v_revenue from invoices where job_id = p_job and status in ('queued','issued','paid');

  v_conf := case when v_lab_est or v_dist_est then 'estimated' else 'actual' end;
  select id into v_prior from job_cost_current where job_id = p_job;

  insert into job_costs(tenant_id, service_line_id, job_id, material_cost, labour_cost, vehicle_cost, overhead_cost,
      revenue, cost_confidence, labour_estimated, distance_estimated, fuel_estimated, overhead_included,
      labour_minutes, distance_km, standard_labour_rate, standard_vehicle_rate, overhead_rate, basis, supersedes)
    values (j.tenant_id, j.service_line_id, p_job, v_material, v_lab_cost, v_veh_cost, v_oh_cost,
      v_revenue, v_conf, v_lab_est, v_dist_est, v_fuel_est, v_oh_on,
      round(v_hours*60,1), v_distance, v_lab_rate, v_veh_rate, case when v_oh_on then v_oh_rate else null end,
      jsonb_build_object('labour_hours', v_hours, 'duration_min', v_dur_min), v_prior)
    returning id into v_new;

  -- GL absorption (024): reverse the superseded row, then post the new one.
  if v_prior is not null then perform fn_post_absorption(v_prior, true); end if;
  perform fn_post_absorption(v_new, false);

  return jsonb_build_object('status','costed','job_cost_id',v_new,'confidence',v_conf,
    'material',v_material,'labour',v_lab_cost,'vehicle',v_veh_cost,'overhead',v_oh_cost,'revenue',v_revenue,
    'total', v_material+v_lab_cost+v_veh_cost+v_oh_cost);
end $$;
