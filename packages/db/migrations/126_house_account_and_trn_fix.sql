-- 126_house_account_and_trn_fix.sql
-- Owner ruling, 19 Aug 2026 (BLOCKED §0F).
--
-- 1. 11387 "Al Mumtaz Bldg Clean & Pest Control" is US, sitting in our own
--    customer list. It is the HOUSE ACCOUNT — kept, because internal work is
--    still worth recording against something, but NEVER invoiced. A flag rather
--    than a deletion: the record has history, and archiving it would hide the
--    internal jobs rather than explain them.
alter table customers
  add column if not exists is_house_account boolean not null default false;

comment on column customers.is_house_account is
  'This "customer" is the business itself. Kept for recording internal work; never invoiced. Invoicing one is refused at the database, not merely discouraged in a screen.';

update customers
   set is_house_account = true,
       required_info = concat_ws('; ', nullif(required_info,''), 'NOTE: house account — our own entity, never invoice'),
       updated_at = now()
 where code = '11387'
   and tenant_id = (select id from tenants where name = 'Mumtaz Integrated Services Group');

-- Refuse at the source. A screen-level rule would be forgotten by the next screen.
create or replace function fn_no_invoice_to_house_account()
returns trigger language plpgsql as $$
begin
  if exists (select 1 from customers c
              where c.id = new.customer_id and c.is_house_account) then
    raise exception 'This is the house account (our own entity) — it cannot be invoiced';
  end if;
  return new;
end $$;
drop trigger if exists invoices_no_house_account on invoices;
create trigger invoices_no_house_account
  before insert on invoices
  for each row execute function fn_no_invoice_to_house_account();

-- 2. 11197 and 11321 carried OUR TRN, pasted into their records in the old
--    system. Invoicing them would have put our own tax registration on a tax
--    document as the BUYER's. Blanked and flagged, exactly as the import handles
--    any unknown value: blank means unknown, and the profile asks for it.
update customers
   set trn = null,
       notes = concat_ws(chr(10), nullif(notes,''),
         'TRN cleared 19 Aug 2026: the record carried the company''s own TRN (100072077900003), pasted in by the legacy system. Capture the customer''s real TRN from their VAT certificate.'),
       required_info = concat_ws('; ', nullif(required_info,''), 'ASK: TRN'),
       updated_at = now()
 where code in ('11197', '11321')
   and tenant_id = (select id from tenants where name = 'Mumtaz Integrated Services Group');
