-- 130_expected_dose_and_equipment.sql
-- DEFECT 2 (pilot) — the two halves the technician actually sees:
--   (1) fn_expected_dose  — what they SHOULD use, computed before they treat.
--   (2) job_equipment_usage — which sprayer/duster/bait gun did the work.
-- Plus the append-only lock on job_material_usage that 129 left off, and the
-- soft-warning threshold as data (Art. X §4), not a constant in code.
--
-- Deterministic throughout (Art. IV): a formula over the customer's priced
-- category and the recipe version in force. No model call, no guess. Where the
-- inputs are absent the function SAYS SO instead of inventing a dose.

-- ── The expected dose ──────────────────────────────────────────────────
-- Lives in SQL, not in the app, for three reasons: the field sync needs it for
-- 500 jobs in one round-trip; the console shows the same number on the job page;
-- and the office variance report must agree with both. One definition.
create or replace function fn_expected_dose(p_tenant uuid, p_job uuid)
returns jsonb
language plpgsql stable as $$
declare
  v_job          record;
  v_cat          record;
  v_ver          record;
  v_product      record;
  v_mixes        numeric;
  v_per_mix      numeric;
  v_total        numeric;
  v_water        numeric;
  v_adjuvants    jsonb;
  v_alternatives jsonb;
  v_why          text;
begin
  select j.id, j.customer_id, j.recipe_version_id, cu.trade_name
    into v_job
    from jobs j join customers cu on cu.id = j.customer_id
   where j.id = p_job and j.tenant_id = p_tenant;
  if not found then return null; end if;

  -- The preset the office priced this customer from (§3.5): Restaurant B = 2 × 50 ml.
  select sc.name, sc.mixes, sc.ml_per_mix, sc.max_ml
    into v_cat
    from service_categories sc
   where sc.tenant_id = p_tenant and sc.is_active
     and sc.id = (select el.category_id
                    from estimate_lines el
                    join estimates e on e.id = el.estimate_id
                   where e.tenant_id = p_tenant and e.customer_id = v_job.customer_id
                     and el.category_id is not null
                   order by el.created_at desc limit 1);

  -- The job's frozen recipe version, else the service line's general spray.
  select v.*, r.name as recipe_name
    into v_ver
    from treatment_recipe_versions v
    join treatment_recipes r on r.id = v.recipe_id
   where v.id = coalesce(v_job.recipe_version_id,
                         (select v2.id from treatment_recipe_versions v2
                            join treatment_recipes r2 on r2.id = v2.recipe_id
                           where r2.tenant_id = p_tenant and r2.code = 'spray_general'
                             and v2.effective_to is null
                           order by v2.version_no desc limit 1));

  if v_ver.id is null then
    return jsonb_build_object(
      'recipe', null, 'recipe_version_id', null, 'product', null,
      'mixes', null, 'ml_per_mix', null, 'total_qty', null, 'water_litres', null,
      'adjuvants', '[]'::jsonb, 'alternatives', '[]'::jsonb,
      'category', v_cat.name, 'cap_qty', v_cat.max_ml,
      'why', 'No treatment recipe is set up for this job, so there is no expected dose to show. Record what you actually use.');
  end if;

  select i.id, i.name, coalesce(u.code, 'ml') as unit, i.substitution_group
    into v_product
    from items i left join units u on u.id = i.base_unit_id
   where i.id = v_ver.product_item_id;

  if v_product.id is null then
    return jsonb_build_object(
      'recipe', v_ver.recipe_name, 'recipe_version_id', v_ver.id, 'product', null,
      'mixes', null, 'ml_per_mix', null, 'total_qty', null, 'water_litres', null,
      'adjuvants', '[]'::jsonb, 'alternatives', '[]'::jsonb,
      'category', v_cat.name, 'cap_qty', v_cat.max_ml,
      'why', format('The recipe "%s" does not name a chemical yet, so nobody can say what the dose should be. Record what you actually use and the office will set the recipe.', v_ver.recipe_name));
  end if;

  v_mixes   := v_cat.mixes;
  v_per_mix := coalesce(v_cat.ml_per_mix, v_ver.dose_rate);
  v_total   := case when v_mixes is not null and v_per_mix is not null
                    then v_mixes * v_per_mix else v_per_mix end;
  -- dilution_value is the concentrate fraction: 50 ml in 10 L = 0.005.
  v_water   := case when v_total is not null and coalesce(v_ver.dilution_value, 0) > 0
                    then round((v_total / 1000.0) / v_ver.dilution_value, 1) end;

  select coalesce(jsonb_agg(jsonb_build_object(
           'item_id', i.id, 'name', i.name, 'unit', coalesce(u.code, 'ml'),
           'qty', round((a.dose_rate / nullif(a.per_litres, 0)) * v_water, 1))
         order by i.name), '[]'::jsonb)
    into v_adjuvants
    from treatment_recipe_adjuvants a
    join items i on i.id = a.item_id
    left join units u on u.id = a.dose_unit_id
   where a.tenant_id = p_tenant and a.version_id = v_ver.id and v_water is not null;

  -- What they may legitimately swap to. Same substitution group, nothing else —
  -- Fendona for Blitz, never Blitz for a rodent bait.
  select coalesce(jsonb_agg(jsonb_build_object(
           'item_id', i.id, 'name', i.name, 'unit', coalesce(u.code, 'ml')) order by i.name), '[]'::jsonb)
    into v_alternatives
    from items i left join units u on u.id = i.base_unit_id
   where i.tenant_id = p_tenant and i.is_active
     and v_product.substitution_group is not null
     and i.substitution_group = v_product.substitution_group
     and i.id <> v_product.id;

  v_why := case
    when v_mixes is not null then
      format('%s — %s mix%s of %s %s', coalesce(v_cat.name, v_ver.recipe_name),
             trim(to_char(v_mixes, 'FM999990.##')), case when v_mixes = 1 then '' else 'es' end,
             trim(to_char(v_per_mix, 'FM999990.##')), v_product.unit)
      || coalesce(format(' in %s L of water', trim(to_char(v_water, 'FM999990.#'))), '')
    else
      format('%s — %s %s', v_ver.recipe_name, trim(to_char(v_total, 'FM999990.##')), v_product.unit)
      || coalesce(format(' in %s L of water', trim(to_char(v_water, 'FM999990.#'))), '')
  end;

  return jsonb_build_object(
    'recipe', v_ver.recipe_name,
    'recipe_version_id', v_ver.id,
    'product', jsonb_build_object('item_id', v_product.id, 'name', v_product.name,
                                  'unit', v_product.unit,
                                  'substitution_group', v_product.substitution_group),
    'mixes', v_mixes, 'ml_per_mix', v_per_mix, 'total_qty', v_total, 'water_litres', v_water,
    'adjuvants', v_adjuvants, 'alternatives', v_alternatives,
    'category', v_cat.name, 'cap_qty', v_cat.max_ml, 'why', v_why);
