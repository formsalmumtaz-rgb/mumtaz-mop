-- 089_field_finance_vehicles_gps.sql
-- Defect run items 2/3: field expense approver + receipt files, fuel-log
-- idempotency, the two registered vehicles, and job GPS capture keys.

-- Expense: who approved the purchase (named by the technician on device — the
-- office's formal approval remains the approved_by/status workflow).
alter table expenses add column if not exists approved_by_name text;

-- Standalone expense receipt photos (an expense is not always job-bound, and
-- job_photos requires a job). R2 key + link by the expense's client identity.
create table if not exists expense_receipt_files (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id),
  expense_id   uuid references expenses(id),
  client_uuid  uuid,                   -- links device capture to the expense event
  storage_key  text not null,
  created_at   timestamptz not null default now(), created_by uuid,
  unique (tenant_id, client_uuid)
);
alter table expense_receipt_files enable row level security;
drop policy if exists tenant_isolation on expense_receipt_files;
create policy tenant_isolation on expense_receipt_files
  using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
grant select, insert on expense_receipt_files to mop_app;

-- Fuel log idempotency: one purchase per device capture.
alter table vehicle_fuel_purchases add column if not exists client_uuid uuid;
create unique index if not exists vehicle_fuel_purchases_client_uuid
  on vehicle_fuel_purchases (tenant_id, client_uuid) where client_uuid is not null;

-- The two registered vehicles (owner's order — reference data, editable).
do $$
declare v_t uuid; v_sl uuid;
begin
  select id into v_t from tenants where name = 'Mumtaz Integrated Services Group';
  select id into v_sl from service_lines where tenant_id = v_t and code = 'pest_control';
  insert into vehicles (tenant_id, service_line_id, code, name, is_assumed, assumed_note)
  select v_t, v_sl, x.code, x.name, true, 'Seeded per owner order 15 Aug - rename/extend in Vehicles.'
    from (values ('VEH-1', 'Vehicle 1'), ('VEH-2', 'Vehicle 2')) as x(code, name)
   where not exists (select 1 from vehicles v where v.tenant_id = v_t and v.code = x.code);

  -- GPS capture keys on jobs (start/complete coordinates from the device;
  -- distance derivation reads these — no live tracking).
  insert into field_definitions (tenant_id, service_line_id, entity_type, field_key, label, data_type, is_required, is_assumed)
  select v_t, null, 'job', x.k, x.l, 'number', false, false
    from (values
      ('start_lat', 'Job start latitude'), ('start_lng', 'Job start longitude'),
      ('complete_lat', 'Job completion latitude'), ('complete_lng', 'Job completion longitude')
    ) as x(k, l)
   where not exists (select 1 from field_definitions f
                      where f.tenant_id = v_t and f.service_line_id is null
                        and f.entity_type = 'job' and f.field_key = x.k);
end $$;
