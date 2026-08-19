-- 125_seller_is_always_al_mumtaz.sql
-- CORRECTING mig 124, owner ruling 19 Aug 2026.
--
-- I made fn_issue_invoice pick the seller's legal name from
-- agreement.contracting_entities, keyed by the buyer's emirate. That was wrong,
-- and the setting's own name says so — mig 092 introduced it for the AGREEMENT:
-- "a Sharjah pest-control agreement is signed by AL MUMTAZ BLDG CLEAN & PEST
-- CONTROL; a Dubai one by WADI AL NSOOR BUILDING CLEANING, a branch of Al
-- Mumtaz." The contracting entity varies on ONE document, the pest-control
-- agreement, and nowhere else.
--
-- The consequence of my version: a Dubai customer's INVOICE would have been
-- issued by Wadi Al Nsoor while that same customer's AGREEMENT named the same
-- entity correctly — two documents disagreeing about who the supplier is, on a
-- tax invoice. Nothing had been issued under it, so nothing is misstated.
--
-- AL MUMTAZ BLDG CLEAN & PEST CONTROL is the billing entity for every invoice,
-- receipt, credit note, statement and quotation, in every emirate and division.
insert into settings (tenant_id, service_line_id, key, value, is_assumed, description)
select t.id, null, 'org.trade_licence', '"546486"'::jsonb, false,
       'Trade licence of the billing entity, AL MUMTAZ BLDG CLEAN & PEST CONTROL. Owner-confirmed 19 Aug 2026. Appears on financial documents; the Dubai branch licence 996625 belongs to the AGREEMENT only.'
  from tenants t
 where not exists (select 1 from settings x where x.tenant_id = t.id
                     and x.service_line_id is null and x.key = 'org.trade_licence');

update settings
   set description = 'Legal name of the billing entity for EVERY financial document, in every emirate. Per-emirate contracting entities apply to the pest-control AGREEMENT only (agreement.contracting_entities, mig 092) — never to invoices.'
 where key = 'org.legal_name';
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
  --
  -- The billing entity is AL MUMTAZ BLDG CLEAN & PEST CONTROL for EVERY invoice,
  -- in every emirate and every division. There is no per-emirate switching on any
  -- financial document.
  --
  -- I got this wrong in mig 124 by reading agreement.contracting_entities here.
  -- That setting is named for its scope and mig 092 states it: the contracting
  -- entity varies by emirate on the AGREEMENT — a Dubai pest-control agreement is
  -- signed by Wadi Al Nsoor, a branch of Al Mumtaz. That is the ONLY document it
  -- touches. Billing a Dubai customer as Wadi Al Nsoor would have put the wrong
  -- legal person on a tax invoice while the same customer's agreement was
  -- correct — two documents disagreeing about who the supplier is.
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
                            (select (value #>> '{}') from settings
                              where tenant_id = i.tenant_id and service_line_id is null and key = 'org.legal_name'))
   where i.id = p_invoice;

  return v_number;
end $function$
;
