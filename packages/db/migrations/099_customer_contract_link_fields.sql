-- 099_customer_contract_link_fields.sql
-- Declare the two legacy contract-link attributes the customer import carries.
--
-- The master file records, per customer, the contract number(s) and serial
-- number(s) that customer had in the OLD system (CONTRACT_NUMBERS,
-- CONTRACT_SL_NOS). None of those contracts exist in this platform yet, so the
-- link cannot be made at import time — the owner resolves it from the console as
-- the contracts surface in daily use (owner ruling, 19 Aug: import the customers
-- now, leave the contracts unlinked, do not hold the import for reconciliation).
--
-- Keeping the reference means the link is still makeable later. Dropping it would
-- lose the only thread back to the legacy contract.
--
-- These are declared as field_definitions rather than hardcoded, because
-- Art. XVIII makes per-service capability data, not code — and because the
-- attributes trigger (validate_entity_attributes) refuses any undeclared key.
-- That trigger is what caught this: the commit failed loudly instead of writing
-- silent junk into the attributes blob.
insert into field_definitions
  (tenant_id, service_line_id, entity_type, field_key, label, data_type, is_required, is_assumed)
select t.id, null, 'customer', d.field_key, d.label, 'text', false, false
  from tenants t
 cross join (values
   ('contract_numbers', 'Legacy contract number(s)'),
   ('contract_sl_nos',  'Legacy contract serial number(s)')
 ) as d(field_key, label)
on conflict (tenant_id, coalesce(service_line_id, '00000000-0000-0000-0000-000000000000'::uuid),
             coalesce(facility_type_id, '00000000-0000-0000-0000-000000000000'::uuid),
             entity_type, field_key)
do nothing;
