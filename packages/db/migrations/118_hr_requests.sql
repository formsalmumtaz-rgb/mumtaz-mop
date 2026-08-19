-- 118_hr_requests.sql
-- §3.7 — "apply for sick leave and general HR requests from the app", and §3.10's
-- approval queue for those requests.
--
-- One table, not one per request type: leave, an advance and a document request
-- are the same shape — somebody asks, somebody decides, and both halves have to
-- be on the record. A per-type table would mean three approval screens that drift.
create table if not exists hr_requests (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id),
  technician_id  uuid not null references technicians(id),
  kind           text not null check (kind in ('sick_leave','annual_leave','unpaid_leave','advance','document','other')),
  status         text not null default 'submitted'
                   check (status in ('submitted','approved','declined','cancelled')),
  from_date      date,
  to_date        date,
  reason         text not null,
  attachment_ref text,                       -- e.g. a sick note in R2
  -- the decision, kept beside the request rather than in a separate audit trail
  decided_at     timestamptz,
  decided_by     uuid,
  decision_note  text,
  -- offline origin, same provenance rules as any other field record (Art. VII §4)
  client_uuid    uuid unique,
  device_time    timestamptz,
  created_at     timestamptz not null default now()
);

create index if not exists hr_requests_queue_idx
  on hr_requests (tenant_id, status, created_at desc);
create index if not exists hr_requests_person_idx
  on hr_requests (tenant_id, technician_id, created_at desc);

comment on table hr_requests is
  '3.7: leave and other requests raised from the technician app; 3.10: the office approval queue. One row per request, carrying its own decision.';

-- A date range must make sense, and leave must say when.
alter table hr_requests drop constraint if exists hr_requests_dates_sane;
alter table hr_requests add constraint hr_requests_dates_sane
  check ((from_date is null and to_date is null)
         or (from_date is not null and to_date is not null and to_date >= from_date));
alter table hr_requests drop constraint if exists hr_requests_leave_needs_dates;
alter table hr_requests add constraint hr_requests_leave_needs_dates
  check (kind not like '%leave' or from_date is not null);

-- A decision must record who made it: an approval nobody owns is not an approval.
alter table hr_requests drop constraint if exists hr_requests_decision_has_owner;
alter table hr_requests add constraint hr_requests_decision_has_owner
  check (status in ('submitted','cancelled') or (decided_at is not null and decided_by is not null));

alter table hr_requests enable row level security;
drop policy if exists tenant_isolation on hr_requests;
create policy tenant_isolation on hr_requests
  using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
grant select, insert, update on hr_requests to mop_app;
