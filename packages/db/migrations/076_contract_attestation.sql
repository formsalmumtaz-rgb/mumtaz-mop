-- 076_contract_attestation.sql
-- Contract attestation tracking (workflow spec item 6 — a HARD legal obligation:
-- Sharjah City Municipality must attest every contract within 30 DAYS of signing;
-- Restrictive contracts BEFORE treatment begins. Fees payable by the client.
-- SOURCE: Sharjah Municipality Unified Contract, general condition 1
-- (docs/compliance/, filed 13 Aug 2026).
--
--   * contracts gains the attestation lifecycle: not_required → pending (set
--     AUTOMATICALLY the moment an agreement document is generated — no manual
--     step) → submitted → attested; overdue is COMPUTED (never stored) from the
--     30-day clock off signed_at (fallback start_date), or off start_date for
--     Restrictive-category contracts (attest BEFORE treatment).
--   * contract_attestation_alerts view — feeds the dashboard + the notification
--     sweep (reminders well before / at / after the deadline).
--   * contract_notices — amendment / termination municipality-notification
--     obligations tracked as TASKS, not just clauses (15-day termination notice).
--
-- Invariants untouched: contracts is mutable master data; the alert view is
-- deterministic; notification kinds check extended (reference data, mig 068).

alter table contracts
  add column if not exists attestation_status text not null default 'not_required'
    check (attestation_status in ('not_required','pending','submitted','attested')),
  add column if not exists attestation_submitted_at date,
  add column if not exists attested_at date,
  add column if not exists attestation_receipt_no text,
  add column if not exists attestation_employee_ref text,   -- competent employee ref from the municipality stamp
  add column if not exists attested_document_key text,      -- uploaded attested copy (R2 key)
  add column if not exists attestation_fee numeric,
  add column if not exists attestation_fee_paid_by text not null default 'client'
    check (attestation_fee_paid_by in ('client','company'));

-- allow 'attestation' notifications through the channel
alter table outbound_notifications drop constraint if exists outbound_notifications_kind_check;
alter table outbound_notifications add constraint outbound_notifications_kind_check
  check (kind in ('visit_notice_24h','eta_notice','annual_schedule','schedule_change',
                  'service_report','receipt','invoice','document_expiry','attestation','manual'));

-- deadline + overdue, computed — Restrictive attests BEFORE treatment (deadline =
-- start_date); everyone else signing+30d (fallback start_date+30d; nothing → null)
create or replace view contract_attestation_alerts with (security_invoker = true) as
select ct.tenant_id, ct.id as contract_id, ct.contract_number, ct.customer_id,
       cu.trade_name as customer, ct.attestation_status,
       case when mc.code = 'restrictive' then ct.start_date
            else coalesce(ct.signed_at::date, ct.start_date) + 30 end as attestation_deadline,
       (ct.attestation_status in ('pending','submitted')
        and case when mc.code = 'restrictive' then ct.start_date
                 else coalesce(ct.signed_at::date, ct.start_date) + 30 end < current_date) as is_overdue,
       (mc.code = 'restrictive') as attest_before_treatment
  from contracts ct
  join customers cu on cu.id = ct.customer_id
  left join facility_types ft on ft.id = ct.facility_type_id
  left join municipality_categories mc on mc.id = ft.municipality_category_id
 where ct.archived_at is null and ct.attestation_status <> 'not_required'
   and (ct.signed_at is not null or ct.start_date is not null);
grant select on contract_attestation_alerts to mop_app;

-- amendment / termination municipality-notice obligations as tasks
create table if not exists contract_notices (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id),
  contract_id  uuid not null references contracts(id),
  kind         text not null check (kind in ('amendment','termination')),
  required_by  date,                                    -- termination: 15 days before effect
  note         text,
  done_at      timestamptz, done_by uuid,
  created_at   timestamptz not null default now(), created_by uuid
);
alter table contract_notices enable row level security;
drop policy if exists tenant_isolation on contract_notices;
create policy tenant_isolation on contract_notices
  using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
grant select, insert, update on contract_notices to mop_app;
