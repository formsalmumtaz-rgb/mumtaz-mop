-- 037_gl_posting_engine.sql
-- Back Office Revenue Loop, milestone 7: the UNIFIED GL posting engine.
-- Posts every financial document to the double-entry ledger (journal_entries /
-- journal_lines). Per DECISIONS §9.1 and FINANCE_ARCHITECTURE.md §5.
--
-- Properties (all enforced here):
--   * deterministic  — pure SQL, no model call;
--   * append-only    — only inserts; reversals are NEW entries, never edits;
--   * idempotent     — guarded on (source_type, source_id); re-running is a no-op;
--   * balanced       — every entry satisfies debits=credits (existing constraint);
--   * configurable   — accounts resolved from settings codes (like fn_cost_account),
--                      seeded ASSUMED and editable; fail-closed if unconfigured.
--
-- Posting matrix:
--   invoice issued     Dr AR(total)              Cr Revenue(subtotal) Cr VAT(vat)
--   invoice cancelled  Dr Revenue Dr VAT         Cr AR(total)            [reversal]
--   receipt            Dr Bank(amount)           Cr AR(amount)
--   credit note issued Dr Revenue Dr VAT         Cr AR(total)
--   refund             Dr AR(amount)             Cr Bank(amount)
-- VAT line omitted when zero. Nothing in cost/inventory posting is changed.

-- ── New ASSUMED, editable accounts + settings code mappings ───────────────
insert into accounts (tenant_id, code, name, account_type, is_assumed, assumed_note)
select t.id, v.code, v.name, v.atype, true, 'Revenue-loop account — ASSUMED; replace with the accountant''s final CoA code without a schema change.'
from tenants t
cross join (values
  ('1000','Cash / Bank','asset'),
  ('1100','Accounts Receivable','asset'),
  ('2200','VAT Output Payable','liability'),
  ('4000','Service Revenue','income')
) as v(code, name, atype)
on conflict do nothing;

insert into settings (tenant_id, service_line_id, key, value, description, is_assumed)
select t.id, null, v.key, to_jsonb(v.val), v.descr, true
from tenants t
cross join (values
  ('gl.account_code.bank',       '1000','GL account code for cash/bank (receipts in, refunds out).'),
  ('gl.account_code.receivable', '1100','GL account code for accounts receivable.'),
  ('gl.account_code.vat_output', '2200','GL account code for VAT output payable.'),
  ('gl.account_code.revenue',    '4000','GL account code for service revenue (ex-VAT).')
) as v(key, val, descr)
on conflict (tenant_id, service_line_id, key) do nothing;

-- Resolve a GL account id from its settings code (fail-closed via callers).
create or replace function fn_gl_account(p_tenant uuid, p_key text)
returns uuid language sql stable as $$
  select a.id from accounts a
   where a.tenant_id = p_tenant
     and a.code = (select value #>> '{}' from settings s
                    where s.tenant_id = p_tenant and s.service_line_id is null and s.key = p_key)
   limit 1;
$$;

-- ── Per-document posting functions (idempotent, balanced) ─────────────────
create or replace function fn_post_invoice_gl(p_invoice uuid)
returns uuid language plpgsql as $$
declare inv record; e uuid; a_ar uuid; a_rev uuid; a_vat uuid;
begin
  select * into inv from invoices where id = p_invoice;
  if not found or inv.status not in ('issued','paid') or coalesce(inv.total,0) <= 0 then return null; end if;
  if exists (select 1 from journal_entries where tenant_id=inv.tenant_id and source_type='invoice' and source_id=p_invoice) then return null; end if;
  a_ar := fn_gl_account(inv.tenant_id,'gl.account_code.receivable');
  a_rev := fn_gl_account(inv.tenant_id,'gl.account_code.revenue');
  a_vat := fn_gl_account(inv.tenant_id,'gl.account_code.vat_output');
  if a_ar is null or a_rev is null then raise exception 'GL accounts not configured (receivable/revenue)'; end if;
  insert into journal_entries(tenant_id, service_line_id, source_type, source_id, entry_date, memo)
    values (inv.tenant_id, inv.service_line_id, 'invoice', p_invoice, coalesce(inv.issue_date, current_date), 'Invoice '||coalesce(inv.invoice_number,'')) returning id into e;
  insert into journal_lines(tenant_id, journal_entry_id, account_id, debit, credit, currency, memo)
    values (inv.tenant_id, e, a_ar, inv.total, 0, inv.currency, 'Accounts receivable');
  if inv.subtotal > 0 then
    insert into journal_lines(tenant_id, journal_entry_id, account_id, debit, credit, currency, memo)
      values (inv.tenant_id, e, a_rev, 0, inv.subtotal, inv.currency, 'Service revenue');
  end if;
  if inv.vat_total > 0 then
    if a_vat is null then raise exception 'VAT output account not configured'; end if;
    insert into journal_lines(tenant_id, journal_entry_id, account_id, debit, credit, currency, memo)
      values (inv.tenant_id, e, a_vat, 0, inv.vat_total, inv.currency, 'VAT output');
  end if;
  return e;
