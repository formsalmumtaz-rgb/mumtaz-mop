-- 094_staging_extended_customer.sql
-- Run 8: staging carries every column the extended customer record accepts, so
-- the dry-run report can show what WOULD be written for each of them and the
-- commit is a straight copy — no field is invented between check and commit.
alter table staging_customers
  add column if not exists customer_group        text,
  add column if not exists industry_category     text,
  add column if not exists municipality_category text,
  add column if not exists place_of_supply       text,
  add column if not exists district              text,
  add column if not exists contact_person        text,
  add column if not exists designation           text,
  add column if not exists email                 text,
  add column if not exists phone                 text,
  add column if not exists mobile                text,
  add column if not exists whatsapp              text,
  add column if not exists tl_expiry             text,
  add column if not exists preferred_shift       text,
  add column if not exists preferred_language    text,
  add column if not exists payment_terms         text,
  add column if not exists billing_frequency     text,
  add column if not exists referred_by           text,
  add column if not exists access_notes          text,
  add column if not exists latitude              text,
  add column if not exists longitude             text,
  add column if not exists location_source       text,
  add column if not exists location_status       text,
  add column if not exists required_info         text,
  add column if not exists notes                 text,
  add column if not exists contract_numbers      text,
  add column if not exists contract_sl_nos       text;
