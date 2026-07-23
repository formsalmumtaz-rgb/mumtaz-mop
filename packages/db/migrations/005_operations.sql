-- 005_operations.sql
-- MOP K1 — operations: teams, technicians, effective-dated team_assignments,
-- jobs, job_assignments (actual performer), checklists, photos, signatures,
-- and append-only service_reports with frozen snapshots (SCHEMA.md F2).

create table teams (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id),
  service_line_id uuid not null references service_lines(id),
  code            text,
  name            text not null,
  is_active       boolean not null default true,
  is_assumed      boolean not null default false,
  assumed_note    text,
  confirmed_by    uuid, confirmed_at timestamptz,
  created_at      timestamptz not null default now(), created_by uuid,
  updated_at      timestamptz not null default now(), updated_by uuid,
  unique (tenant_id, code)
);
create trigger teams_touch before update on teams for each row execute function set_updated_at();

create table technicians (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id),
  service_line_id uuid not null references service_lines(id),
  code            text,
  full_name       text,                       -- ASSUMED placeholder until owner enters real names
  phone           text,
  employee_ref    text,
  is_active       boolean not null default true,
  is_assumed      boolean not null default false,
  assumed_note    text,
  confirmed_by    uuid, confirmed_at timestamptz,
  created_at      timestamptz not null default now(), created_by uuid,
  updated_at      timestamptz not null default now(), updated_by uuid,
  unique (tenant_id, code)
);
create trigger technicians_touch before update on technicians for each row execute function set_updated_at();

-- Effective-dated team membership: which technicians are on which team on any
-- given day. Immutable except closing effective_to (reuses version guard).
create table team_assignments (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id),
  service_line_id uuid references service_lines(id),
  team_id        uuid not null references teams(id),
  technician_id  uuid not null references technicians(id),
  role           text,                        -- 'lead','member','driver'
  effective_from date not null default current_date,
  effective_to   date,
  created_at     timestamptz not null default now(), created_by uuid,
  check (effective_to is null or effective_to >= effective_from)
);
-- a technician is on at most one team at a time (current)
create unique index team_assignment_one_open on team_assignments (technician_id) where effective_to is null;
create index team_assignments_team_idx on team_assignments (team_id);
create trigger team_assignments_immutable before update or delete on team_assignments
  for each row execute function enforce_version_immutable();

-- ── Jobs ───────────────────────────────────────────────────────────────
create table jobs (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references tenants(id),
  service_line_id     uuid not null references service_lines(id),
  customer_id         uuid not null references customers(id),
  branch_id           uuid references customer_branches(id),
  contract_id         uuid references contracts(id),
  contract_service_id uuid references contract_services(id),
  contract_schedule_id uuid references contract_schedule(id),
  job_type_id         uuid references job_types(id),
  team_id             uuid references teams(id),          -- nominal team
  scheduled_date      date,
  status              text not null default 'scheduled'
                      check (status in ('scheduled','assigned','en_route','arrived','in_progress','completed','failed','cancelled')),
  -- offline timestamps: device time for reports, server time for audit (Art. VII §4)
  device_started_at   timestamptz,
  device_completed_at timestamptz,
  started_at          timestamptz,
  completed_at        timestamptz,
  client_uuid         uuid,                                -- client-generated idempotency key (Art. VII §4)
  attributes          jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(), created_by uuid,
  updated_at          timestamptz not null default now(), updated_by uuid,
  unique (tenant_id, client_uuid)
);
create index jobs_customer_idx on jobs (customer_id);
create index jobs_sched_idx on jobs (scheduled_date, status);
create trigger jobs_touch before update on jobs for each row execute function set_updated_at();
create trigger jobs_validate_attrs before insert or update on jobs
  for each row execute function tg_validate_attributes('job');

-- Who actually performed the work (vs nominal team membership)
create table job_assignments (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id),
  job_id        uuid not null references jobs(id),
  technician_id uuid not null references technicians(id),
  team_id       uuid references teams(id),
  role          text,
  assigned_at   timestamptz not null default now(),
  created_at    timestamptz not null default now(), created_by uuid,
  unique (job_id, technician_id)
);
create index job_assignments_job_idx on job_assignments (job_id);

create table job_checklists (
  id                            uuid primary key default gen_random_uuid(),
  tenant_id                     uuid not null references tenants(id),
  job_id                        uuid not null references jobs(id),
  checklist_template_version_id uuid references checklist_template_versions(id),
  responses                     jsonb not null default '{}'::jsonb,
  snapshot                      jsonb not null default '{}'::jsonb,   -- frozen copy of items as applied
  created_at                    timestamptz not null default now(), created_by uuid,
  updated_at                    timestamptz not null default now(), updated_by uuid
);
create index job_checklists_job_idx on job_checklists (job_id);
create trigger job_checklists_touch before update on job_checklists for each row execute function set_updated_at();

create table job_photos (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id),
  job_id          uuid not null references jobs(id),
  storage_key     text not null,             -- Cloudflare R2 object key
  thumb_key       text,
  taken_at        timestamptz,
  device_taken_at timestamptz,
  gps             geography(Point, 4326),
  caption         text,
  retain_until    date,                      -- media retention (Art. IX)
  created_at      timestamptz not null default now(), created_by uuid
);
create index job_photos_job_idx on job_photos (job_id);

create table job_signatures (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id),
  job_id           uuid not null references jobs(id),
  signer_name      text,
  signer_role      text,
  storage_key      text,                     -- signature image in R2
  signed_at        timestamptz,
  device_signed_at timestamptz,
  created_at       timestamptz not null default now(), created_by uuid
);
create index job_signatures_job_idx on job_signatures (job_id);

-- ── Service reports (append-only; the tamper-evident legal record) ─────
create table service_reports (
  id                            uuid primary key default gen_random_uuid(),
  tenant_id                     uuid not null references tenants(id),
  service_line_id               uuid not null references service_lines(id),
  job_id                        uuid not null references jobs(id),
  customer_id                   uuid references customers(id),
  branch_id                     uuid references customer_branches(id),
  report_number                 text,
  -- frozen version references (what was actually used)
  recipe_version_id             uuid references treatment_recipe_versions(id),
  checklist_template_version_id uuid references checklist_template_versions(id),
  document_template_version_id  uuid references document_template_versions(id),
  performed_by                  uuid references technicians(id),
  team_id                       uuid references teams(id),
  -- the record must explain itself even if version rows later change (F2, F4)
  snapshot                      jsonb not null default '{}'::jsonb,
  device_completed_at           timestamptz,
  server_completed_at           timestamptz not null default now(),
  pdf_storage_key               text,
  attributes                    jsonb not null default '{}'::jsonb,
  created_at                    timestamptz not null default now(), created_by uuid
);
create index service_reports_job_idx on service_reports (job_id);
create trigger service_reports_validate_attrs before insert on service_reports
  for each row execute function tg_validate_attributes('service_report');
create trigger service_reports_append_only before update or delete on service_reports
  for each row execute function enforce_append_only();
