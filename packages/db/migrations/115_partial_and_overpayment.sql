-- 115_partial_and_overpayment.sql
-- §3.6 — "the technician can generate the invoice from the app ... amount
-- ADJUSTABLE, PARTIAL PAYMENT OR OVERPAYMENT ACCEPTED (record what is actually
-- received)."
--
-- Two rules in fn_record_receipt made that impossible:
--
--   1. `allocations must EQUAL the receipt amount`. An overpayment could not be
--      recorded at all: the excess could not be allocated (it would exceed the
--      invoice balance) and could not be left over (allocations had to equal the
--      amount). A deadlock, so the office's only options were to lie about the
--      amount or refuse the customer's money.
--   2. `an ad-hoc invoice must be paid in full`. A technician collecting at the
--      door takes what the customer actually hands over. A short payment is a
--      fact to record, not an error to refuse.
--
-- Both are relaxed. Neither is a structural invariant: debits=credits still holds
-- by constraint, receipts stay append-only, and allocations still may not exceed
-- either the receipt or the invoice balance -- you can under-apply money, never
-- conjure it.
--
-- THE GL CONSEQUENCE, which is the part that actually matters. fn_post_receipt_gl
-- credited the WHOLE receipt to accounts receivable. With an overpayment that
-- understates what the customer owes, and against a customer with no open invoice
-- it drives AR negative -- a receivable balance that is really a liability. The
-- posting now splits: the applied part settles AR, the unapplied part credits a
-- customer-advances liability, because money paid ahead of an invoice is owed
-- back until it is applied.

-- The advances account. The chart of accounts is ASSUMED (DECISIONS §1.4) and
-- this follows the same pattern -- editable, flagged, confirmed by the owner.
insert into accounts (tenant_id, code, name, account_type, is_assumed, assumed_note)
select t.id, '2250', 'Customer Advances / Payments on Account', 'liability', true,
       'ASSUMED code. Holds money a customer has paid ahead of an invoice; cleared as it is applied.'
  from tenants t
 where not exists (select 1 from accounts a where a.tenant_id = t.id and a.code = '2250');

insert into settings (tenant_id, service_line_id, key, value, is_assumed, description)
select t.id, null, 'gl.account_code.customer_advances', '"2250"'::jsonb, true,
       'ASSUMED: account for money received ahead of an invoice (overpayment / payment on account).'
  from tenants t
 where not exists (select 1 from settings x where x.tenant_id = t.id
                     and x.service_line_id is null and x.key = 'gl.account_code.customer_advances');

