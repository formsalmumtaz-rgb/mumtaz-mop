-- 033_document_numbering_service_reports.sql
-- Back Office Revenue Loop, milestone 1: document numbering + Service Report.
--
-- (A) Generic, gap-free document numbering used by SR / QTN / AMTX (contract
--     invoices) / AMTX-OW (ad-hoc invoices). A single global counter per series;
--     the year is stamped from the issue date but the number never resets and is
--     never reused — a cancelled document keeps its number forever. Atomic under
--     concurrency (single UPDATE ... RETURNING locks the counter row).
-- (B) Service Report is already append-only (mig 006). We do NOT mutate it. The
--     approval workflow and the permanently-attached photos/signature/files are
--     modelled as SEPARATE append-only records, preserving the immutable report.
--
-- Additive; no existing table/invariant touched. Accounting is not involved here.

-- ── (A) Document numbering ────────────────────────────────────────────────
create table document_counters (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id),
  series_key    text not null,                 -- 'SR' | 'QTN' | 'AMTX' | 'AMTX_OW'
  prefix        text not null,                 -- rendered prefix, e.g. 'AMTX/OW'
  pad_width     integer not null default 5 check (pad_width between 1 and 12),
  next_value    bigint not null default 1 check (next_value >= 1),
  is_assumed    boolean not null default false,
  assumed_note  text,
  created_at    timestamptz not null default now(), created_by uuid,
  updated_at    timestamptz not null default now(), updated_by uuid,
  unique (tenant_id, series_key)
);
create trigger document_counters_touch before update on document_counters
  for each row execute function set_updated_at();
alter table document_counters enable row level security;
create policy tenant_isolation on document_counters using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
grant select, insert, update, delete on document_counters to mop_app;

-- Atomically consume the next number for a series and format it as
-- PREFIX/YY/NNNNN. Raises if the series is not configured (fail-closed — never
-- silently emit an unnumbered document).
create or replace function fn_next_document_number(p_tenant uuid, p_series text)
returns text language plpgsql as $$
declare v_n bigint; v_prefix text; v_pad integer; v_yy text := to_char(current_date, 'YY');
begin
  update document_counters
     set next_value = next_value + 1
   where tenant_id = p_tenant and series_key = p_series
   returning next_value - 1, prefix, pad_width into v_n, v_prefix, v_pad;
  if not found then
    raise exception 'Document series % is not configured for this tenant', p_series;
  end if;
  return v_prefix || '/' || v_yy || '/' || lpad(v_n::text, v_pad, '0');
end $$;

-- Seed counters for every tenant. SR/QTN are new internal series (start at 1).
-- AMTX / AMTX_OW continue the legacy invoice sequences, so their starting value
-- is ASSUMED — the owner sets the real next number from settings before issuing,
-- so we never clash with or reuse a legacy invoice number.
insert into document_counters (tenant_id, series_key, prefix, pad_width, next_value, is_assumed, assumed_note)
select t.id, v.series_key, v.prefix, v.pad_width, v.next_value, v.is_assumed, v.assumed_note
from tenants t
cross join (values
  ('SR',      'SR',      5, 1::bigint, false, null),
  ('QTN',     'QTN',     5, 1::bigint, false, null),
  ('AMTX',    'AMTX',    5, 1::bigint, true,  'Placeholder start — set the real next contract-invoice number before issuing (legacy sequence continues, e.g. AMTX/25/22119).'),
  ('AMTX_OW', 'AMTX/OW', 5, 1::bigint, true,  'Placeholder start — set the real next ad-hoc invoice number before issuing.')
) as v(series_key, prefix, pad_width, next_value, is_assumed, assumed_note)
on conflict (tenant_id, series_key) do nothing;

-- ── (B) Service Report approval (append-only; SR itself stays immutable) ───
create table service_report_reviews (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id),
  service_report_id uuid not null references service_reports(id),
  action            text not null check (action in ('approved','rejected')),
  reviewed_by       uuid,
  note              text,
  created_at        timestamptz not null default now(), created_by uuid
);
create index service_report_reviews_sr_idx on service_report_reviews (service_report_id);
create trigger service_report_reviews_append_only before update or delete on service_report_reviews
  for each row execute function enforce_append_only();
alter table service_report_reviews enable row level security;
create policy tenant_isolation on service_report_reviews using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
grant select, insert, update, delete on service_report_reviews to mop_app;

-- ── (B) Service Report attachments (photos / signature / files — permanent) ─
create table service_report_attachments (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id),
  service_report_id uuid not null references service_reports(id),
  kind              text not null check (kind in ('photo','signature','document')),
  storage_key       text not null,             -- R2 object key
  caption           text,
  content_type      text,
  byte_size         bigint,
  created_at        timestamptz not null default now(), created_by uuid
);
create index service_report_attachments_sr_idx on service_report_attachments (service_report_id);
create trigger service_report_attachments_append_only before update or delete on service_report_attachments
  for each row execute function enforce_append_only();
alter table service_report_attachments enable row level security;
create policy tenant_isolation on service_report_attachments using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
grant select, insert, update, delete on service_report_attachments to mop_app;

-- Current review state per service report (latest review wins; null = pending).
create view service_report_status with (security_invoker = true) as
select sr.id as service_report_id, sr.tenant_id, sr.job_id,
       lr.action as review_action, lr.created_at as reviewed_at
from service_reports sr
left join lateral (
  select action, created_at from service_report_reviews r
   where r.service_report_id = sr.id order by r.created_at desc limit 1
) lr on true;
grant select on service_report_status to mop_app;

-- Invoice gating helper: does this job have a service report, and is it approved
-- (or not yet reviewed = acceptable when no approval is required)? A rejected
-- report blocks. Used by the Invoice milestone.
create or replace function fn_job_service_report_ok(p_tenant uuid, p_job uuid, p_require_approval boolean default false)
returns boolean language sql stable as $$
  select case
    when not exists (select 1 from service_reports where tenant_id=p_tenant and job_id=p_job) then false
    when p_require_approval then exists (
      select 1 from service_report_status s
       where s.tenant_id=p_tenant and s.job_id=p_job and s.review_action='approved')
    else not exists (
      select 1 from service_report_status s
       where s.tenant_id=p_tenant and s.job_id=p_job and s.review_action='rejected')
  end;
$$;
