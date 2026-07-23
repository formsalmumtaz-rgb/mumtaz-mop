-- 003_versioned_config.sql
-- MOP K1 — versioned reference data (SCHEMA.md rule F1).
-- Editing creates a NEW version. Old version values are immutable; only the
-- validity window (effective_to) may be closed, once. Enforced by
-- enforce_version_immutable(). Child line/item tables are fully append-only.

-- Permits closing a version's window (effective_to: null -> value) exactly once;
-- blocks every other UPDATE and all DELETEs on *_versions tables.
create or replace function enforce_version_immutable() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Version rows are immutable (SCHEMA.md F1): DELETE not permitted on "%".', tg_table_name;
  end if;
  if old.effective_to is not null then
    raise exception 'Version % is already closed and is immutable.', old.id;
  end if;
  if (to_jsonb(new) - 'effective_to') is distinct from (to_jsonb(old) - 'effective_to') then
    raise exception 'Only effective_to may change (to close a version). All value columns are immutable (SCHEMA.md F1).';
  end if;
  return new;
end $$;

-- ── Treatment recipes ──────────────────────────────────────────────────
create table treatment_recipes (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references tenants(id),
  service_line_id     uuid not null references service_lines(id),
  code                text not null,
  name                text not null,
  target_pest_id      uuid references pest_types(id),
  treatment_method_id uuid references treatment_methods(id),
  is_active           boolean not null default true,
  is_assumed          boolean not null default false,
  assumed_note        text,
  confirmed_by        uuid, confirmed_at timestamptz,
  created_at          timestamptz not null default now(), created_by uuid,
  updated_at          timestamptz not null default now(), updated_by uuid,
  unique (tenant_id, service_line_id, code)
);
create trigger treatment_recipes_touch before update on treatment_recipes for each row execute function set_updated_at();

create table treatment_recipe_versions (
  id                uuid primary key default gen_random_uuid(),
  recipe_id         uuid not null references treatment_recipes(id),
  version_no        integer not null,
  effective_from    date not null default current_date,
  effective_to      date,
  product_item_id   uuid,               -- FK to items() added in 005 (items created later)
  dose_rate         numeric,
  dose_unit_id      uuid references units(id),
  dilution_ratio    text,               -- human form e.g. '1:100'
  dilution_value    numeric,            -- machine form e.g. 0.01
  coverage_per_unit numeric,
  coverage_unit_id  uuid references units(id),
  site_variation    jsonb not null default '{}'::jsonb,  -- restaurant/villa/warehouse overrides
  notes             text,
  is_assumed        boolean not null default false,
  source_ref        text,               -- document/manufacturer ref when SOURCED
  created_at        timestamptz not null default now(), created_by uuid,
  unique (recipe_id, version_no),
  check (effective_to is null or effective_to >= effective_from)
);
create unique index treatment_recipe_one_open on treatment_recipe_versions (recipe_id) where effective_to is null;
create trigger treatment_recipe_versions_immutable before update or delete on treatment_recipe_versions
  for each row execute function enforce_version_immutable();

-- ── Price lists / rate cards ───────────────────────────────────────────
create table price_lists (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id),
  service_line_id uuid not null references service_lines(id),
  code            text not null,
  name            text not null,
  currency        text not null default 'AED',
  is_active       boolean not null default true,
  is_assumed      boolean not null default false,
  assumed_note    text,
  confirmed_by    uuid, confirmed_at timestamptz,
  created_at      timestamptz not null default now(), created_by uuid,
  updated_at      timestamptz not null default now(), updated_by uuid,
  unique (tenant_id, service_line_id, code)
);
create trigger price_lists_touch before update on price_lists for each row execute function set_updated_at();

create table price_list_versions (
  id            uuid primary key default gen_random_uuid(),
  price_list_id uuid not null references price_lists(id),
  version_no    integer not null,
  effective_from date not null default current_date,
  effective_to   date,
  is_assumed    boolean not null default false,
  source_ref    text,
  created_at    timestamptz not null default now(), created_by uuid,
  unique (price_list_id, version_no),
  check (effective_to is null or effective_to >= effective_from)
);
create unique index price_list_one_open on price_list_versions (price_list_id) where effective_to is null;
create trigger price_list_versions_immutable before update or delete on price_list_versions
  for each row execute function enforce_version_immutable();

