-- 123_corporate_tax_basis.sql
-- §3.11 — "corporate tax (basic): research current UAE rules and build the module
-- to RECORD tax-relevant figures and register expenses correctly. FILING STAYS
-- WITH EXPERTS. Cite what the rules are based on; flag ASSUMED where guidance is
-- ambiguous."
--
-- WHAT THIS IS NOT. It does not compute a tax return, does not decide what is
-- deductible, and must never be filed from. It arranges figures the platform
-- already holds so an accountant has them in one place.
--
-- EVERY RATE AND THRESHOLD BELOW IS SEEDED ASSUMED, deliberately, and that is not
-- false modesty. Tax law changes, my knowledge of it has a cutoff, and a figure
-- that is merely probably right is worse in a tax module than a figure that is
-- visibly unconfirmed. They are editable from settings and each carries the
-- instrument it came from so the accountant can check it in one step.
insert into settings (tenant_id, service_line_id, key, value, is_assumed, description)
select t.id, null, s.key, s.value, true, s.note
  from tenants t
 cross join (values
   ('tax.ct_rate_standard', '9'::jsonb,
    'ASSUMED 9%. Basis: UAE Federal Decree-Law No. 47 of 2022 on the Taxation of Corporations and Businesses, the headline corporate tax rate on taxable income above the threshold. CONFIRM WITH YOUR TAX ADVISER before relying on it.'),
   ('tax.ct_threshold_aed', '375000'::jsonb,
    'ASSUMED AED 375,000. Basis: Federal Decree-Law No. 47 of 2022 — taxable income up to this amount is taxed at 0%. CONFIRM WITH YOUR TAX ADVISER.'),
   ('tax.small_business_relief_revenue_aed', '3000000'::jsonb,
    'ASSUMED AED 3,000,000. Basis: Ministerial Decision No. 73 of 2023, Small Business Relief — a business at or below this revenue may elect to be treated as having no taxable income for the period. Availability is time-limited and conditional. CONFIRM WITH YOUR TAX ADVISER; do not assume it applies.'),
   ('tax.ct_registered', 'false'::jsonb,
    'Whether the business is registered for UAE corporate tax. Nobody has told the platform; set it once you know. Registration is a legal obligation independent of whether tax is payable.')
 ) as s(key, value, note)
 where not exists (select 1 from settings x where x.tenant_id = t.id
                     and x.service_line_id is null and x.key = s.key);

-- Which expense categories the business treats as deductible. NOT a tax ruling:
-- a place to record the accountant's answer so the same treatment is applied
-- consistently, and so anything undecided is visible rather than assumed either
-- way. NULL means "nobody has said" and is reported separately from "no".
alter table expense_categories
  add column if not exists ct_deductible boolean,
  add column if not exists ct_note text;

comment on column expense_categories.ct_deductible is
  'Does the accountant treat this category as deductible for UAE corporate tax? NULL = undecided, and reported as undecided rather than guessed either way. Not a tax ruling by the platform.';
