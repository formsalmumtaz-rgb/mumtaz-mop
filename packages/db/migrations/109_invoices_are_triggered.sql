-- 109_invoices_are_triggered.sql
-- "Invoices are TRIGGERED, never auto-generated." (CLAUDE.md standing rule.)
--
-- fn_generate_contract_invoice ended by issuing the invoice and posting it to the
-- general ledger, so the daily /api/billing/run cron did not PREPARE an invoice --
-- it ISSUED one: numbered in the AMTX series, frozen, and in the books, with no
-- human having agreed to send it. Recurring billing is opt-in per contract
-- (contracts.auto_generate_invoice, default false), which limited the blast
-- radius but did not make it right: two live contracts already have it on.
--
-- The deterministic part is untouched. Period arithmetic, the one-per-period
-- guard, the failure capture and the idempotency all still run. Only the issuing
-- stops: the invoice is left prepared, and the office issues it from the invoices
-- screen, which numbers and posts it through the very same two functions.

CREATE OR REPLACE FUNCTION public.fn_generate_contract_invoice(p_contract uuid, p_period date)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
declare ct record; v_inv uuid; v_rate numeric; v_def_rate numeric;
begin
  select * into ct from contracts where id = p_contract for update;
  if not found or ct.lifecycle_status <> 'active' then return null; end if;
  if not coalesce(ct.auto_generate_invoice, false) then return null; end if;
  if ct.billing_frequency is null or ct.billing_frequency = 'per_visit' then return null; end if;
  if ct.start_date is not null and p_period < ct.start_date then return null; end if;
  if ct.end_date is not null and p_period > ct.end_date then return null; end if;
  if exists (select 1 from invoices where tenant_id=ct.tenant_id and contract_id=p_contract and billing_period=p_period and document_type='tax_invoice') then
    return null;
  end if;

  v_def_rate := coalesce((select value::text::numeric from settings where tenant_id=ct.tenant_id and service_line_id is null and key='ar.default_vat_rate'), 5);
  v_rate := case when ct.vat_treatment = 'standard' then v_def_rate else 0 end;

  insert into invoices(tenant_id, service_line_id, document_type, customer_id, contract_id, status, vat_treatment, billing_period,
                       buyer_legal_name, buyer_trn, buyer_address, buyer_customer_type, currency, subtotal, vat_total, total)
    select ct.tenant_id, ct.service_line_id, 'tax_invoice', ct.customer_id, ct.id, 'draft', ct.vat_treatment, p_period,
           coalesce(cu.legal_name, cu.trade_name), cu.trn, cu.emirate, cu.customer_type, coalesce(ct.currency,'AED'), 0, 0, 0
      from customers cu where cu.id = ct.customer_id
    returning id into v_inv;

  insert into invoice_lines(tenant_id, invoice_id, line_no, description, service_type_id, quantity, unit_price, currency, vat_rate, vat_amount, line_total)
    select ct.tenant_id, v_inv, row_number() over (order by cs.created_at), coalesce(st.name,'Contract service'),
           cs.service_type_id, cs.quantity, coalesce(cs.unit_price,0), coalesce(cs.currency,'AED'),
           v_rate, round(coalesce(cs.unit_price,0)*cs.quantity * v_rate / 100, 2), round(coalesce(cs.unit_price,0)*cs.quantity, 2)
      from contract_services cs left join service_types st on st.id = cs.service_type_id
     where cs.contract_id = ct.id and cs.tenant_id = ct.tenant_id and cs.is_active;

  if not exists (select 1 from invoice_lines where invoice_id = v_inv) and coalesce(ct.contract_value,0) > 0 then
    insert into invoice_lines(tenant_id, invoice_id, line_no, description, quantity, unit_price, currency, vat_rate, vat_amount, line_total)
      values (ct.tenant_id, v_inv, 1, 'Contract charge', 1, ct.contract_value, coalesce(ct.currency,'AED'),
              v_rate, round(ct.contract_value*v_rate/100,2), round(ct.contract_value,2));
  end if;

  if not exists (select 1 from invoice_lines where invoice_id = v_inv) then
    delete from invoices where id = v_inv;
    return null;
  end if;

  update invoices i set subtotal=t.s, vat_total=t.v, total=t.s+t.v
    from (select coalesce(sum(line_total),0) s, coalesce(sum(vat_amount),0) v from invoice_lines where invoice_id=v_inv) t
   where i.id = v_inv;

  -- INVOICES ARE TRIGGERED, NEVER AUTO-GENERATED (CLAUDE.md standing rule).
  -- The two calls that ran here issued the invoice and posted it to the GL, so the
  -- nightly cron produced a NUMBERED, GL-POSTED, legally real invoice that no
  -- human had agreed to send. The period arithmetic, the one-invoice-per-period
  -- guard and the idempotency all still run exactly as before -- what stops is the
  -- issuing. The invoice is left PREPARED for the office to review and issue,
  -- which numbers it and posts it to the GL through those same two functions.
  return v_inv;
end $function$