end $$;

comment on function fn_expected_dose(uuid, uuid) is
  'What the technician SHOULD use on this job: the priced service category crossed with the recipe version in force. Returns null for an unknown job; returns a why-not sentence rather than a fabricated dose when the recipe names no chemical (defect 2B).';

grant execute on function fn_expected_dose(uuid, uuid) to mop_app;

-- ── Equipment actually used ────────────────────────────────────────────
-- The pre-flight asks whether the sprayer is on the van. This records which
-- one did the work, per job — the other half the owner asked for.
create table if not exists job_equipment_usage (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id),
  job_id       uuid not null references jobs(id),
  equipment_code text not null,
  note         text,
  client_uuid  uuid unique,
  device_time  timestamptz,
  created_at   timestamptz not null default now(),
  created_by   uuid
);
create index if not exists job_equipment_usage_job_idx on job_equipment_usage (tenant_id, job_id);
comment on table job_equipment_usage is
  'Which equipment was used on a job, from the pre-flight equipment checklist codes. Append-only.';

alter table job_equipment_usage enable row level security;
drop policy if exists tenant_isolation on job_equipment_usage;
create policy tenant_isolation on job_equipment_usage
  using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
grant select, insert on job_equipment_usage to mop_app;

-- ── Append-only, enforced, not merely ungranted ────────────────────────
-- 129 withheld the UPDATE/DELETE grant. That stops mop_app and nothing else.
-- Material usage is part of the service record (Art. VII §2): lock it properly.
drop trigger if exists job_material_usage_append_only on job_material_usage;
create trigger job_material_usage_append_only
  before update or delete on job_material_usage
  for each row execute function enforce_append_only();

drop trigger if exists job_equipment_usage_append_only on job_equipment_usage;
create trigger job_equipment_usage_append_only
  before update or delete on job_equipment_usage
  for each row execute function enforce_append_only();

-- ── The soft warning threshold, as data ────────────────────────────────
-- Art. X §4: the number nobody has confirmed is seeded ASSUMED and editable from
-- settings. It warns; it NEVER blocks — that is the owner's explicit instruction.
insert into settings (tenant_id, service_line_id, key, value, is_assumed, description)
select t.id, null, 'dosing.over_expected_warn_pct', '100'::jsonb, true,
       'ASSUMED: warn when actual use exceeds the expected dose by this percentage (100 = double the expected amount). A SOFT warning only — the technician confirms and carries on. Never blocks completion.'
  from tenants t
 where not exists (select 1 from settings s
                    where s.tenant_id = t.id and s.service_line_id is null
                      and s.key = 'dosing.over_expected_warn_pct');
