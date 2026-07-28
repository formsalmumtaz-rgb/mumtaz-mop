-- 015_import_provenance.sql
-- Enables idempotent, traceable import of the external customer master
-- (Art. VII §5 dry-run/ingestion pipeline).
--
--   source_ref  — the import file's stable source_row_id. A unique index on
--                 (tenant_id, source_ref) is what lets the importer re-run
--                 safely: "already imported this row" vs "new" is decidable, so
--                 permanent account numbers are never re-assigned or duplicated.
--   legacy_code — the old customer system's code (001, 002, …). The owner's
--                 preferred matching anchor and an audit trail back to source.
--
-- Both nullable, additive. Touches no ledger/append-only table; no invariant
-- relaxed. account numbers (customers.code) remain system-assigned and immutable.

alter table customers add column source_ref text;
alter table customers add column legacy_code text;

create unique index customers_tenant_source_ref_key
  on customers(tenant_id, source_ref) where source_ref is not null;
