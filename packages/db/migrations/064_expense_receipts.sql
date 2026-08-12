-- 064_expense_receipts.sql
-- BLOCKED A9 (receipt-link half): link a field expense claim to its receipt photo.
--
-- Today a field expense posts with no dedicated receipt link — the photo rides along
-- as a job photo (job_photos, mig K4) with no association to the specific claim. This
-- adds expense_receipts (expense ↔ job_photo), so an approver sees exactly which photo
-- backs which claim.
--
-- Note the OTHER half of A9 — the expense *category* — already works end-to-end on the
-- backend: expense.recorded carries category_id and services/worker/src/fieldfinance.ts
-- inserts it (expenses.category_id). What remains for categories is only the field-app
-- picker + syncing expense_categories to the device (disposable UI, device-verified).
--
-- Ten-year-grade schema now, disposable UI later (Two-Speed Rule). tenant_id + RLS +
-- grant to mop_app per baseline. Not a transaction record; links may be corrected.

create table if not exists expense_receipts (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id),
  expense_id  uuid not null references expenses(id),
  photo_id    uuid not null references job_photos(id),
  created_at  timestamptz not null default now(), created_by uuid,
  unique (tenant_id, expense_id, photo_id)
);
create index if not exists expense_receipts_expense_idx on expense_receipts (tenant_id, expense_id);
alter table expense_receipts enable row level security;
create policy tenant_isolation on expense_receipts
  using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
grant select, insert, delete on expense_receipts to mop_app;
