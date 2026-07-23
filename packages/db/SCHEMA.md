# MOP database — schema doctrine

Governed by `CONSTITUTION.md` (esp. Art. V, VII, X §4, XIII) and `DECISIONS.md`.
This file is the **contract** for how the schema behaves. Migrations must uphold it.

## 1. Two-speed data

- **Structural invariants** (below) are ten-year-grade and enforced *in the
  database*. They are **not editable from any UI**.
- **Business-variable rules** (service types, recipes, prices, checklists,
  document templates, units, frequencies, custom fields …) live in **reference
  tables**, scoped by `service_line_id`, and are **editable at runtime** from the
  admin console with no code deploy (Constitution Art. XIII §3).

## 2. Structural invariants — enforced in the DB, never editable from a UI

1. **Append-only tables** — `service_reports`, `stock_movements`,
   `journal_lines`, `receipts`/cash, `audit_log`, `outbox_events`. No `UPDATE`
   or `DELETE`: enforced by the `enforce_append_only()` trigger **and** by
   revoking those privileges. Corrections are reversing entries (Art. VII §2).
2. **`debits = credits`** on every financial document — a database `CHECK`/
   constraint, not application code (Art. V §3).
3. **Referential integrity** — foreign keys, always.
4. **Row-Level Security** — tenant + service-line isolation, tested with a
   non-privileged user as a merge condition (Art. V §5).
5. **Identity & event contracts** — UUID keys, `tenant_id` and `service_line_id`
   on every table from migration 001; event schemas defined once in
   `packages/domain`.

## 3. Versioning & frozen snapshots (compliance-critical)

**Rule F1 — reference data is versioned, never mutated.**
`treatment_recipes`, price lists / rate cards, `checklist_templates`,
`document_templates` (and the VAT rate) carry `effective_from` / `effective_to`.
Editing creates a **new version**; the old version row is never changed or
deleted. The admin UI edits the current version and shows history.

**Rule F2 — transaction records freeze what they used.**
Every `service_report`, `job`, `invoice_line`, and `stock_movement` stores **both**
the `*_version_id` it used **and** a denormalised JSONB `snapshot` of the actual
values applied (dose rate, dilution, coverage, unit price, VAT rate, currency,
quantities). The record must fully explain itself even if the version row later
changes or is removed.

**Rule F3 — invoices freeze the tax position at issue date.**
Each invoice additionally freezes the customer's **legal name, TRN, address,
place of supply, and customer type** as at issue date. A UAE tax invoice reflects
the position when issued, not the customer's current details.

**Rule F4 — never recalculate history from current reference data.**
Reports, certificates, and invoice reprints render **from the frozen snapshot**.
Current reference data is used only for *new* records. A dose applied in March
2026 must read back exactly as it was then, for a 2028 municipality inspection.

## 4. What is LIVE (current source of truth going forward)

Customer master record, current versions of reference catalogues, current
contract terms and settings, dashboards. These legitimately diverge from the
frozen copies on historical records — that divergence is correct, not a bug.

## 5. Runtime-extensible fields (controlled, not a junk drawer)

Core entities (`customers`, `customer_branches`, `contracts`, `jobs`,
`service_reports`, `items`) each carry a validated `attributes` JSONB column.
New fields are declared per service line in `field_definitions`; writes to
`attributes` are **validated against those definitions** (unknown keys and
missing required fields are rejected). When a custom field becomes load-bearing
for money or scheduling, it graduates to a real typed column via a migration.

## 7. External tools plug into MOP; MOP owns the vocabulary

MOP is the **single source of truth**. External tools are pure renderers/adapters
that *read* MOP reference data and *write back* frozen artefacts — they never keep
their own parallel lists.

- **Agreement generator (Phase 2, not built here).** `facility_types` is a
  MOP-owned reference catalogue; the generator reads it. Per-facility-type form
  schemas ride `field_definitions` + `attributes` — adding a facility type is
  reference data in MOP, never a new JSON file in two systems. Every field in the
  generator's agreements table has a home on `contracts` / `contract_services` /
  `customers`. The rendered agreement lands in `generated_documents` (append-only)
  with a frozen `snapshot`, linked to its contract.
- **e-invoicing ASP (Phase 3).** Same shape: MOP produces the invoice object; an
  adapter serialises PINT AE and hands it to the ASP.

**`customers.trade_license`** is first-class — the source of the TRN and the field
whose capture at contract signing closes the 220-record TRN gap over time.

## 6. Provenance on everything editable

Every editable row carries `updated_by`, `updated_at`, and `is_assumed`
(+ `confirmed_by` / `confirmed_at`). Every change also writes the **previous
value** to the append-only `audit_log`. `ASSUMED` values render with a warning
badge until an owner confirms them (Art. X §4); nothing invented is ever shown
as fact.
