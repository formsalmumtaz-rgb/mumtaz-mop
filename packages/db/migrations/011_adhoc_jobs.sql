-- 011_adhoc_jobs.sql
-- MOP K1b — jobs exist independently of contracts. Adds job_sources (editable
-- reference table) and gives jobs a source, a service type, and an optional GPS
-- pin for ad-hoc work. jobs.contract_id is already nullable (006), so ad-hoc
-- jobs use the same record, offline flow, report and invoice path — no parent.

create table job_sources (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id),
  service_line_id uuid references service_lines(id),
  code            text not null,      -- contract_scheduled | emergency_callout | one_off | complaint_followup
  name            text not null,
  is_active       boolean not null default true,
  is_assumed      boolean not null default false,
  assumed_note    text,
  confirmed_by    uuid, confirmed_at timestamptz,
  created_at      timestamptz not null default now(), created_by uuid,
  updated_at      timestamptz not null default now(), updated_by uuid,
  unique (tenant_id, service_line_id, code)
);
create trigger job_sources_touch before update on job_sources for each row execute function set_updated_at();

-- RLS (008 only covered tables that existed then)
alter table job_sources enable row level security;
create policy tenant_isolation on job_sources
  using (tenant_id = app_current_tenant())
  with check (tenant_id = app_current_tenant());
grant select, insert, update, delete on job_sources to mop_app;

-- jobs gains source, service type, and an optional ad-hoc GPS pin
alter table jobs add column job_source_id   uuid references job_sources(id);
alter table jobs add column service_type_id uuid references service_types(id);
alter table jobs add column location        geography(Point, 4326);
create index jobs_job_source_idx on jobs (job_source_id);
create index jobs_geo_idx on jobs using gist (location);

-- seed the four sources (system-defined, not assumed)
do $$
declare v_tenant uuid; v_sl uuid;
begin
  select id into v_tenant from tenants where name = 'Mumtaz Integrated Services Group';
  select id into v_sl from service_lines where tenant_id = v_tenant and code = 'pest_control';
  insert into job_sources(tenant_id, service_line_id, code, name) values
    (v_tenant, v_sl, 'contract_scheduled', 'Contract-scheduled'),
    (v_tenant, v_sl, 'emergency_callout',  'Emergency callout'),
    (v_tenant, v_sl, 'one_off',            'One-off'),
    (v_tenant, v_sl, 'complaint_followup', 'Complaint follow-up');
end $$;
