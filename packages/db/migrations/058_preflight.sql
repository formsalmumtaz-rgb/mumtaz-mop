-- 058_preflight.sql
-- Technician pre-flight (T3): the start-of-shift check a technician records before
-- the first job — attendance, vehicle, odometer, fuel, equipment, PPE. One record
-- per technician per day (correctable same day). Offline: carries device_time +
-- server_received_at (Art. VII §4). The equipment/PPE lists are ASSUMED reference
-- data (BLOCKED.md A6), editable.

-- Configurable checklist items (what to tick). kind = 'ppe' | 'equipment'.
create table preflight_checklist_items (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id),
  kind        text not null check (kind in ('ppe','equipment')),
  code        text not null,
  label       text not null,
  sort_order  int  not null default 0,
  is_active   boolean not null default true,
  is_assumed  boolean not null default false,
  created_at  timestamptz not null default now(), created_by uuid,
  updated_at  timestamptz not null default now(), updated_by uuid,
  unique (tenant_id, kind, code)
);
create index preflight_checklist_items_tenant_idx on preflight_checklist_items (tenant_id);
alter table preflight_checklist_items enable row level security;
create policy tenant_isolation on preflight_checklist_items
  using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
grant select, insert, update, delete on preflight_checklist_items to mop_app;
create trigger preflight_checklist_items_touch before update on preflight_checklist_items
  for each row execute function set_updated_at();

-- The shift record. One per technician per day; the technician may correct it the
-- same day, so it is upsertable (not append-only) — it is an operational check,
-- not a financial/service record. Fuel logged here also posts to
-- vehicle_fuel_purchases (append-only) via the endpoint.
create table preflight_checks (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references tenants(id),
  service_line_id    uuid references service_lines(id),
  technician_id      uuid not null references technicians(id),
  check_date         date not null default current_date,
  present            boolean not null default true,
  vehicle_id         uuid references vehicles(id),
  odometer_km        numeric check (odometer_km is null or odometer_km >= 0),
  fuel_litres        numeric check (fuel_litres is null or fuel_litres >= 0),
  fuel_amount        numeric check (fuel_amount is null or fuel_amount >= 0),
  ppe                jsonb not null default '{}'::jsonb,        -- code -> bool
  equipment          jsonb not null default '{}'::jsonb,        -- code -> bool
  notes              text,
  client_uuid        uuid,                                       -- offline idempotency
  device_time        timestamptz,
  server_received_at timestamptz not null default now(),
  time_suspect       boolean not null default false,
  created_at         timestamptz not null default now(), created_by uuid,
  updated_at         timestamptz not null default now(), updated_by uuid,
  unique (tenant_id, technician_id, check_date)
);
create index preflight_checks_tenant_idx on preflight_checks (tenant_id, check_date);
alter table preflight_checks enable row level security;
create policy tenant_isolation on preflight_checks
  using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
grant select, insert, update, delete on preflight_checks to mop_app;
create trigger preflight_checks_touch before update on preflight_checks
  for each row execute function set_updated_at();

-- Seed ASSUMED PPE + equipment lists per tenant.
insert into preflight_checklist_items (tenant_id, kind, code, label, sort_order, is_assumed)
select t.id, v.kind, v.code, v.label, v.ord, true
from tenants t
cross join (values
  ('ppe','gloves','Gloves',1),
  ('ppe','mask','Respirator / mask',2),
  ('ppe','goggles','Safety goggles',3),
  ('ppe','coverall','Coverall',4),
  ('ppe','boots','Safety boots',5),
  ('equipment','sprayer','Sprayer (charged & clean)',1),
  ('equipment','bait_gun','Gel bait gun',2),
  ('equipment','torch','Torch',3),
  ('equipment','ladder','Ladder / step',4),
  ('equipment','first_aid','First-aid kit',5)
) as v(kind, code, label, ord)
on conflict (tenant_id, kind, code) do nothing;
