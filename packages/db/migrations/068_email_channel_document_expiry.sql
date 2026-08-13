-- 068_email_channel_document_expiry.sql
-- Email architecture (DOCUMENT 9 §D) + document expiry engine (DOCUMENT 9 §E).
--
-- OUTBOUND NOTIFICATIONS: an append-only delivery log. Every customer-facing email
-- is a row here first; a transport (worker) sends it and appends status transitions
-- as NEW rows is overkill for a log whose status is bookkeeping — instead status/
-- provider fields are the mutable bookkeeping pair (same doctrine as
-- outbox_events.processed_at, mig 008): CONTENT (recipient, subject, body,
-- attachment) is frozen by trigger; only delivery bookkeeping may change. A bounce
-- flags the customer (data-quality), never fails silently. Manual re-send = a NEW
-- row linked by resend_of. Notification-only: templates carry no action links; the
-- customer calls the team lead (phone from the technician record).
--
-- DOCUMENT EXPIRY: expiry date columns on the entities that have documents
-- (customer trade licence, vehicle registration/insurance, technician visa/EID) +
-- monitored_documents for anything else (municipality licences, certifications).
-- The engine is a VIEW (expiring_documents) unioning all sources with configurable
-- reminder intervals (settings expiry.reminder_days) — deterministic, no state to
-- drift. A cron sweep queues notifications for due reminders.
--
-- Invariants: nothing weakened. New log table is content-append-only by trigger;
-- expiry columns are ordinary master data. RLS + mop_app grants per baseline.

-- ── outbound notifications ──────────────────────────────────────────────────
create table if not exists outbound_notifications (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id),
  service_line_id uuid references service_lines(id),
  kind          text not null check (kind in
                  ('visit_notice_24h','eta_notice','annual_schedule','schedule_change',
                   'service_report','receipt','invoice','document_expiry','manual')),
  customer_id   uuid references customers(id),
  branch_id     uuid references customer_branches(id),
  job_id        uuid references jobs(id),
  contract_id   uuid references contracts(id),
  to_email      text,
  subject       text not null,
  body_text     text not null,
  attachment_ref text,                  -- e.g. service-report PDF route / R2 key
  resend_of     uuid references outbound_notifications(id),
  -- delivery bookkeeping (mutable pair; content above is frozen)
  status        text not null default 'queued'
                check (status in ('queued','logged','sent','delivered','bounced','failed')),
  provider_id   text,
  error         text,
  sent_at       timestamptz,
  created_at    timestamptz not null default now(), created_by uuid
);
create index if not exists outbound_notifications_status_idx on outbound_notifications (tenant_id, status, created_at);
create index if not exists outbound_notifications_customer_idx on outbound_notifications (tenant_id, customer_id, created_at desc);

-- content-immutability: only delivery bookkeeping may change; DELETE forbidden
create or replace function enforce_notification_bookkeeping()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'outbound_notifications is append-only (DELETE forbidden)';
  end if;
  if new.kind is distinct from old.kind or new.customer_id is distinct from old.customer_id
     or new.to_email is distinct from old.to_email or new.subject is distinct from old.subject
     or new.body_text is distinct from old.body_text or new.attachment_ref is distinct from old.attachment_ref
     or new.resend_of is distinct from old.resend_of or new.created_at is distinct from old.created_at then
    raise exception 'outbound_notifications content is immutable — only delivery bookkeeping (status/provider_id/error/sent_at) may change';
  end if;
  return new;
end $$;
drop trigger if exists outbound_notifications_guard on outbound_notifications;
create trigger outbound_notifications_guard
  before update or delete on outbound_notifications
  for each row execute function enforce_notification_bookkeeping();

-- bounce → customer data-quality flag (never silent)
alter table customers add column if not exists email_bounced_at timestamptz;

alter table outbound_notifications enable row level security;
drop policy if exists tenant_isolation on outbound_notifications;
create policy tenant_isolation on outbound_notifications
  using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
grant select, insert, update on outbound_notifications to mop_app;  -- no delete

-- ── document expiry ─────────────────────────────────────────────────────────
alter table customers   add column if not exists trade_licence_issue_date date,
                        add column if not exists trade_licence_expiry_date date;
alter table vehicles    add column if not exists registration_expiry_date date,
                        add column if not exists insurance_expiry_date date;
alter table technicians add column if not exists visa_expiry_date date,
                        add column if not exists emirates_id_expiry_date date;

create table if not exists monitored_documents (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id),
  service_line_id uuid references service_lines(id),
  kind          text not null check (kind in
                  ('municipality_licence','certification','customer_document','vehicle_document','employee_document','other')),
  title         text not null,
  customer_id   uuid references customers(id),
  vehicle_id    uuid references vehicles(id),
  technician_id uuid references technicians(id),
  expiry_date   date not null,
  notes         text,
  is_active     boolean not null default true,
  is_assumed    boolean not null default false,
  assumed_note  text,
  created_at    timestamptz not null default now(), created_by uuid,
  updated_at    timestamptz not null default now(), updated_by uuid
);
alter table monitored_documents enable row level security;
drop policy if exists tenant_isolation on monitored_documents;
create policy tenant_isolation on monitored_documents
  using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
grant select, insert, update, delete on monitored_documents to mop_app;

-- one deterministic view over every expiry source
create or replace view expiring_documents with (security_invoker = true) as
select tenant_id, 'customer_trade_licence' as kind,
       'Trade licence — ' || coalesce(trade_name, legal_name, code) as title,
       id as customer_id, null::uuid as vehicle_id, null::uuid as technician_id,
       trade_licence_expiry_date as expiry_date
  from customers where trade_licence_expiry_date is not null and archived_at is null
union all
select tenant_id, 'vehicle_registration', 'Registration — ' || coalesce(name, code),
       null, id, null, registration_expiry_date
  from vehicles where registration_expiry_date is not null
union all
select tenant_id, 'vehicle_insurance', 'Insurance — ' || coalesce(name, code),
       null, id, null, insurance_expiry_date
  from vehicles where insurance_expiry_date is not null
union all
select tenant_id, 'employee_visa', 'Visa — ' || coalesce(full_name, code),
       null, null, id, visa_expiry_date
  from technicians where visa_expiry_date is not null
union all
select tenant_id, 'employee_eid', 'Emirates ID — ' || coalesce(full_name, code),
       null, null, id, emirates_id_expiry_date
  from technicians where emirates_id_expiry_date is not null
union all
select tenant_id, kind, title, customer_id, vehicle_id, technician_id, expiry_date
  from monitored_documents where is_active;
grant select on expiring_documents to mop_app;

-- configurable reminder intervals (days before expiry; 0 = expiry day; -n = after)
do $$
declare v_tenant uuid;
begin
  select id into v_tenant from tenants where name = 'Mumtaz Integrated Services Group';
  insert into settings (tenant_id, service_line_id, key, value, description, is_assumed)
  values (v_tenant, null, 'expiry.reminder_days', '[90,60,30,14,7,0]'::jsonb,
          'Days before expiry to raise reminders (0 = on the day). ASSUMED intervals - adjust freely.', true)
  on conflict (tenant_id, service_line_id, key) do nothing;
end $$;
