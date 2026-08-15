-- 088_preflight_attendance_fuelband.sql
-- Pre-flight to the agreed spec (defect sweep item 1):
--   * attendance — the team lead marks each member present with uniform/hygiene
--     flags: { "<technician_id>": {"present":bool,"uniform_ok":bool,"hygiene_ok":bool} }
--   * fuel_band — tank level as a band (0/25/50/75/100), never free entry.
--     (fuel_litres/fuel_amount stay: those are PURCHASES posted to the fuel
--     ledger, a different fact from the tank reading.)
-- Additive; same-day-correctable capture row, no invariant touched.
alter table preflight_checks add column if not exists attendance jsonb not null default '{}'::jsonb;
alter table preflight_checks add column if not exists fuel_band int
  check (fuel_band is null or fuel_band in (0, 25, 50, 75, 100));
