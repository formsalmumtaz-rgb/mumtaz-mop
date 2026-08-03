# FINANCE_ARCHITECTURE.md

The single agreed architecture for the Back Office Revenue Loop. Every finance
milestone (Invoice → Receipt → Credit Note → Refund → AR → GL → Reporting)
follows this. It is binding alongside `CONSTITUTION.md` and `DECISIONS.md §9`.
Do not drift from it without an explicit owner decision recorded in `DECISIONS.md`.

Status legend: **[built]** shipped · **[next]** in progress · **[planned]** not yet built.

## 1. Principles (apply to every financial document)

1. **Append-only / nothing financial disappears.** Financial documents are never
   hard-deleted. Corrections are *reversing documents* (credit note, refund,
   cancellation), never edits or deletes. Line content is frozen once the parent
   document is finalised (issued / confirmed).
2. **Deterministic, automation-first (Art. I).** All money maths — VAT, totals,
   allocations, ageing, balances, revenue recognition — is SQL/rules, never a
   model call.
3. **Numbering is gap-free and permanent** (`fn_next_document_number`, mig 033):
   one global counter per series, year stamped from the issue date, numbers never
   reset or reuse; a cancelled/void document keeps its number forever.
4. **Audit everything.** Every state change writes `audit_log` (who/when/action)
   plus, where the doc supports it, reason/actor/timestamp columns for display.
5. **Service-Report gate.** A job-linked invoice cannot be *issued* until a
   service report exists (and is approved when `ar.require_sr_approval`) —
   `fn_job_service_report_ok` (mig 033).
6. **Subledger first, one unified GL engine second** (DECISIONS §9.4). Document
   milestones write only their own subledger tables — **no `journal_lines`**. A
   single deterministic posting engine (built after all documents exist) posts
   every financial event to the double-entry GL.
7. **RLS on every table**, tested with the non-privileged `mop_app` role as a
   merge condition. **ASSUMED** values (accounts, terms, VAT rate) are flagged
   and editable, never presented as fact.
8. **Two-speed.** These schema/ledger/numbering rules are ten-year-grade; the
   screens are disposable.

## 2. Document series (numbering)

| Document | Series key | Format | Assigned when |
|---|---|---|---|
| Quotation | `QTN` | `QTN/YY/NNNNN` | on quote |
| Service Report | `SR` | `SR/YY/NNNNN` | on filing |
| Contract invoice | `AMTX` | `AMTX/YY/NNNNN` | on issue |
| Ad-hoc invoice | `AMTX_OW` | `AMTX/OW/YY/NNNNN` | on issue |
| Receipt | `RCP` | `RCP/YY/NNNNN` | on record **[built]** |
| Credit note | `CRN` | `CRN/YY/NNNNN` | on issue **[built]** |
| Refund | `RFD` | `RFD/YY/NNNNN` | on record **[built]** |

Ad-hoc vs contract is decided by `contract_id` presence on the invoice.

## 3. Documents & lifecycles

### 3.1 Invoice **[built — mig 034]**
- Tables: `invoices` + `invoice_lines` (mig 007). Buyer tax identity frozen at
  create; line content frozen at issue.
- States: `draft → queued → issued → paid` and `→ cancelled` (from
  draft/queued/issued; a `paid` invoice is corrected by a credit note, never
  cancelled). Editing an issued invoice is approval-gated **[planned]**.
- Functions: `fn_issue_invoice` (number + dates + SR-gate), `fn_cancel_invoice`
  (reason/actor/when, number stays reserved).
- VAT: per-invoice `vat_treatment` (standard 5% ASSUMED / zero_rated / exempt /
  reverse_charge); per-line `vat_rate`/`vat_amount` frozen. Per-invoice override
  and discounts (approval-gated) **[planned]**.

### 3.2 Receipt / Payment **[built — mig 035]**
- Tables: `receipts` (header: number, date, method, amount, reference,
  `others_note`) + `receipt_allocations` (receipt → invoice, amount).
  Both **append-only** once confirmed.
- Methods: cash, card, bank_transfer, cheque, other (`other` requires
  free-text note).
- Allocation rules: one receipt may settle many invoices; one invoice may take
  many receipts. **Partial payment allowed for contract invoices; ad-hoc
  invoices must be settled in full.** A receipt is never over-allocated beyond an
  invoice's outstanding balance.
- Payment status is **derived** from allocations vs invoice total:
  `unpaid → partial → paid` (invoice flips to `paid` when balance = 0).
- Operational workflow prompts "payment received?" — expected immediately for
  ad-hoc, may be delayed for contract work.

### 3.3 Credit note **[built — mig 036]**
- Represented in `invoices` with `document_type='credit_note'` (or a dedicated
  `credit_notes` table if cleaner) linked to the original invoice; own `CRN`
  series; supports full and **partial** credit. Append-only; reduces the
  customer's outstanding balance.

### 3.4 Refund **[built — mig 036]**
- Outflow against a credit note or an over-paid receipt; own `RFD` series;
  method as per receipts. Append-only.

## 4. Accounts Receivable & ageing **[built — mig 035/036 + /ar dashboard]**
- `invoice_ar` view (mig 035) is the authoritative source: per-invoice balance,
  payment_status (unpaid/partial/paid), days_overdue and ageing bucket. AR
  dashboards / customer statements / reminders build on it.
- Derived views over invoices + allocations + credit notes:
  outstanding balance per invoice/customer, receipt & invoice history.
- **Overdue after 30 days**; ageing buckets **current / 1–30 / 31–60 / 61–90 /
  91–120 / 120+** (buckets measured from due date). Monitoring only — warnings
  and reminders, **never hard blocks**.
- Customer credit limit / payment terms are warnings only; never block quotation
  or contract creation.

## 5. Unified GL posting engine **[planned — after all documents exist]**
Per DECISIONS §9.1, one deterministic engine posts every event. Balanced entries
(`debits=credits` by constraint), append-only `journal_lines`, idempotent on
`(source_type, source_id)`, reversals are new entries (never edits). New
**ASSUMED, editable** accounts, resolved via settings codes (mirroring
`fn_cost_account`): `1000` Cash/Bank, `1100` Accounts Receivable, `2200` VAT
Output Payable, `4000` Service Revenue.

| Event | Debit | Credit |
|---|---|---|
| Invoice issued | AR (total) | Revenue (subtotal) + VAT-Output (vat) |
| Invoice cancelled | Revenue + VAT-Output | AR (reversal) |
| Receipt confirmed | Cash/Bank (amount) | AR (amount) |
| Credit note issued | Revenue + VAT-Output | AR |
| Refund paid | AR (or credit-note liability) | Cash/Bank |

VAT line is omitted when zero-rated/exempt. Posting reads the subledger; it does
not recompute document amounts.

## 6. Reporting & revenue recognition **[planned]**
- **Accrual** basis = revenue recognised when the invoice is *issued*.
  **Cash** basis = recognised when payment is *received* (receipt allocation).
  Every financial dashboard offers an accrual/cash toggle.
- **Profitability and Cash Flow are separate reports** and never conflated.
- Visibility: technicians never see financial analytics; operational staff see
  operational reports; management sees the financial dashboards. Analytics are
  filterable by company / division / branch (multi-company-ready by design — one
  set of modules, filtered, not duplicated).

## 7. Change control
Any change to numbering, append-only behaviour, the posting matrix in §5, revenue
recognition (§6), or the SR-gate is a decision recorded in `DECISIONS.md` before
implementation. This file is updated in the same PR so it never drifts from the
code.
