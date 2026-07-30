-- 025_dev_cost_config_vehicle_ownership.sql
-- Two things:
--  (1) Let development proceed on ASSUMED cost configuration WITHOUT weakening the
--      production gate. The strict "refuse to compute while ASSUMED" rule stays the
--      DEFAULT; a reversible per-tenant toggle cost.allow_assumed_costing (ASSUMED,
--      set true for dev) lets set-but-ASSUMED values compute, and fn_cost_config_status
--      now reports config_assumed so every figure can be flagged (Art. X §4: use-but-
--      flag, never present an assumption as fact).
--  (2) Vehicle ownership model + monthly depreciation/lease. This is MANAGEMENT
--      ACCOUNTING ONLY: it must never enter operational/job/technician/customer
--      profitability. It is therefore NOT added to job_costs; it lives solely in
--      fn_management_profit (Operating Profit vs Net Profit).
--
-- Additive: vehicle columns + function bodies + seeded ASSUMED settings. No table,
-- no invariant relaxed; job_costs (operational) is untouched.

-- ── Vehicle ownership + fixed monthly cost (management-only) ────────────
alter table vehicles add column ownership_type text not null default 'company_owned'
  check (ownership_type in ('company_owned','leased','rented'));
alter table vehicles add column monthly_depreciation numeric check (monthly_depreciation is null or monthly_depreciation >= 0);
alter table vehicles add column monthly_lease_cost   numeric check (monthly_lease_cost is null or monthly_lease_cost >= 0);
alter table vehicles add column monthly_fixed_cost numeric generated always as (
  case ownership_type when 'company_owned' then coalesce(monthly_depreciation,0)
                      else coalesce(monthly_lease_cost,0) end
) stored;

-- ── Gate: missing (blocks) vs assumed (allowed when toggled) ────────────
create or replace function fn_cost_config_status(p_tenant uuid, p_service_line uuid)
returns jsonb language plpgsql stable as $$
declare
  missing text[] := '{}'; assumed text[] := '{}'; items text[];
  v_allow boolean; v_oh_on boolean;
  v_val numeric; v_asm boolean; v_ready boolean;
begin
  v_allow := coalesce((select (value #>> '{}')::boolean from settings where tenant_id=p_tenant and key='cost.allow_assumed_costing' limit 1), false);

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

  -- accounts: only flag those that EXIST and are ASSUMED (missing accounts just mean
  -- no GL posting, they never block compute — preserves prior behaviour)
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
    'unconfirmed', coalesce(array_length(items,1),0),
    'items', to_jsonb(items),
    'assumed_items', to_jsonb(assumed),
    'missing_items', to_jsonb(missing));
end $$;

-- ── Management profit: Operating (default) vs Net (after depreciation/lease) ──
-- Depreciation/lease is allocated ONLY here, never in job_costs. Operating Profit
-- is the operational default; Net Profit is management reporting only.
create or replace function fn_management_profit(p_tenant uuid, p_from date, p_to date)
returns jsonb language plpgsql stable as $$
declare v_rev numeric; v_cost numeric; v_op numeric; v_dep numeric; v_months numeric;
begin
  v_months := greatest((p_to - p_from)::numeric/30.0, 0.0001);
  select coalesce(sum(revenue),0), coalesce(sum(total_cost),0), coalesce(sum(gross_profit),0)
    into v_rev, v_cost, v_op
    from job_profitability
   where tenant_id=p_tenant and completed_at >= p_from and completed_at < (p_to + 1);
  select coalesce(sum(monthly_fixed_cost),0) * v_months into v_dep
    from vehicles where tenant_id=p_tenant and is_active;
  return jsonb_build_object(
    'operating_revenue', round(v_rev,2),
    'operating_cost',    round(v_cost,2),
    'operating_profit',  round(v_op,2),
    'depreciation_lease',round(v_dep,2),
    'net_profit',        round(v_op - v_dep,2),
    'note', 'Operating Profit excludes depreciation/lease (operational default). Net Profit is management reporting only.');
end $$;

-- ── Seed ASSUMED development configuration on the live tenant ───────────
do $$
declare v_tenant uuid; v_sl uuid; v_lab numeric;
begin
  select id into v_tenant from tenants where name = 'Mumtaz Integrated Services Group';
  if v_tenant is null then return; end if;
  select id into v_sl from service_lines where tenant_id = v_tenant and code = 'pest_control';
  v_lab := round(1700.0 / 176.0, 4);   -- standard technician employment cost / productive hours

  update settings set value = to_jsonb(v_lab),               is_assumed = true  where tenant_id=v_tenant and key='cost.standard_labour_rate_hourly';
  update settings set value = '0.5'::jsonb,                   is_assumed = true  where tenant_id=v_tenant and key='cost.standard_vehicle_rate_per_km';
  update settings set value = 'true'::jsonb,                  is_assumed = false where tenant_id=v_tenant and key='cost.overhead_enabled';
  update settings set value = to_jsonb(round(v_lab*0.15,4)),  is_assumed = true  where tenant_id=v_tenant and key='cost.overhead_rate_per_labour_hour';

  insert into settings(tenant_id, service_line_id, key, value, description, is_assumed) values
    (v_tenant, v_sl,  'cost.allow_assumed_costing', 'true'::jsonb, 'DEV: compute costs on ASSUMED config (every figure flagged). Turn OFF for production strictness.', true),
    (v_tenant, null,  'cost.default_monthly_depreciation', '1750'::jsonb, 'Default company-owned vehicle depreciation (AED/month) — MANAGEMENT ACCOUNTING ONLY, never in operational profit', true)
  on conflict (tenant_id, service_line_id, key) do update set value = excluded.value, is_assumed = excluded.is_assumed;
end $$;
