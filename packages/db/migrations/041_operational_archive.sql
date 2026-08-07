-- 041_operational_archive.sql
-- App-wide edit/archive foundation. Adds a uniform soft-archive to OPERATIONAL
-- entities: archived_at (null = active) + archived_by. Archive/restore are normal
-- audited UPDATEs — nothing is hard-deleted. Financial/append-only records
-- (invoices, receipts, credit_notes, refunds, journal_*, stock_movements,
-- service_reports, job_costs, item_purchases) are intentionally EXCLUDED: they
-- stay append-only and are corrected by reversing documents, never archived.
-- Additive, nullable columns; no behaviour change until the UI uses them.
alter table customers          add column archived_at timestamptz, add column archived_by uuid;
alter table customer_branches  add column archived_at timestamptz, add column archived_by uuid;
alter table contacts           add column archived_at timestamptz, add column archived_by uuid;
alter table contracts          add column archived_at timestamptz, add column archived_by uuid;
alter table jobs               add column archived_at timestamptz, add column archived_by uuid;
alter table items              add column archived_at timestamptz, add column archived_by uuid;
alter table vehicles           add column archived_at timestamptz, add column archived_by uuid;
alter table technicians        add column archived_at timestamptz, add column archived_by uuid;
