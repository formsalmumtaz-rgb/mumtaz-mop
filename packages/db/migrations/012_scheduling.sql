-- 012_scheduling.sql
-- MOP K2 — contract fan-out support. reminders table; frozen snapshot + recipe
-- version on generated schedule rows and jobs (SCHEMA.md F2 — captured at
-- generation, never a live lookup at service time); tunable scheduling settings.

create table reminders (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id),
  service_line_id uuid references service_lines(id),
  reminder_type   text not null check (reminder_type in ('contract_renewal','compliance','vehicle','visa','other')),
  entity_type     text,
  entity_id       uuid,
  due_date        date not null,
  status          text not null default 'pending' check (status in ('pending','sent','dismissed','done')),
  note            text,
  created_at      timestamptz not null default now(), created_by uuid,
  -- idempotency: one reminder of a type per entity per due date
  unique (tenant_id, reminder_type, entity_id, due_date)
);
create index reminders_due_idx on reminders (tenant_id, due_date) where status = 'pending';

alter table reminders enable row level security;
create policy tenant_isolation on reminders
  using (tenant_id = app_current_tenant())
  with check (tenant_id = app_current_tenant());
grant select, insert, update, delete on reminders to mop_app;

-- Frozen snapshot + recipe version on generated rows (F2)
alter table contract_schedule add column recipe_version_id uuid references treatment_recipe_versions(id);
alter table contract_schedule add column snapshot jsonb not null default '{}'::jsonb;
alter table jobs             add column recipe_version_id uuid references treatment_recipe_versions(id);
alter table jobs             add column generation_snapshot jsonb not null default '{}'::jsonb;

-- Tunable scheduling rules (editable without deploy). Horizons are owner-confirmed
-- from the spec; visit spacing is ASSUMED until the owner sets the real rule.
do $$
declare v_tenant uuid; v_sl uuid;
begin
  select id into v_tenant from tenants where name = 'Mumtaz Integrated Services Group';
  select id into v_sl   from service_lines where tenant_id = v_tenant and code = 'pest_control';
  insert into settings(tenant_id, service_line_id, key, value, description, is_assumed) values
    (v_tenant, v_sl, 'schedule_horizon_months', '12'::jsonb,  'Months of schedule generated on activation', false),
    (v_tenant, v_sl, 'job_generation_days',     '30'::jsonb,  'Days of jobs generated ahead from the schedule', false),
    (v_tenant, v_sl, 'renewal_reminder_days',   '60'::jsonb,  'Days before contract end to raise a renewal reminder', false),
    (v_tenant, v_sl, 'visit_spacing',           '"even"'::jsonb, 'How multiple visits per period are spaced (ASSUMED — confirm)', true)
  on conflict (tenant_id, service_line_id, key) do nothing;
end $$;
