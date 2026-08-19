-- 124_seller_identity_and_ct_registration.sql
--
-- 1. THE COMPANY'S OWN TRN — owner-supplied, 19 Aug 2026. Not assumed.
--
-- 2. EVERY INVOICE EVER ISSUED CARRIED A NULL seller_trn. The PINT AE seller
--    columns existed on invoices and NOTHING populated them, so not one invoice
--    showed the supplier's tax registration — which a UAE tax invoice must.
--    fn_issue_invoice now freezes the seller identity at issue, exactly as it
--    already freezes the buyer's.
insert into settings (tenant_id, service_line_id, key, value, is_assumed, description)
select t.id, null, s.key, s.value, false, s.note
  from tenants t
 cross join (values
   ('org.trn', '"100072077900003"'::jsonb,
    'The company''s own tax registration number. Owner-supplied 19 Aug 2026. Frozen onto every invoice at issue.'),
   ('org.legal_name', '"AL MUMTAZ BLDG CLEAN & PEST CONTROL"'::jsonb,
    'Fallback seller name when the customer''s emirate has no specific contracting entity. The per-emirate names in agreement.contracting_entities take precedence.')
 ) as s(key, value, note)
 where not exists (select 1 from settings x where x.tenant_id = t.id
                     and x.service_line_id is null and x.key = s.key);

-- Registration confirmed by the owner; the rate and thresholds stay unconfirmed.
update settings
   set value = 'true'::jsonb, is_assumed = false, confirmed_at = now(), updated_at = now(),
       description = 'The business IS registered for UAE corporate tax. Owner-confirmed 19 Aug 2026.'
 where key = 'tax.ct_registered';
CREATE OR REPLACE FUNCTION public.fn_issue_invoice(p_invoice uuid)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
declare
  inv record; v_series text; v_number text; v_terms int; v_require_appr boolean;
begin
  select * into inv from invoices where id = p_invoice for update;
  if not found then raise exception 'Invoice not found'; end if;
  if inv.status not in ('draft','queued') then
    raise exception 'Only draft/queued invoices can be issued (status=%)', inv.status;
  end if;

  if inv.job_id is not null then
    v_require_appr := coalesce((select value::text::boolean from settings
      where tenant_id=inv.tenant_id and service_line_id is null and key='ar.require_sr_approval'), false);
    if not fn_job_service_report_ok(inv.tenant_id, inv.job_id, v_require_appr) then
      raise exception 'A completed% service report is required before this invoice can be issued',
        case when v_require_appr then ', approved' else '' end;
    end if;
  end if;

  if inv.invoice_number is null then
    v_series := case when inv.contract_id is not null then 'AMTX' else 'AMTX_OW' end;
    v_number := fn_next_document_number(inv.tenant_id, v_series);
  else
    v_number := inv.invoice_number;
  end if;

  v_terms := coalesce((select value::text::int from settings
    where tenant_id=inv.tenant_id and service_line_id is null and key='ar.default_payment_terms_days'), 30);

  -- SELLER IDENTITY IS FROZEN AT ISSUE, exactly as the buyer's already is.
  -- Every invoice ever issued carried a NULL seller_trn: the PINT AE columns
  -- existed and nothing populated them, so no invoice showed the supplier's tax
  -- registration. A UAE tax invoice must. The legal name follows the contracting
  -- entity for the customer's emirate (mig 092) — a Dubai job is billed by the
  -- Dubai branch — while the TRN is the company's own.
  update invoices i
     set invoice_number = v_number,
         status         = 'issued',
         issue_date     = coalesce(issue_date, current_date),
         tax_point_date = coalesce(tax_point_date, current_date),
         due_date       = coalesce(due_date, current_date + (v_terms || ' days')::interval),
         seller_trn     = coalesce(i.seller_trn,
                            (select (value #>> '{}') from settings
                              where tenant_id = i.tenant_id and service_line_id is null and key = 'org.trn')),
         seller_legal_name = coalesce(i.seller_legal_name,
                            (select e.value->>'legal_name_en' from settings s
                               cross join lateral (select s.value -> coalesce(i.buyer_place_of_supply, 'Sharjah') as value) e
                              where s.tenant_id = i.tenant_id and s.service_line_id is null
                                and s.key = 'agreement.contracting_entities'),
                            (select (value #>> '{}') from settings
                              where tenant_id = i.tenant_id and service_line_id is null and key = 'org.legal_name'))
   where i.id = p_invoice;

  return v_number;
end $function$
;