end $$;

create or replace function fn_post_invoice_cancel_gl(p_invoice uuid)
returns uuid language plpgsql as $$
declare inv record; e uuid; a_ar uuid; a_rev uuid; a_vat uuid;
begin
  select * into inv from invoices where id = p_invoice;
  if not found or inv.status <> 'cancelled' then return null; end if;
  -- only reverse if the original invoice entry was posted and not already reversed
  if not exists (select 1 from journal_entries where tenant_id=inv.tenant_id and source_type='invoice' and source_id=p_invoice) then return null; end if;
  if exists (select 1 from journal_entries where tenant_id=inv.tenant_id and source_type='invoice_cancel' and source_id=p_invoice) then return null; end if;
  a_ar := fn_gl_account(inv.tenant_id,'gl.account_code.receivable');
  a_rev := fn_gl_account(inv.tenant_id,'gl.account_code.revenue');
  a_vat := fn_gl_account(inv.tenant_id,'gl.account_code.vat_output');
  insert into journal_entries(tenant_id, service_line_id, source_type, source_id, entry_date, memo)
    values (inv.tenant_id, inv.service_line_id, 'invoice_cancel', p_invoice, current_date, 'Reverse cancelled invoice '||coalesce(inv.invoice_number,'')) returning id into e;
  if inv.subtotal > 0 then
    insert into journal_lines(tenant_id, journal_entry_id, account_id, debit, credit, currency, memo)
      values (inv.tenant_id, e, a_rev, inv.subtotal, 0, inv.currency, 'Reverse service revenue');
  end if;
  if inv.vat_total > 0 then
    insert into journal_lines(tenant_id, journal_entry_id, account_id, debit, credit, currency, memo)
      values (inv.tenant_id, e, a_vat, inv.vat_total, 0, inv.currency, 'Reverse VAT output');
  end if;
  insert into journal_lines(tenant_id, journal_entry_id, account_id, debit, credit, currency, memo)
    values (inv.tenant_id, e, a_ar, 0, inv.total, inv.currency, 'Reverse accounts receivable');
  return e;
end $$;

create or replace function fn_post_receipt_gl(p_receipt uuid)
returns uuid language plpgsql as $$
declare r record; e uuid; a_ar uuid; a_bank uuid;
begin
  select * into r from receipts where id = p_receipt;
  if not found or coalesce(r.amount,0) <= 0 then return null; end if;
  if exists (select 1 from journal_entries where tenant_id=r.tenant_id and source_type='receipt' and source_id=p_receipt) then return null; end if;
  a_ar := fn_gl_account(r.tenant_id,'gl.account_code.receivable');
  a_bank := fn_gl_account(r.tenant_id,'gl.account_code.bank');
  if a_ar is null or a_bank is null then raise exception 'GL accounts not configured (bank/receivable)'; end if;
  insert into journal_entries(tenant_id, service_line_id, source_type, source_id, entry_date, memo)
    values (r.tenant_id, r.service_line_id, 'receipt', p_receipt, coalesce(r.receipt_date, current_date), 'Receipt '||coalesce(r.receipt_number,'')) returning id into e;
  insert into journal_lines(tenant_id, journal_entry_id, account_id, debit, credit, currency, memo) values
    (r.tenant_id, e, a_bank, r.amount, 0, 'AED', 'Cash / bank'),
    (r.tenant_id, e, a_ar, 0, r.amount, 'AED', 'Settle accounts receivable');
  return e;
end $$;

