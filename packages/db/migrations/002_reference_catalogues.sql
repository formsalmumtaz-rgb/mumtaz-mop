-- 002_reference_catalogues.sql
-- MOP K1 — editable reference catalogues (no business-variable enums in code).
-- Every list here is CRUD-editable from the admin console, scoped by
-- service_line_id, with ASSUMED provenance. See packages/db/SCHEMA.md §1, §6.

-- Shared provenance columns on every catalogue row:
--   is_assumed / assumed_note / confirmed_by / confirmed_at  (Art. X §4)
--   created_at / created_by / updated_at / updated_by

create table units (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id),
  service_line_id uuid references service_lines(id),
  code            text not null,          -- 'ml','l','g','kg','m2','each'
  name            text not null,
  dimension       text not null check (dimension in ('volume','mass','count','area','length','time','ratio')),
  is_active       boolean not null default true,
  is_assumed      boolean not null default false,
  assumed_note    text,
  confirmed_by    uuid, confirmed_at timestamptz,
  created_at      timestamptz not null default now(), created_by uuid,
  updated_at      timestamptz not null default now(), updated_by uuid,
  unique (tenant_id, service_line_id, code)
);
create trigger units_touch before update on units for each row execute function set_updated_at();

create table service_types (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id),
  service_line_id uuid not null references service_lines(id),
  code            text not null,
  name            text not null,
  description     text,
  is_active       boolean not null default true,
  is_assumed      boolean not null default false,
  assumed_note    text,
  confirmed_by    uuid, confirmed_at timestamptz,
  created_at      timestamptz not null default now(), created_by uuid,
  updated_at      timestamptz not null default now(), updated_by uuid,
  unique (tenant_id, service_line_id, code)
);
create trigger service_types_touch before update on service_types for each row execute function set_updated_at();

create table job_types (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id),
  service_line_id uuid not null references service_lines(id),
  code            text not null,
  name            text not null,
  description     text,
  is_active       boolean not null default true,
  is_assumed      boolean not null default false,
  assumed_note    text,
  confirmed_by    uuid, confirmed_at timestamptz,
  created_at      timestamptz not null default now(), created_by uuid,
  updated_at      timestamptz not null default now(), updated_by uuid,
  unique (tenant_id, service_line_id, code)
);
create trigger job_types_touch before update on job_types for each row execute function set_updated_at();

create table pest_types (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id),
  service_line_id uuid not null references service_lines(id),
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
create trigger pest_types_touch before update on pest_types for each row execute function set_updated_at();

create table treatment_methods (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id),
  service_line_id uuid not null references service_lines(id),
  code            text not null,          -- 'residual_spray','gel_bait','glue_board','bait_station','fogging'
  name            text not null,
  is_active       boolean not null default true,
  is_assumed      boolean not null default false,
  assumed_note    text,
  confirmed_by    uuid, confirmed_at timestamptz,
  created_at      timestamptz not null default now(), created_by uuid,
  updated_at      timestamptz not null default now(), updated_by uuid,
  unique (tenant_id, service_line_id, code)
);
create trigger treatment_methods_touch before update on treatment_methods for each row execute function set_updated_at();

create table frequencies (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id),
  service_line_id   uuid not null references service_lines(id),
  code              text not null,        -- 'monthly_1','monthly_2','bimonthly'
  name              text not null,        -- 'Monthly - 1 visit'
  -- machine-usable spec the scheduler can compute from (deterministic, not text):
  period_unit       text not null check (period_unit in ('day','week','month','year')),
  period_count      integer not null default 1 check (period_count > 0),
  visits_per_period integer not null default 1 check (visits_per_period > 0),
  is_active         boolean not null default true,
  is_assumed        boolean not null default false,
  assumed_note      text,
  confirmed_by      uuid, confirmed_at timestamptz,
  created_at        timestamptz not null default now(), created_by uuid,
  updated_at        timestamptz not null default now(), updated_by uuid,
  unique (tenant_id, service_line_id, code)
);
create trigger frequencies_touch before update on frequencies for each row execute function set_updated_at();

create table pricing_models (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id),
  service_line_id uuid not null references service_lines(id),
  code            text not null,          -- 'fixed_period','per_treatment'
  name            text not null,
  description     text,
  is_active       boolean not null default true,
  is_assumed      boolean not null default false,
  assumed_note    text,
  confirmed_by    uuid, confirmed_at timestamptz,
  created_at      timestamptz not null default now(), created_by uuid,
  updated_at      timestamptz not null default now(), updated_by uuid,
  unique (tenant_id, service_line_id, code)
);
create trigger pricing_models_touch before update on pricing_models for each row execute function set_updated_at();
