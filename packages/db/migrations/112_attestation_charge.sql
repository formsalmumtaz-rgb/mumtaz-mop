-- 112_attestation_charge.sql
-- §3.6 — "Sharjah F&B contracts: AED 250 + VAT attestation charge added to the
-- first invoice automatically — rate EDITABLE, and REMOVABLE (not forced)."
--
-- Three separate things, deliberately:
--   * the RATE is a setting, so the office changes it without a deploy;
--   * the CONTRACT may override the rate (contracts.attestation_fee already
--     existed and was never used by billing);
--   * the CONTRACT may WAIVE it entirely — which is not the same as a rate of
--     zero, because "we agreed not to charge this customer" and "the fee happens
--     to be nil" are different facts and read differently a year later.
alter table contracts
  add column if not exists attestation_fee_waived boolean not null default false;

comment on column contracts.attestation_fee_waived is
  'The office removed the attestation charge for this contract. Distinct from a zero rate: this records a decision, not an amount.';

insert into settings (tenant_id, service_line_id, key, value, is_assumed, description)
select t.id, null, 'billing.attestation_fee', '250'::jsonb, false,
       'AED 250 + VAT, added once to the FIRST invoice of a Sharjah food-and-beverage contract (owner-stated). Editable here; overridable per contract; removable per contract via attestation_fee_waived.'
  from tenants t
 where not exists (select 1 from settings x where x.tenant_id = t.id
                     and x.service_line_id is null and x.key = 'billing.attestation_fee');

-- Add the charge to an invoice, once, if it is owed. Returns the amount added
-- (0 when it is not owed), so the caller can log what happened.
--
-- Deliberately idempotent and self-limiting: it does nothing if the contract
-- already has any OTHER invoice (this is the first-invoice charge), and nothing
-- if this invoice already carries the line.
create or replace function fn_apply_attestation_charge(p_invoice uuid)
returns numeric language plpgsql as $$
declare v record; v_fee numeric; v_vat numeric; v_rate numeric; v_next int;
begin
  select i.id, i.tenant_id, i.contract_id, i.customer_id, i.currency,
         ct.attestation_fee, ct.attestation_fee_waived,
         cu.emirate, mc.code as municipality_code
    into v
    from invoices i
    join contracts ct on ct.id = i.contract_id
    join customers cu on cu.id = i.customer_id
    left join municipality_categories mc on mc.id = cu.municipality_category_id
   where i.id = p_invoice;
  if not found or v.contract_id is null then return 0; end if;

  -- Sharjah food-and-beverage only. Anywhere else the municipality does not
  -- require the attestation, so charging for it would be inventing a fee.
  if coalesce(v.emirate,'') <> 'Sharjah' or coalesce(v.municipality_code,'') <> 'foodstuffs' then
    return 0;
  end if;
  if v.attestation_fee_waived then return 0; end if;

  -- first invoice of this contract only
  if exists (select 1 from invoices x
              where x.contract_id = v.contract_id and x.id <> v.id
                and x.status <> 'cancelled') then
    return 0;
  end if;
  if exists (select 1 from invoice_lines l
              where l.invoice_id = v.id and l.description like 'Municipality attestation%') then
    return 0;
  end if;

  v_fee := coalesce(v.attestation_fee,
                    (select (value #>> '{}')::numeric from settings
                      where tenant_id = v.tenant_id and service_line_id is null
                        and key = 'billing.attestation_fee'), 0);
  if v_fee <= 0 then return 0; end if;

  v_rate := 5;  -- UAE standard rate, same basis the rest of the invoice uses
  v_vat  := round(v_fee * v_rate / 100, 2);
  select coalesce(max(line_no),0) + 1 into v_next from invoice_lines where invoice_id = v.id;

  insert into invoice_lines (tenant_id, invoice_id, line_no, description, quantity, unit_price,
                             currency, vat_rate, vat_amount, line_total, snapshot)
  values (v.tenant_id, v.id, v_next, 'Municipality attestation (Sharjah F&B) — first invoice',
          1, v_fee, coalesce(v.currency,'AED'), v_rate, v_vat, v_fee + v_vat,
          jsonb_build_object('source','attestation','rate_from',
            case when v.attestation_fee is not null then 'contract' else 'settings' end));

  update invoices i
     set subtotal = t.s, vat_total = t.v, total = t.s + t.v
    from (select coalesce(sum(line_total),0) - coalesce(sum(vat_amount),0) s,
                 coalesce(sum(vat_amount),0) v from invoice_lines where invoice_id = v.id) t
   where i.id = v.id;

  return v_fee;
end $$;

comment on function fn_apply_attestation_charge(uuid) is
  'Adds the Sharjah F&B attestation charge to a contract''s FIRST invoice. Idempotent; returns the amount added, 0 when not owed.';

-- Hook it into recurring generation.
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
  -- §3.6: the Sharjah F&B attestation charge rides on the FIRST invoice of a
  -- contract. The function decides whether it is owed; it is a no-op otherwise.
  perform fn_apply_attestation_charge(v_inv);

  return v_inv;
end $function$

