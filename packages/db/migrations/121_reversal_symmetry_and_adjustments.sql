-- 121_reversal_symmetry_and_adjustments.sql
--
-- 1. A BUG I INTRODUCED IN mig 115. fn_post_receipt_gl was changed to split a
--    receipt between accounts receivable (the part applied to invoices) and
--    customer advances (the unapplied part). fn_post_receipt_reversal_gl was NOT
--    changed with it, and still reinstates the FULL amount to receivable. So
--    reversing an overpayment would put money back into AR that had never been
--    in AR, and leave the advances credit stranded. Changing one side of a
--    posting pair without the other is how a ledger silently goes wrong.
--
--    The reversal now mirrors the posting exactly: whatever the receipt credited,
--    the reversal debits.
create or replace function fn_post_receipt_reversal_gl(p_receipt uuid)
returns uuid language plpgsql as $$
declare r record; e uuid; a_ar uuid; a_bank uuid; a_adv uuid;
        v_alloc numeric; v_unalloc numeric;
begin
  select * into r from receipts where id = p_receipt;
  if not found or coalesce(r.amount,0) <= 0 then return null; end if;
  if not exists (select 1 from receipt_reversals rr where rr.receipt_id = p_receipt) then return null; end if;
  if exists (select 1 from journal_entries where tenant_id=r.tenant_id and source_type='receipt_reversal' and source_id=p_receipt) then return null; end if;
  a_ar := fn_gl_account(r.tenant_id,'gl.account_code.receivable');
  a_bank := fn_gl_account(r.tenant_id,'gl.account_code.bank');
  if a_ar is null or a_bank is null then raise exception 'GL accounts not configured (bank/receivable)'; end if;

  -- mirror the original split
  select coalesce(sum(amount),0) into v_alloc from receipt_allocations where receipt_id = p_receipt;
  v_unalloc := round(r.amount - v_alloc, 2);

  insert into journal_entries(tenant_id, service_line_id, source_type, source_id, entry_date, memo)
    values (r.tenant_id, r.service_line_id, 'receipt_reversal', p_receipt, current_date,
            'Reverse receipt '||coalesce(r.receipt_number,'')) returning id into e;

  insert into journal_lines(tenant_id, journal_entry_id, account_id, debit, credit, currency, memo)
    values (r.tenant_id, e, a_bank, 0, r.amount, 'AED', 'Cash / bank out (receipt reversed)');
  if v_alloc > 0 then
    insert into journal_lines(tenant_id, journal_entry_id, account_id, debit, credit, currency, memo)
      values (r.tenant_id, e, a_ar, v_alloc, 0, 'AED', 'Reinstate accounts receivable (receipt reversed)');
  end if;
  if v_unalloc > 0 then
    a_adv := fn_gl_account(r.tenant_id,'gl.account_code.customer_advances');
    if a_adv is null then raise exception 'GL account not configured (customer advances)'; end if;
    insert into journal_lines(tenant_id, journal_entry_id, account_id, debit, credit, currency, memo)
      values (r.tenant_id, e, a_adv, v_unalloc, 0, 'AED', 'Reverse payment on account (unapplied)');
  end if;
  return e;
end $$;

-- 2. THE ADJUSTING-ENTRY PATH THE CONSTITUTION REQUIRES AND THE PLATFORM LACKED.
--    Art. V §3: "adjusting entries go through a CONTROLLED PATH: templated where
--    possible, mandatory reason, fully audit-logged, reportable as a distinct
--    class." There was no such function at all — the only way to correct the
--    ledger was a direct INSERT, which is exactly what the rule forbids.
--
--    Every operational posting still happens automatically from events and may
--    never be hand-keyed (Art. V §3 again). This is for the residue those
--    postings cannot express: a correction, an accrual, an opening balance.
create or replace function fn_post_adjusting_entry(
  p_tenant uuid, p_date date, p_reason text, p_lines jsonb, p_service_line uuid default null)
returns uuid language plpgsql as $$
declare e uuid; l jsonb; v_dr numeric := 0; v_cr numeric := 0; a uuid;
begin
  if nullif(btrim(coalesce(p_reason,'')),'') is null then
    raise exception 'An adjusting entry requires a reason';
  end if;
  if jsonb_array_length(coalesce(p_lines,'[]'::jsonb)) < 2 then
    raise exception 'An adjusting entry needs at least two lines';
  end if;
  for l in select * from jsonb_array_elements(p_lines) loop
    v_dr := v_dr + coalesce((l->>'debit')::numeric, 0);
    v_cr := v_cr + coalesce((l->>'credit')::numeric, 0);
  end loop;
  if round(v_dr,2) <> round(v_cr,2) then
    raise exception 'Adjusting entry does not balance: debits % vs credits %', v_dr, v_cr;
  end if;

  insert into journal_entries(tenant_id, service_line_id, source_type, source_id, entry_date, memo)
    values (p_tenant, p_service_line, 'adjustment', null, coalesce(p_date, current_date), btrim(p_reason))
    returning id into e;

  for l in select * from jsonb_array_elements(p_lines) loop
    select id into a from accounts where tenant_id = p_tenant and code = (l->>'account_code');
    if a is null then raise exception 'Unknown account code %', l->>'account_code'; end if;
    insert into journal_lines(tenant_id, journal_entry_id, account_id, debit, credit, currency, memo)
      values (p_tenant, e, a, coalesce((l->>'debit')::numeric,0), coalesce((l->>'credit')::numeric,0),
              coalesce(l->>'currency','AED'), l->>'memo');
  end loop;

  insert into audit_log(tenant_id, actor_id, table_name, row_id, action, new_value, note)
    values (p_tenant, app_current_actor(), 'journal_entries', e::text, 'insert',
            jsonb_build_object('lines', p_lines, 'total', v_dr), 'adjusting entry: '||btrim(p_reason));
  return e;
end $$;

comment on function fn_post_adjusting_entry(uuid, date, text, jsonb, uuid) is
  'Art. V §3 controlled path for adjusting entries: mandatory reason, must balance, audit-logged, and stamped source_type=''adjustment'' so adjustments are reportable as a distinct class. Operational postings still come from events and are never hand-keyed.';
