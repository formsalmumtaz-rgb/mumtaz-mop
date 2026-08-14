-- 079_quotation_content.sql
-- P0-4: the quotation PDF was generic — no introduction, no scope-of-work prose,
-- no terms and conditions, no signatory. That boilerplate is company content, not
-- something entered per quotation (Art. IV "data entered once") — it belongs in
-- settings, scoped per service line, exactly like every other configurable value
-- in this system (cost.*, compliance.*). Seeded ASSUMED, editable without a
-- deploy, visibly flagged until confirmed (Art. X §4).
--
-- Seeded ONLY for pest_control: the docs/reference sample (a real, previously-used
-- Mumtaz quotation) is the source for that content. Cleaning and facilities have
-- no equivalent source yet — their quotations simply omit these sections rather
-- than invent content for a division we have nothing sourced for (never print a
-- guessed paragraph as if it were real).
--
-- The legal/trade-licence/offices block is NOT duplicated here — it already comes
-- from document_brand_org via the shared brandChrome footer (Art. XVIII, one
-- branding path). This migration only adds the parts a quotation body needs that
-- brandChrome doesn't carry: intro, scope, terms, signatory.

do $$
declare v_t uuid; v_pest uuid;
begin
  select id into v_t from tenants where name = 'Mumtaz Integrated Services Group';
  select id into v_pest from service_lines where tenant_id = v_t and code = 'pest_control';

  insert into settings (tenant_id, service_line_id, key, value, description, is_assumed)
  values
    (v_t, v_pest, 'quotation.salutation', '"Dear Sir,"'::jsonb,
     'Opening salutation on the quotation letter.', true),

    (v_t, v_pest, 'quotation.intro_paragraph',
     to_jsonb('With reference to your enquiry regarding pest control treatment at your premises, we are pleased to submit our most competitive rate together with the scope, terms and conditions detailed below. Serving the UAE since 2006 and municipality approved in Dubai, Sharjah and Abu Dhabi, all our treatments are carried out by trained, certified technicians using approved products under ISO-certified management systems.'::text),
     'Opening paragraph of the quotation letter, before the scope of work.', true),

    (v_t, v_pest, 'quotation.scope_items',
     '["Extermination of all common crawling and rodent pests — cockroaches, ants, spiders and rats.",
       "Odourless, non-staining, municipality-approved pesticides, safe for occupied premises.",
       "Gel baiting and residual spray treatment of harbourage points, service voids, skirtings and entry paths.",
       "Rodent monitoring and baiting at identified activity points, where applicable.",
       "Site inspection report with recommended preventive housekeeping measures.",
       "Treatment scheduled to minimise disruption to your operations."]'::jsonb,
     'Scope-of-work bullet list rendered under the pricing table heading.', true),

    (v_t, v_pest, 'quotation.terms',
     '["Payment is due upon completion of each service visit, or as mutually agreed in writing.",
       "Service appointments will be scheduled by mutual agreement, subject to a minimum of 48 hours advance notice.",
       "The client shall provide access to all areas to be treated and clear food items, utensils and sensitive equipment beforehand.",
       "Treatments comply with UAE municipality regulations and the HSE requirements of the premises.",
       "This quotation is valid for the period stated above from the date of issue.",
       "All rates quoted are in United Arab Emirates Dirhams (AED)."]'::jsonb,
     'Terms and conditions numbered list.', true),

    (v_t, v_pest, 'quotation.signatory_name', to_jsonb('Sahad Saleem'::text),
     'Name printed in the "For [company]" signature block.', true),
    (v_t, v_pest, 'quotation.signatory_title', to_jsonb('Business Development Manager'::text),
     'Title printed under the signatory name.', true)
  on conflict (tenant_id, service_line_id, key) do nothing;
end $$;
