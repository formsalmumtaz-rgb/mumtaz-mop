-- 042_receipt_reversal.sql
-- Correction path for receipts (bounced cheque / misapplied payment). Receipts
-- are append-only, so a reversal is an append-only receipt_reversals record — the
-- original receipt is never edited. Its allocations then stop counting toward AR
-- (invoice_ar honours the reversal), any invoice it had marked paid reverts to
-- issued, and a reversing GL entry (Dr AR / Cr Bank) nets the cash back out.

create table receipt_reversals (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id),
  receipt_id uuid not null references receipts(id) unique,   -- one reversal per receipt
  reason     text,
  created_at timestamptz not null default now(), created_by uuid
);
create index receipt_reversals_tenant_idx on receipt_reversals(tenant_id);
create trigger receipt_reversals_append_only before update or delete on receipt_reversals
  for each row execute function enforce_append_only();
alter table receipt_reversals enable row level security;
create policy tenant_isolation on receipt_reversals using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
grant select, insert, update, delete on receipt_reversals to mop_app;

-- AR view now excludes allocations from reversed receipts. (Dropped + recreated
-- because create-or-replace cannot restructure the allocation subquery.)
drop view if exists invoice_ar;
create view invoice_ar with (security_invoker = true) as
select i.tenant_id, i.id as invoice_id, i.invoice_number, i.customer_id, i.contract_id,
       i.status, i.issue_date, i.due_date, i.currency, i.total::numeric as total,
       coalesce(a.allocated, 0) as allocated,
       (i.total - coalesce(a.allocated, 0)) as balance,
       (i.contract_id is not null) as is_contract_invoice,
       case when (i.total - coalesce(a.allocated,0)) <= 0 then 'paid'
            when coalesce(a.allocated,0) > 0 then 'partial'
            else 'unpaid' end as payment_status,
       case when i.due_date is null then 0 else greatest(0, (current_date - i.due_date)) end as days_overdue,
       case when (i.total - coalesce(a.allocated,0)) <= 0 then 'paid'
            when i.due_date is null or current_date <= i.due_date then 'current'
            when current_date - i.due_date <= 30  then '1-30'
            when current_date - i.due_date <= 60  then '31-60'
            when current_date - i.due_date <= 90  then '61-90'
            when current_date - i.due_date <= 120 then '91-120'
            else '120+' end as aging_bucket
from invoices i
left join (
  select ra.invoice_id, sum(ra.amount) as allocated
    from receipt_allocations ra
   where not exists (select 1 from receipt_reversals rr where rr.receipt_id = ra.receipt_id)
   group by ra.invoice_id
) a on a.invoice_id = i.id
where i.document_type = 'tax_invoice' and i.status <> 'cancelled';
grant select on invoice_ar to mop_app;

-- Reversing GL entry for a reversed receipt: Dr AR / Cr Bank (nets the original
-- receipt's Dr Bank / Cr AR to zero). Idempotent on (source_type, source_id).
create or replace function fn_post_receipt_reversal_gl(p_receipt uuid)
returns uuid language plpgsql as $$
declare r record; e uuid; a_ar uuid; a_bank uuid;
begin
  select * into r from receipts where id = p_receipt;
  if not found or coalesce(r.amount,0) <= 0 then return null; end if;
  if not exists (select 1 from receipt_reversals rr where rr.receipt_id = p_receipt) then return null; end if;
  if exists (select 1 from journal_entries where tenant_id=r.tenant_id and source_type='receipt_reversal' and source_id=p_receipt) then return null; end if;
  a_ar := fn_gl_account(r.tenant_id,'gl.account_code.receivable');
  a_bank := fn_gl_account(r.tenant_id,'gl.account_code.bank');
  if a_ar is null or a_bank is null then raise exception 'GL accounts not configured (bank/receivable)'; end if;
  insert into journal_entries(tenant_id, service_line_id, source_type, source_id, entry_date, memo)
    values (r.tenant_id, r.service_line_id, 'receipt_reversal', p_receipt, current_date, 'Reverse receipt '||coalesce(r.receipt_number,'')) returning id into e;
  insert into journal_lines(tenant_id, journal_entry_id, account_id, debit, credit, currency, memo) values
    (r.tenant_id, e, a_ar, r.amount, 0, 'AED', 'Reinstate accounts receivable (receipt reversed)'),
    (r.tenant_id, e, a_bank, 0, r.amount, 'AED', 'Cash / bank out (receipt reversed)');
  return e;
end $$;

-- Reverse a receipt: record the reversal, revert any invoices it had paid, post GL.
create or replace function fn_reverse_receipt(p_receipt uuid, p_reason text)
returns void language plpgsql as $$
declare r record;
begin
  select * into r from receipts where id = p_receipt;
  if not found then raise exception 'Receipt not found'; end if;
  if exists (select 1 from receipt_reversals rr where rr.receipt_id = p_receipt) then return; end if;  -- idempotent
  insert into receipt_reversals(tenant_id, receipt_id, reason, created_by)
    values (r.tenant_id, p_receipt, nullif(trim(coalesce(p_reason,'')), ''), app_current_actor());
  -- any invoice this receipt had cleared, that now has a balance again, reverts to 'issued'
  update invoices i set status = 'issued'
    from (select distinct invoice_id from receipt_allocations where receipt_id = p_receipt) ra
   where ra.invoice_id = i.id and i.status = 'paid'
     and (i.total - coalesce((select sum(a.amount) from receipt_allocations a
             where a.invoice_id = i.id and not exists (select 1 from receipt_reversals rr where rr.receipt_id = a.receipt_id)), 0)) > 0;
  perform fn_post_receipt_reversal_gl(p_receipt);
end $$;

-- Include receipt reversals in the unified back-post sweep.
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
  for r in select receipt_id from receipt_reversals where tenant_id=p_tenant
             and not exists (select 1 from journal_entries je where je.tenant_id=p_tenant and je.source_type='receipt_reversal' and je.source_id=receipt_reversals.receipt_id) loop
    if fn_post_receipt_reversal_gl(r.receipt_id) is not null then n := n + 1; end if;
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
