-- 001_foundations.sql
-- MOP K1 — foundational layer: extensions, tenancy, append-only machinery,
-- audit log, runtime-extensible fields, settings.
-- Governed by CONSTITUTION.md (Art. V, VII, X §4, XIII) and packages/db/SCHEMA.md.

-- ── Extensions ─────────────────────────────────────────────────────────
create extension if not exists postgis;   -- geography() for branch GPS pins
-- gen_random_uuid() is in core Postgres (v14+); no extension required.

-- ── Shared trigger functions ───────────────────────────────────────────

-- Blocks UPDATE/DELETE on append-only tables. Corrections are reversing
-- entries, never edits (Constitution Art. VII §2).
create or replace function enforce_append_only() returns trigger
language plpgsql as $$
begin
  raise exception
    'Table "%" is append-only (Constitution Art. VII §2): % is not permitted. Post a reversing entry instead.',
    tg_table_name, tg_op;
  return null;
end $$;

-- Maintains updated_at on editable tables.
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ── Tenancy & service lines ────────────────────────────────────────────
-- tenant_id and service_line_id exist from day one even with one tenant, so the
-- platform is service-line agnostic and multi-tenant-ready without a rewrite
-- (Constitution Art. V §2).
create table tenants (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now(),
  created_by  uuid
);

create table service_lines (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id),
  code         text not null,
  name         text not null,
  is_active    boolean not null default true,
  -- provenance / ASSUMED support
  is_assumed   boolean not null default false,
  assumed_note text,
  confirmed_by uuid,
  confirmed_at timestamptz,
  created_at   timestamptz not null default now(),
  created_by   uuid,
  updated_at   timestamptz not null default now(),
  updated_by   uuid,
  unique (tenant_id, code)
);
create trigger service_lines_touch before update on service_lines
  for each row execute function set_updated_at();

-- ── Audit log (append-only) ────────────────────────────────────────────
-- Who changed what, when, and the previous value. Every editable write logs
-- here (Constitution Art. VIII, Art. X §4).
create table audit_log (
  id          bigint generated always as identity primary key,
  tenant_id   uuid not null references tenants(id),
  occurred_at timestamptz not null default now(),
  actor_id    uuid,
  table_name  text not null,
  row_id      text,
  action      text not null,            -- 'insert' | 'update' | 'confirm' | 'delete_attempt'
  old_value   jsonb,
  new_value   jsonb,
  note        text
);
create index audit_log_table_row_idx on audit_log (table_name, row_id);
create index audit_log_tenant_time_idx on audit_log (tenant_id, occurred_at);
create trigger audit_log_append_only before update or delete on audit_log
  for each row execute function enforce_append_only();

-- ── Runtime-extensible fields ──────────────────────────────────────────
-- Declares custom fields per entity per service line, so the admin console can
-- add fields without a migration. Writes to an entity's attributes JSONB are
-- validated against these definitions (SCHEMA.md §5).
create table field_definitions (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id),
  service_line_id uuid references service_lines(id),   -- null = applies to all lines
  entity_type     text not null,                       -- 'customer','customer_branch','contract','job','service_report','item'
  field_key       text not null,
  label           text not null,
  data_type       text not null
                  check (data_type in ('text','number','integer','boolean','date','timestamptz','enum')),
  is_required     boolean not null default false,
  enum_values     text[],                              -- required when data_type='enum'
  validation      jsonb not null default '{}'::jsonb,
  is_assumed      boolean not null default false,
  confirmed_by    uuid,
  confirmed_at    timestamptz,
  created_at      timestamptz not null default now(),
  created_by      uuid,
  updated_at      timestamptz not null default now(),
  updated_by      uuid,
  unique (tenant_id, service_line_id, entity_type, field_key)
);
create trigger field_definitions_touch before update on field_definitions
  for each row execute function set_updated_at();

-- Validates an attributes JSONB against field_definitions: rejects unknown keys
-- and missing required fields. Called by tg_validate_attributes on core entities.
create or replace function validate_entity_attributes(
  p_tenant        uuid,
  p_service_line  uuid,
  p_entity_type   text,
  p_attributes    jsonb
) returns void language plpgsql as $$
declare
  k text;
  d record;
begin
  if p_attributes is null or p_attributes = '{}'::jsonb then
    -- still enforce required fields below
    null;
  end if;

  -- 1. every provided key must be a defined field for this entity/service line
  for k in select jsonb_object_keys(coalesce(p_attributes, '{}'::jsonb)) loop
    perform 1 from field_definitions fd
      where fd.tenant_id = p_tenant
        and fd.entity_type = p_entity_type
        and fd.field_key = k
        and (fd.service_line_id is null or fd.service_line_id = p_service_line);
    if not found then
      raise exception
        'Unknown attribute "%" for entity "%" — declare it in field_definitions (admin console) first.',
        k, p_entity_type;
    end if;
  end loop;

  -- 2. required fields must be present
  for d in
    select field_key from field_definitions fd
      where fd.tenant_id = p_tenant
        and fd.entity_type = p_entity_type
        and fd.is_required
        and (fd.service_line_id is null or fd.service_line_id = p_service_line)
  loop
    if not (coalesce(p_attributes, '{}'::jsonb) ? d.field_key) then
      raise exception 'Required attribute "%" is missing for entity "%".', d.field_key, p_entity_type;
    end if;
  end loop;
end $$;

-- Trigger wrapper. Attach to core entity tables with the entity_type as arg:
--   create trigger <t>_validate_attributes before insert or update on <t>
--     for each row execute function tg_validate_attributes('customer');
create or replace function tg_validate_attributes() returns trigger
language plpgsql as $$
begin
  perform validate_entity_attributes(new.tenant_id, new.service_line_id, tg_argv[0], new.attributes);
  return new;
end $$;

-- ── Settings (simple current key/values; versioned rates live elsewhere) ─
create table settings (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id),
  service_line_id uuid references service_lines(id),
  key             text not null,
  value           jsonb not null,
  description     text,
  is_assumed      boolean not null default false,
  confirmed_by    uuid,
  confirmed_at    timestamptz,
  created_at      timestamptz not null default now(),
  created_by      uuid,
  updated_at      timestamptz not null default now(),
  updated_by      uuid,
  unique (tenant_id, service_line_id, key)
);
create trigger settings_touch before update on settings
  for each row execute function set_updated_at();