create table price_list_lines (
  id                    uuid primary key default gen_random_uuid(),
  price_list_version_id uuid not null references price_list_versions(id),
  service_type_id       uuid references service_types(id),
  pricing_model_id      uuid references pricing_models(id),
  unit_price            numeric not null,
  currency              text not null default 'AED',
  unit_id               uuid references units(id),
  notes                 text,
  created_at            timestamptz not null default now(), created_by uuid
);
-- lines belong to an immutable version → fully append-only
create trigger price_list_lines_append_only before update or delete on price_list_lines
  for each row execute function enforce_append_only();

-- ── Checklist templates ────────────────────────────────────────────────
create table checklist_templates (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id),
  service_line_id uuid not null references service_lines(id),
  job_type_id     uuid references job_types(id),
  code            text not null,
  name            text not null,
  is_active       boolean not null default true,
  is_assumed      boolean not null default false,
  assumed_note    text,
  confirmed_by    uuid, confirmed_at timestamptz,
  created_at      timestamptz not null default now(), created_by uuid,
  updated_at      timestamptz not null default now(), updated_by uuid,
  unique (tenant_id, service_line_id, code)
);
create trigger checklist_templates_touch before update on checklist_templates for each row execute function set_updated_at();

create table checklist_template_versions (
  id            uuid primary key default gen_random_uuid(),
  template_id   uuid not null references checklist_templates(id),
  version_no    integer not null,
  effective_from date not null default current_date,
  effective_to   date,
  is_assumed    boolean not null default false,
  source_ref    text,
  created_at    timestamptz not null default now(), created_by uuid,
  unique (template_id, version_no),
  check (effective_to is null or effective_to >= effective_from)
);
create unique index checklist_template_one_open on checklist_template_versions (template_id) where effective_to is null;
create trigger checklist_template_versions_immutable before update or delete on checklist_template_versions
  for each row execute function enforce_version_immutable();

create table checklist_template_items (
  id                   uuid primary key default gen_random_uuid(),
  template_version_id  uuid not null references checklist_template_versions(id),
  seq                  integer not null,
  prompt               text not null,
  input_type           text not null check (input_type in ('bool','text','number','photo','signature','select')),
  options              text[],
  is_required          boolean not null default false,
  created_at           timestamptz not null default now(), created_by uuid,
  unique (template_version_id, seq)
);
create trigger checklist_template_items_append_only before update or delete on checklist_template_items
  for each row execute function enforce_append_only();

-- ── Document templates (bilingual EN/AR) ───────────────────────────────
create table document_templates (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id),
  service_line_id uuid not null references service_lines(id),
  code            text not null,
  name            text not null,
  doc_type        text not null check (doc_type in ('service_report','certificate','invoice','agreement','quotation')),
  is_active       boolean not null default true,
  is_assumed      boolean not null default false,
  assumed_note    text,
  confirmed_by    uuid, confirmed_at timestamptz,
  created_at      timestamptz not null default now(), created_by uuid,
  updated_at      timestamptz not null default now(), updated_by uuid,
  unique (tenant_id, service_line_id, code)
);
create trigger document_templates_touch before update on document_templates for each row execute function set_updated_at();

create table document_template_versions (
  id            uuid primary key default gen_random_uuid(),
  template_id   uuid not null references document_templates(id),
  version_no    integer not null,
  effective_from date not null default current_date,
  effective_to   date,
  language      text not null default 'en' check (language in ('en','ar')),
  body          text not null,                       -- template source (HTML/handlebars)
  layout        jsonb not null default '{}'::jsonb,
  is_assumed    boolean not null default false,
  source_ref    text,
  created_at    timestamptz not null default now(), created_by uuid,
  unique (template_id, version_no, language),
  check (effective_to is null or effective_to >= effective_from)
);
-- one open version per language (EN and AR can both be active)
create unique index document_template_one_open on document_template_versions (template_id, language) where effective_to is null;
create trigger document_template_versions_immutable before update or delete on document_template_versions
  for each row execute function enforce_version_immutable();