CREATE OR REPLACE FUNCTION public.fn_record_receipt(p_tenant uuid, p_customer uuid, p_date date, p_method text, p_amount numeric, p_reference text, p_others_note text, p_allocations jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
declare
  v_receipt uuid; v_num text; v_sum numeric; a jsonb;
  v_inv record; v_amt numeric;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'Receipt amount must be > 0'; end if;
  if p_method = 'other' and nullif(trim(coalesce(p_others_note,'')),'') is null then
    raise exception 'A note is required when the payment method is "other"'; end if;

  select coalesce(sum((x->>'amount')::numeric), 0) into v_sum from jsonb_array_elements(coalesce(p_allocations,'[]'::jsonb)) x;
  -- §3.6: RECORD WHAT WAS ACTUALLY RECEIVED. Allocations may be LESS than the
  -- amount -- the customer paid more than the invoices in front of them, and the
  -- excess sits unallocated as money on account. They may never be MORE, because
  -- that would be allocating money nobody handed over.
  if round(v_sum, 2) > round(p_amount, 2) then
    raise exception 'Allocations (%) exceed the receipt amount (%) -- cannot allocate money that was not received', v_sum, p_amount; end if;

  v_num := fn_next_document_number(p_tenant, 'RCP');
  insert into receipts (tenant_id, customer_id, receipt_number, receipt_date, method, amount, reference, others_note)
    values (p_tenant, p_customer, v_num, coalesce(p_date, current_date), p_method, p_amount, nullif(trim(coalesce(p_reference,'')),''), nullif(trim(coalesce(p_others_note,'')),''))
    returning id into v_receipt;

  for a in select * from jsonb_array_elements(coalesce(p_allocations,'[]'::jsonb)) loop
    v_amt := (a->>'amount')::numeric;
    if v_amt <= 0 then raise exception 'Allocation amount must be > 0'; end if;
    select i.id, i.contract_id, i.status, i.customer_id, i.total,
           i.total - coalesce((select sum(amount) from receipt_allocations ra where ra.invoice_id = i.id),0) as balance
      into v_inv
      from invoices i where i.id = (a->>'invoice_id')::uuid and i.tenant_id = p_tenant for update;
    if not found then raise exception 'Invoice % not found', a->>'invoice_id'; end if;
    if v_inv.status not in ('issued','queued') then raise exception 'Invoice % is not open for payment (status=%)', v_inv.id, v_inv.status; end if;
    if p_customer is not null and v_inv.customer_id is distinct from p_customer then
      raise exception 'Invoice % belongs to a different customer', v_inv.id; end if;
    if v_amt > v_inv.balance + 0.005 then raise exception 'Allocation % exceeds invoice % balance %', v_amt, v_inv.id, v_inv.balance; end if;
    -- An ad-hoc invoice used to be all-or-nothing. A technician collecting at the
    -- door takes what the customer actually hands over, so a short payment is a
    -- fact to record, not an error to refuse. The shortfall stays as balance and
    -- shows in AR exactly like any other unpaid amount (§3.6).

    insert into receipt_allocations (tenant_id, receipt_id, invoice_id, amount)
      values (p_tenant, v_receipt, v_inv.id, v_amt);

    if round(v_inv.balance - v_amt, 2) <= 0 then
      update invoices set status = 'paid' where id = v_inv.id;
    end if;
  end loop;

  return v_receipt;
end $function$;


CREATE OR REPLACE FUNCTION public.fn_post_receipt_gl(p_receipt uuid)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
declare r record; e uuid; a_ar uuid; a_bank uuid; a_adv uuid; v_alloc numeric; v_unalloc numeric;
begin
  select * into r from receipts where id = p_receipt;
  if not found or coalesce(r.amount,0) <= 0 then return null; end if;
  if exists (select 1 from journal_entries where tenant_id=r.tenant_id and source_type='receipt' and source_id=p_receipt) then return null; end if;
  a_ar := fn_gl_account(r.tenant_id,'gl.account_code.receivable');
  a_bank := fn_gl_account(r.tenant_id,'gl.account_code.bank');
  if a_ar is null or a_bank is null then raise exception 'GL accounts not configured (bank/receivable)'; end if;
  insert into journal_entries(tenant_id, service_line_id, source_type, source_id, entry_date, memo)
    values (r.tenant_id, r.service_line_id, 'receipt', p_receipt, coalesce(r.receipt_date, current_date), 'Receipt '||coalesce(r.receipt_number,'')) returning id into e;
  -- Only the part of the receipt actually applied to invoices settles AR. Any
  -- excess is money the customer has paid ahead of an invoice: crediting it to AR
  -- would understate what they still owe, and on a customer with no open invoice
  -- would drive AR negative. It is a liability until it is applied.
  select coalesce(sum(amount),0) into v_alloc from receipt_allocations where receipt_id = p_receipt;
  v_unalloc := round(r.amount - v_alloc, 2);
  insert into journal_lines(tenant_id, journal_entry_id, account_id, debit, credit, currency, memo)
    values (r.tenant_id, e, a_bank, r.amount, 0, 'AED', 'Cash / bank');
  if v_alloc > 0 then
    insert into journal_lines(tenant_id, journal_entry_id, account_id, debit, credit, currency, memo)
      values (r.tenant_id, e, a_ar, 0, v_alloc, 'AED', 'Settle accounts receivable');
  end if;
  if v_unalloc > 0 then
    a_adv := fn_gl_account(r.tenant_id,'gl.account_code.customer_advances');
    if a_adv is null then raise exception 'GL account not configured (customer advances) -- an overpayment cannot be posted without it'; end if;
    insert into journal_lines(tenant_id, journal_entry_id, account_id, debit, credit, currency, memo)
      values (r.tenant_id, e, a_adv, 0, v_unalloc, 'AED', 'Payment on account (unapplied)');
  end if;
  return e;
end $function$;