create or replace function fn_post_credit_note_gl(p_cn uuid)
returns uuid language plpgsql as $$
declare cn record; e uuid; a_ar uuid; a_rev uuid; a_vat uuid;
begin
  select * into cn from credit_notes where id = p_cn;
  if not found or cn.status <> 'issued' or coalesce(cn.total,0) <= 0 then return null; end if;
  if exists (select 1 from journal_entries where tenant_id=cn.tenant_id and source_type='credit_note' and source_id=p_cn) then return null; end if;
  a_ar := fn_gl_account(cn.tenant_id,'gl.account_code.receivable');
  a_rev := fn_gl_account(cn.tenant_id,'gl.account_code.revenue');
  a_vat := fn_gl_account(cn.tenant_id,'gl.account_code.vat_output');
  if a_ar is null or a_rev is null then raise exception 'GL accounts not configured (receivable/revenue)'; end if;
  insert into journal_entries(tenant_id, service_line_id, source_type, source_id, entry_date, memo)
    values (cn.tenant_id, cn.service_line_id, 'credit_note', p_cn, coalesce(cn.issue_date, current_date), 'Credit note '||coalesce(cn.credit_note_number,'')) returning id into e;
  if cn.subtotal > 0 then
    insert into journal_lines(tenant_id, journal_entry_id, account_id, debit, credit, currency, memo)
      values (cn.tenant_id, e, a_rev, cn.subtotal, 0, 'AED', 'Reverse service revenue (credit)');
  end if;
  if cn.vat_total > 0 then
    if a_vat is null then raise exception 'VAT output account not configured'; end if;
    insert into journal_lines(tenant_id, journal_entry_id, account_id, debit, credit, currency, memo)
      values (cn.tenant_id, e, a_vat, cn.vat_total, 0, 'AED', 'Reverse VAT output (credit)');
  end if;
  insert into journal_lines(tenant_id, journal_entry_id, account_id, debit, credit, currency, memo)
    values (cn.tenant_id, e, a_ar, 0, cn.total, 'AED', 'Reduce accounts receivable');
  return e;
end $$;

create or replace function fn_post_refund_gl(p_refund uuid)
returns uuid language plpgsql as $$
declare rf record; e uuid; a_ar uuid; a_bank uuid;
begin
  select * into rf from refunds where id = p_refund;
  if not found or coalesce(rf.amount,0) <= 0 then return null; end if;
  if exists (select 1 from journal_entries where tenant_id=rf.tenant_id and source_type='refund' and source_id=p_refund) then return null; end if;
  a_ar := fn_gl_account(rf.tenant_id,'gl.account_code.receivable');
  a_bank := fn_gl_account(rf.tenant_id,'gl.account_code.bank');
  if a_ar is null or a_bank is null then raise exception 'GL accounts not configured (bank/receivable)'; end if;
  insert into journal_entries(tenant_id, service_line_id, source_type, source_id, entry_date, memo)
    values (rf.tenant_id, rf.service_line_id, 'refund', p_refund, coalesce(rf.refund_date, current_date), 'Refund '||coalesce(rf.refund_number,'')) returning id into e;
  insert into journal_lines(tenant_id, journal_entry_id, account_id, debit, credit, currency, memo) values
    (rf.tenant_id, e, a_ar, rf.amount, 0, 'AED', 'Accounts receivable (refund)'),
    (rf.tenant_id, e, a_bank, 0, rf.amount, 'AED', 'Cash / bank (refund out)');
  return e;
end $$;

-- ── Unified engine: post everything not yet posted for a tenant ───────────
-- Idempotent catch-up / back-post. Domain calls the specific fn after each
-- action; this exists for back-posting existing documents and as a safety net.
create or replace function fn_gl_sync(p_tenant uuid)
returns integer language plpgsql as $$
declare n integer := 0; r record;
begin
  for r in select id from invoices where tenant_id=p_tenant and document_type='tax_invoice' and status in ('issued','paid')
             and not exists (select 1 from journal_entries je where je.tenant_id=p_tenant and je.source_type='invoice' and je.source_id=invoices.id) loop
    if fn_post_invoice_gl(r.id) is not null then n := n + 1; end if;
  end loop;
  for r in select id from invoices where tenant_id=p_tenant and status='cancelled'
             and exists (select 1 from journal_entries je where je.tenant_id=p_tenant and je.source_type='invoice' and je.source_id=invoices.id)
             and not exists (select 1 from journal_entries je where je.tenant_id=p_tenant and je.source_type='invoice_cancel' and je.source_id=invoices.id) loop
    if fn_post_invoice_cancel_gl(r.id) is not null then n := n + 1; end if;
  end loop;
  for r in select id from receipts where tenant_id=p_tenant
             and not exists (select 1 from journal_entries je where je.tenant_id=p_tenant and je.source_type='receipt' and je.source_id=receipts.id) loop
    if fn_post_receipt_gl(r.id) is not null then n := n + 1; end if;
  end loop;
  for r in select id from credit_notes where tenant_id=p_tenant and status='issued'
             and not exists (select 1 from journal_entries je where je.tenant_id=p_tenant and je.source_type='credit_note' and je.source_id=credit_notes.id) loop
    if fn_post_credit_note_gl(r.id) is not null then n := n + 1; end if;
  end loop;
  for r in select id from refunds where tenant_id=p_tenant
             and not exists (select 1 from journal_entries je where je.tenant_id=p_tenant and je.source_type='refund' and je.source_id=refunds.id) loop
    if fn_post_refund_gl(r.id) is not null then n := n + 1; end if;
  end loop;
  return n;
end $$;
