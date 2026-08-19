-- 100_legacy_reconciliation.sql
-- "File is truth. Legacy is history." (owner ruling, 19 Aug 2026)
--
-- The master file defines the customer of record. Records created before the
-- import are historical: they keep the documents that were issued against them —
-- an invoice, a receipt and a service report are frozen at issue and are never
-- rewritten (Art. VII §2) — and they point at the file's customer so the office
-- can see the two are the same business and finish the reconciliation from the
-- console.
--
-- This is a LINK, not a move. Repointing an issued invoice or a cash receipt at a
-- different customer would rewrite a finished financial record, which is an
-- append-only violation and would need an amendment under Art. XII. Linking gives
-- the owner the same picture without touching a single issued document.
alter table customers
  add column if not exists reconciled_to_customer_id uuid references customers(id),
  add column if not exists reconciliation_note       text;

comment on column customers.reconciled_to_customer_id is
  'This legacy record is the same business as that customer of record (owner ruling 19 Aug 2026: file is truth, legacy is history). A link — no document is ever repointed.';
comment on column customers.reconciliation_note is
  'Why the link was made, and what a human still has to resolve from the console.';

create index if not exists customers_reconciled_to_idx
  on customers (tenant_id, reconciled_to_customer_id)
  where reconciled_to_customer_id is not null;

-- A record cannot be its own history, and the link is one hop only: a customer of
-- record may not itself be reconciled away.
alter table customers drop constraint if exists customers_reconciled_not_self;
alter table customers add constraint customers_reconciled_not_self
  check (reconciled_to_customer_id is null or reconciled_to_customer_id <> id);
