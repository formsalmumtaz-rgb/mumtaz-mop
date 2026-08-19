-- 131_job_carries_its_category.sql
-- The expected dose in 130 inferred the customer's service category from their
-- most recent estimate line. That is wobbly: re-quote a customer and yesterday's
-- job silently changes its expected dose, and a customer with two priced
-- categories (a restaurant and a warehouse) gets whichever line was typed last.
--
-- A job is a transaction record, so it carries its own frozen category — the same
-- rule already applied to recipe_version_id. The estimate lookup stays as a last
-- resort for jobs created before this, and the function now SAYS which source it
-- used so nobody has to guess.

alter table contract_services add column if not exists service_category_id uuid references service_categories(id);
alter table jobs             add column if not exists service_category_id uuid references service_categories(id);

comment on column jobs.service_category_id is
  'The priced service preset this visit is for (Restaurant B, Warehouse C...). Frozen on the job so the expected dose cannot drift when the customer is re-quoted.';
comment on column contract_services.service_category_id is
  'The priced preset behind this contracted service; jobs generated from it inherit it.';

create index if not exists jobs_service_category_idx on jobs (tenant_id, service_category_id);

-- Existing jobs: inherit from the contract service where one is set. Nothing is
-- invented — a job with no contract service keeps a null and falls back.
update jobs j
   set service_category_id = cs.service_category_id
  from contract_services cs
 where cs.id = j.contract_service_id
   and j.service_category_id is null
   and cs.service_category_id is not null;

create or replace function fn_expected_dose(p_tenant uuid, p_job uuid)
returns jsonb
language plpgsql stable as $$
declare
  v_job          record;
  v_cat          record;
  v_cat_src      text;
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
  select j.id, j.customer_id, j.recipe_version_id, j.service_category_id,
         j.contract_service_id, cu.trade_name
    into v_job
    from jobs j join customers cu on cu.id = j.customer_id
   where j.id = p_job and j.tenant_id = p_tenant;
  if not found then return null; end if;

  -- The preset, in order of authority: frozen on the job; else the contracted
  -- service; else the customer's latest priced line (deterministic tiebreak).
  select sc.name, sc.mixes, sc.ml_per_mix, sc.max_ml, 'job' as src
    into v_cat
    from service_categories sc
   where sc.tenant_id = p_tenant and sc.id = v_job.service_category_id;

  if v_cat.name is null and v_job.contract_service_id is not null then
    select sc.name, sc.mixes, sc.ml_per_mix, sc.max_ml, 'contract' as src
      into v_cat
      from contract_services cs
      join service_categories sc on sc.id = cs.service_category_id
     where cs.id = v_job.contract_service_id and cs.tenant_id = p_tenant;
  end if;

  if v_cat.name is null then
    select sc.name, sc.mixes, sc.ml_per_mix, sc.max_ml, 'estimate' as src
      into v_cat
      from service_categories sc
     where sc.tenant_id = p_tenant and sc.is_active
       and sc.id = (select el.category_id
                      from estimate_lines el
                      join estimates e on e.id = el.estimate_id
                     where e.tenant_id = p_tenant and e.customer_id = v_job.customer_id
                       and el.category_id is not null
                     order by el.created_at desc, el.id desc limit 1);
  end if;
  v_cat_src := v_cat.src;

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
      'category', v_cat.name, 'category_source', v_cat_src, 'cap_qty', v_cat.max_ml,
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
      'category', v_cat.name, 'category_source', v_cat_src, 'cap_qty', v_cat.max_ml,
      'why', format('The recipe "%s" does not name a chemical yet, so nobody can say what the dose should be. Record what you actually use and the office will set the recipe.', v_ver.recipe_name));
  end if;

  v_mixes   := v_cat.mixes;
  v_per_mix := coalesce(v_cat.ml_per_mix, v_ver.dose_rate);
  v_total   := case when v_mixes is not null and v_per_mix is not null
                    then v_mixes * v_per_mix else v_per_mix end;
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
    'category', v_cat.name, 'category_source', v_cat_src, 'cap_qty', v_cat.max_ml, 'why', v_why);
end $$;

comment on function fn_expected_dose(uuid, uuid) is
  'What the technician SHOULD use on this job: the priced service category (frozen on the job, else the contracted service, else the customer''s latest priced line) crossed with the recipe version in force. category_source names which was used. Returns a why-not sentence rather than a fabricated dose when the recipe names no chemical (defect 2B).';

grant execute on function fn_expected_dose(uuid, uuid) to mop_app;
