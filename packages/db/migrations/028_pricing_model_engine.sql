-- 028_pricing_model_engine.sql
-- Tier 2 — reusable Pricing Model Engine. Extends the existing pricing_models
-- catalogue (Art. XVIII: extend, not replace). One deterministic price function
-- covers all models; each service selects which models it supports.
--
-- Models (pricing_models.model_type): fixed, per_hour, per_day, per_person,
-- per_month, per_visit, per_sqm, per_apartment, per_room, per_floor, per_duct,
-- per_linear_metre, quantity_unit  -> price = unit_price × measure (fixed/custom
-- are flat / manually entered); formula -> a STRUCTURED, data-defined formula
-- (base + Σ measure×rate) evaluated deterministically (NO free-text eval, Art. I).
--
-- Additive: columns on pricing_models + a service↔model junction + an IMMUTABLE
-- pure function. No existing invariant relaxed.

alter table pricing_models add column model_type  text;
alter table pricing_models add column formula_spec jsonb not null default '{}'::jsonb;  -- {base, terms:[{measure_key,rate}]}

-- backfill the seeded catalogue, then lock the column down
update pricing_models set model_type = 'fixed'     where model_type is null and code = 'fixed_period';
update pricing_models set model_type = 'per_visit' where model_type is null and code = 'per_treatment';
update pricing_models set model_type = 'fixed'     where model_type is null;
alter table pricing_models
  add constraint pricing_models_model_type_chk check (model_type in
    ('fixed','per_hour','per_day','per_person','per_month','per_visit','per_sqm',
     'per_apartment','per_room','per_floor','per_duct','per_linear_metre',
     'quantity_unit','formula','custom'));
alter table pricing_models alter column model_type set not null;

-- Which pricing models each service supports (+ a default).
create table service_pricing_models (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id),
  service_line_id  uuid references service_lines(id),
  service_type_id  uuid not null references service_types(id),
  pricing_model_id uuid not null references pricing_models(id),
  is_default       boolean not null default false,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(), created_by uuid,
  updated_at       timestamptz not null default now(), updated_by uuid,
  unique (tenant_id, service_type_id, pricing_model_id)
);
create index service_pricing_models_service_idx on service_pricing_models (service_type_id);
create trigger service_pricing_models_touch before update on service_pricing_models for each row execute function set_updated_at();
alter table service_pricing_models enable row level security;
create policy tenant_isolation on service_pricing_models
  using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
grant select, insert, update, delete on service_pricing_models to mop_app;

-- Deterministic price for any model. IMMUTABLE (inputs only; no table reads, no
-- eval). Quantity/measure models = unit_price × measure; fixed/custom = flat;
-- formula = base + Σ(measure × rate) over the structured spec.
create or replace function fn_price(
  p_model_type text,
  p_unit_price numeric default 0,
  p_measure    numeric default 1,
  p_spec       jsonb   default '{}'::jsonb,
  p_measures   jsonb   default '{}'::jsonb
) returns numeric language sql immutable as $$
  select round(
    case p_model_type
      when 'fixed'   then coalesce(p_unit_price, 0)
      when 'custom'  then coalesce(p_unit_price, 0)
      when 'formula' then coalesce((p_spec->>'base')::numeric, 0)
        + coalesce((
            select sum((t->>'rate')::numeric * coalesce((p_measures->>(t->>'measure_key'))::numeric, 0))
            from jsonb_array_elements(coalesce(p_spec->'terms', '[]'::jsonb)) t
          ), 0)
      else coalesce(p_unit_price, 0) * coalesce(p_measure, 1)   -- all per_* / quantity_unit
    end, 2);
$$;

-- Seed the standard 15 model types as ASSUMED catalogue rows (editable in admin).
do $$
declare v_t uuid; v_sl uuid;
begin
  select id into v_t from tenants where name = 'Mumtaz Integrated Services Group';
  if v_t is null then return; end if;
  select id into v_sl from service_lines where tenant_id = v_t and code = 'pest_control';
  insert into pricing_models(tenant_id, service_line_id, code, name, model_type, is_assumed, assumed_note) values
    (v_t, v_sl, 'fixed',           'Fixed price',        'fixed',           true, 'Standard pricing model'),
    (v_t, v_sl, 'per_hour',        'Per hour',           'per_hour',        true, 'Standard pricing model'),
    (v_t, v_sl, 'per_day',         'Per day',            'per_day',         true, 'Standard pricing model'),
    (v_t, v_sl, 'per_person',      'Per person',         'per_person',      true, 'Standard pricing model'),
    (v_t, v_sl, 'per_month',       'Per month',          'per_month',       true, 'Standard pricing model'),
    (v_t, v_sl, 'per_visit',       'Per visit',          'per_visit',       true, 'Standard pricing model'),
    (v_t, v_sl, 'per_sqm',         'Per square metre',   'per_sqm',         true, 'Standard pricing model'),
    (v_t, v_sl, 'per_apartment',   'Per apartment',      'per_apartment',   true, 'Standard pricing model'),
    (v_t, v_sl, 'per_room',        'Per room',           'per_room',        true, 'Standard pricing model'),
    (v_t, v_sl, 'per_floor',       'Per floor',          'per_floor',       true, 'Standard pricing model'),
    (v_t, v_sl, 'per_duct',        'Per duct',           'per_duct',        true, 'Standard pricing model'),
    (v_t, v_sl, 'per_linear_metre','Per linear metre',   'per_linear_metre',true, 'Standard pricing model'),
    (v_t, v_sl, 'quantity_unit',   'Quantity × unit',    'quantity_unit',   true, 'Standard pricing model'),
    (v_t, v_sl, 'formula',         'Formula-based',      'formula',         true, 'Structured formula: base + Σ measure×rate'),
    (v_t, v_sl, 'custom',          'Custom (manual)',    'custom',          true, 'Manually entered price')
  on conflict (tenant_id, service_line_id, code) do nothing;
end $$;
