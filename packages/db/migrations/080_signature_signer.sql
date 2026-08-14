-- 080_signature_signer.sql
-- P0-2 / walkthrough item 20: a signature must say WHOSE it is. The field app now
-- captures the customer representative and the technician separately; the stored
-- row records which role signed. Existing rows default to 'customer' — every
-- signature captured so far was the client-confirmation pad.
alter table job_signatures add column if not exists signer text not null default 'customer'
  check (signer in ('customer','technician'));
