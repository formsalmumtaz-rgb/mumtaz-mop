-- 059_job_inspection.sql
-- Post-inspection (T4): the button-driven form a technician fills per job — area,
-- issue type, hygiene (1-5), structural (1-5), infestation level. Append-only
-- (a service record); typed columns so it is queryable for IPM analytics later.
-- The area / issue-type / infestation option lists are ASSUMED reference data
-- (BLOCKED.md A8), editable — the form is button-driven off them.

-- Configurable option lists. kind = 'area' | 'issue_type' | 'infestation'.
create table inspection_options (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id),
  kind        text not null check (kind in ('area','issue_type','infestation')),
  code        text not null,
  label       text not null,
  sort_order  int  not null default 0,
  is_active   boolean not null default true,
  is_assumed  boolean not null default false,
  created_at  timestamptz not null default now(), created_by uuid,
  updated_at  timestamptz not null default now(), updated_by uuid,
  unique (tenant_id, kind, code)
);
create index inspection_options_tenant_idx on inspection_options (tenant_id);
alter table inspection_options enable row level security;
create policy tenant_isolation on inspection_options
  using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
grant select, insert, update, delete on inspection_options to mop_app;
create trigger inspection_options_touch before update on inspection_options
  for each row execute function set_updated_at();

-- The inspection record — append-only (service record). One row per area assessed.
create table job_inspections (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id),
  service_line_id   uuid references service_lines(id),
  job_id            uuid not null references jobs(id),
  event_id          uuid,                                   -- source outbox event (idempotency)
  area              text not null,
  issue_type        text,
  hygiene_score     smallint check (hygiene_score is null or hygiene_score between 1 and 5),
  structural_score  smallint check (structural_score is null or structural_score between 1 and 5),
  infestation_level text,
  notes             text,
  device_time       timestamptz,
  created_at        timestamptz not null default now(), created_by uuid,
  unique (event_id, area)
);
create index job_inspections_job_idx on job_inspections (tenant_id, job_id);
alter table job_inspections enable row level security;
create policy tenant_isolation on job_inspections
  using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
grant select, insert on job_inspections to mop_app;   -- append-only: no update/delete

create or replace function enforce_job_inspections_append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'job_inspections is append-only (Art. VII §1): % not permitted.', tg_op;
end $$;
create trigger job_inspections_no_mutate before update or delete on job_inspections
  for each row execute function enforce_job_inspections_append_only();

-- Seed ASSUMED option lists per tenant.
insert into inspection_options (tenant_id, kind, code, label, sort_order, is_assumed)
select t.id, v.kind, v.code, v.label, v.ord, true
from tenants t
cross join (values
  ('area','kitchen','Kitchen',1),
  ('area','pantry','Pantry / store',2),
  ('area','dining','Dining area',3),
  ('area','wash','Wash area',4),
  ('area','exterior','Exterior / perimeter',5),
  ('issue_type','cockroach','Cockroach activity',1),
  ('issue_type','rodent','Rodent activity',2),
  ('issue_type','ant','Ants',3),
  ('issue_type','fly','Flies',4),
  ('issue_type','hygiene','Hygiene concern',5),
  ('issue_type','structural','Structural gap / entry point',6),
  ('infestation','none','None',1),
  ('infestation','low','Low',2),
  ('infestation','medium','Medium',3),
  ('infestation','high','High',4)
) as v(kind, code, label, ord)
on conflict (tenant_id, kind, code) do nothing;
