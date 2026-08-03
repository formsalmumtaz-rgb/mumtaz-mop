-- 034_invoice_subledger.sql
-- Back Office Revenue Loop, milestone 2: Invoice SUBLEDGER (no GL posting).
--
-- Per the adjusted roadmap, all financial documents (invoice, receipt, credit
-- note) are built as append-only subledger records first; a single unified GL
-- posting engine comes AFTER they all exist. So this migration does NOT touch
-- journal_entries / journal_lines. It adds:
--   (A) issue/cancel lifecycle for the existing invoices table (mig 007) with
--       AMTX / AMTX-OW numbering assigned on issue (never reused; cancelled
--       invoices keep their number), due date, and a Service-Report gate.
--   (B) cancellation history columns (reason / who / when) — nothing is deleted.
--   (C) ASSUMED settings: default payment terms + default VAT rate.
--
-- The invoice row's financial content is frozen once issued (only status and
-- cancellation metadata change); editing an issued invoice is a later
-- approval-gated milestone. Additive; no existing invariant touched.

-- ── (B) cancellation history ──────────────────────────────────────────────
alter table invoices add column cancelled_at     timestamptz;
alter table invoices add column cancelled_reason text;
alter table invoices add column cancelled_by     uuid;

-- ── (C) ASSUMED settings (editable, flagged) ──────────────────────────────
insert into settings (tenant_id, service_line_id, key, value, description, is_assumed)
select t.id, null, v.key, v.value::jsonb, v.descr, true
from tenants t
cross join (values
  ('ar.default_payment_terms_days', '30',  'Default invoice payment terms in days (ASSUMED — set per customer/contract later).'),
  ('ar.default_vat_rate',           '5',   'Default VAT rate percent for standard-rated invoices (UAE, ASSUMED).'),
  ('ar.require_sr_approval',        'false','Require an APPROVED (not merely present) service report before a job-linked invoice can be issued.')
) as v(key, value, descr)
on conflict (tenant_id, service_line_id, key) do nothing;

-- ── (A) Issue an invoice ──────────────────────────────────────────────────
-- Assigns the next number in the correct series, sets issue/tax-point/due dates,
-- and finalises the invoice. Job-linked invoices are gated on a service report
-- (existing, not rejected; approved when ar.require_sr_approval is true).
-- Numbering: contract-linked -> AMTX (recurring series); otherwise -> AMTX-OW
-- (ad-hoc series). NO GL posting here (unified engine handles that later).
create or replace function fn_issue_invoice(p_invoice uuid)
returns text language plpgsql as $$
declare
  inv record; v_series text; v_number text; v_terms int; v_require_appr boolean;
begin
  select * into inv from invoices where id = p_invoice for update;
  if not found then raise exception 'Invoice not found'; end if;
  if inv.status not in ('draft','queued') then
    raise exception 'Only draft/queued invoices can be issued (status=%)', inv.status;
  end if;

  -- Service-report gate for job-linked invoices
  if inv.job_id is not null then
    v_require_appr := coalesce((select value::text::boolean from settings
      where tenant_id=inv.tenant_id and service_line_id is null and key='ar.require_sr_approval'), false);
    if not fn_job_service_report_ok(inv.tenant_id, inv.job_id, v_require_appr) then
      raise exception 'A completed% service report is required before this invoice can be issued',
        case when v_require_appr then ', approved' else '' end;
    end if;
  end if;

  -- Assign the number once (kept forever, even if later cancelled)
  if inv.invoice_number is null then
    v_series := case when inv.contract_id is not null then 'AMTX' else 'AMTX_OW' end;
    v_number := fn_next_document_number(inv.tenant_id, v_series);
  else
    v_number := inv.invoice_number;
  end if;

  v_terms := coalesce((select value::text::int from settings
    where tenant_id=inv.tenant_id and service_line_id is null and key='ar.default_payment_terms_days'), 30);

  update invoices
     set invoice_number = v_number,
         status         = 'issued',
         issue_date     = coalesce(issue_date, current_date),
         tax_point_date = coalesce(tax_point_date, current_date),
         due_date       = coalesce(due_date, current_date + (v_terms || ' days')::interval)
   where id = p_invoice;

  return v_number;
end $$;

-- ── (A) Cancel an invoice (number stays reserved; full history kept) ───────
create or replace function fn_cancel_invoice(p_invoice uuid, p_reason text, p_by uuid default null)
returns void language plpgsql as $$
declare inv record;
begin
  select * into inv from invoices where id = p_invoice for update;
  if not found then raise exception 'Invoice not found'; end if;
  if inv.status = 'cancelled' then return; end if;      -- idempotent
  if inv.status = 'paid' then raise exception 'A paid invoice cannot be cancelled (issue a credit note instead)'; end if;
  update invoices
     set status = 'cancelled', cancelled_at = now(),
         cancelled_reason = nullif(trim(coalesce(p_reason,'')), ''), cancelled_by = p_by
   where id = p_invoice;
end $$;

-- ── AR-facing view: one row per invoice with the outstanding basics ────────
-- (Receipts/allocations arrive in the next milestone; balance = total until then.)
create view invoice_summary with (security_invoker = true) as
select i.tenant_id, i.id, i.invoice_number, i.document_type, i.customer_id,
       i.contract_id, i.job_id, i.status, i.issue_date, i.due_date,
       i.currency, i.subtotal, i.vat_total, i.total,
       (i.contract_id is not null) as is_contract_invoice
from invoices i;
grant select on invoice_summary to mop_app;
