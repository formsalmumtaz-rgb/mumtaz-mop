# DECISIONS.md — Sprint Zero
# Infrastructure, scope, and module boundary rulings

**Date:** 23 July 2026 · **Governed by:** `CONSTITUTION.md` v1.0
**Supersedes:** conflicting assumptions in `CONTEXT.md` §9 and `EXECUTION.md` §5

---

## 1. Confirmed operating numbers

| Figure | Value |
|---|---|
| Active AMCs (pest control) | **~300** |
| Technicians (pest control) | **10** |
| Teams at launch | **2** |
| Estimated jobs/day | **15–40** |
| Estimated jobs/year | ~3,600–9,000 |
| Service records after 5 years | ~45,000 |

### What these numbers settle

**1.1 — Offline sync: hand-rolled, confirmed.**
Constitution Art. V §6 set a migration trigger at 20 concurrent field users. You have 10. Dexie.js + an explicit outbox queue is the correct answer and will remain correct for years. **PowerSync is off the table until headcount doubles.** Saves roughly $49/month and a large dependency.

**1.2 — Route optimisation: deferred, and more firmly than before.**
Two teams and ~20 jobs a day is a problem a human solves well. An optimiser here would save minutes, not hours. Stays in Phase 4. Revisit at 5+ teams.

**1.3 — Database size is a non-issue.**
300 customers and ~9,000 jobs/year is small. The 500 MB free-tier ceiling is years away. **The reason to pay for Supabase Pro is backups and the 7-day pause — not capacity.** That reason still stands: this database will hold your ledger.

**1.4 — Photo storage, recalculated.**
25 jobs/day × 6 photos × 150 KB compressed ≈ **675 MB/year.** Cloudflare R2's 10 GB free tier covers roughly 14 years. Photos are no longer a cost risk — *provided* client-side WebP compression ships in Sprint Zero. Without it, the same figure is ~9 GB/year and the free tier is gone in 13 months.

---

## 2. Infrastructure — decided

| Layer | Decision | When to change |
|---|---|---|
| **Dev database** | **~~Postgres 16 + PostGIS in local Docker~~ → Supabase staging project (`mumtaz-mop-staging`)** — *amended 23 Jul 2026, see §2.A* | If dev/staging separation becomes necessary — introduce Supabase branching or a local Postgres. |
| **Staging database** | **Supabase free project** — *now also serves as the dev database (§2.A)* | — |
| **Production database** | **Supabase Pro, $25/mo** | Created the day a real technician's work depends on it. Not before. |
| **Region** | **Closest available to the UAE — Mumbai (ap-south-1) preferred, Frankfurt (eu-central-1) as fallback.** Mumbai is typically 30–50 ms from the UAE vs ~120 ms from Frankfurt. **Verify available regions at project creation. This cannot be changed later without a migration.** | — |
| **App hosting** | **Vercel** — Hobby now, Pro when commercial | At first paying customer or team member |
| **Background workers** | **Existing DigitalOcean VPS**, PM2 | Already paid for by the content engine |
| **Photo storage** | **Cloudflare R2** | ~14 years of headroom |
| **Auth** | **Supabase Auth** — phone OTP for technicians, email for office | — |
| **Repo** | **GitHub, private, single monorepo** | — |

**Escape hatch (Art. VII, D7):** if a client ever imposes UAE data residency, self-hosted Supabase on the DigitalOcean VPS is the documented answer. Nothing in this stack blocks it.

### 2.A — Amendment: no local Docker; Supabase staging is the dev database *(23 Jul 2026, owner-directed)*

**Decision.** Docker is **not** installed. Local development runs directly against the **Supabase staging project** (`mumtaz-mop-staging`, ref `xpkniuhcjysisfbfiqhn`, region ap-south-1 / Mumbai). There is, for now, a single shared Supabase environment serving both development and staging.

**Why.** The owner is a non-developer and a single-builder team at this stage. Installing and maintaining Docker (Desktop licensing, a daemon to keep running, an image to manage) is overhead with no operator to absorb it. The staging project is already provisioned in the correct region, already connected, and already verified reachable. Removing Docker removes a whole class of "it won't start" failures that only the owner would be blocked by.

**What this supersedes.** This diverges from `CONSTITUTION.md` Art. XIII §1 (which lists the dev DB as local Docker Postgres) and from the original "Never change" note in the table above. **DECISIONS.md is subordinate to the Constitution**, so a matching amendment to Art. XIII §1 should be ratified by the owner (Art. XII) to keep the documents consistent. Recorded here as owner-directed pending that ratification.

**Risks accepted (eyes-open).**
- **Free-tier pause:** the staging project pauses after ~7 days of inactivity and has **no backups**. Dev work can hit a paused DB (restartable from the dashboard). The ledger never lives here — production remains Supabase Pro.
- **No instant reset / no isolation:** the fast, disposable local loop (instant reset, no quotas, no network) is lost. Dev writes and staging data share one database; a bad migration in dev is a bad migration in staging.
- **Network dependency:** development now requires connectivity to Mumbai, contradicting the spirit (not the letter) of the offline-first principle for the *build* loop.

**Cheaper reversal available:** **Postgres.app** provides a Docker-free *local* Postgres with PostGIS bundled, restoring the fast local loop without Docker. Offered to the owner; staging-as-dev chosen instead.

**Switch trigger (recorded 23 Jul 2026).** Revisit a local Postgres (Postgres.app or Docker) **once a production database exists and we need a safe, isolated place to run destructive migrations** — i.e. the moment "test this migration somewhere it cannot touch real data" becomes a genuine need. A second option at that point is **Supabase branching** (per-branch ephemeral databases). Until production exists, staging-as-dev stands.

### 2.B — Hybrid Google Maps architecture *(24 Jul 2026; ratified in CONSTITUTION Art. XVII)*

Google Maps Platform provides mapping intelligence only; the platform owns all business logic. Full doctrine in Constitution Art. XVII. Supersedes the MapLibre/Protomaps/Nominatim choices in CONTEXT §9.

| Capability | Provider | Phase |
|---|---|---|
| Map display | Google Maps JavaScript API (browser key) | now |
| Geocoding (once per site, **server-side**) | Google Geocoding API (server key) | now |
| Navigation | Deep-link to the Google Maps app — free, no API call | K3 |
| Route optimisation & matrix | Google Route Optimization, behind `RouteProvider` | Phase 4 (per §1.2) |
| Fallback for all routing | VROOM / OpenRouteService (satisfies Art. XVII §2) | documented |

**Boundary:** Google for what a human looks at and for one-time address lookup; a deferred, interchangeable provider for route math. Never on the per-job critical path (Art. III P2).

**Keys (two).** Browser key: Maps JavaScript API only, domain-restricted, `NEXT_PUBLIC_`-prefixed. Server key: Geocoding only (Route Optimization added at Phase 4), never browser-exposed, API-restricted + hard quota cap. Both in `.env.local`, git-ignored. IP-restriction of the server key is a pre-production item (DEBT.md D7).

**SKU finding (verify against live Google pricing before Phase 4).** Maps JavaScript + Geocoding are **Essentials** SKUs (~10,000 free events/month). Google **Route Optimization is an Enterprise** SKU (~1,000 free events/month — 10× tighter). Open question to confirm before building routing: does it bill **per request** or **per shipment/stop**? At 25 jobs/day those differ ~10×.

### 2.C — MOP background-job runtime: Vercel + Supabase, no DigitalOcean *(24 Jul 2026, owner-directed)*

MOP's scheduled and event-driven work runs on **Vercel + Supabase**; the DigitalOcean VPS is **not** a MOP dependency.

| Work | Runs on |
|---|---|
| Outbox drain (event-driven) | HTTP drain endpoint on Vercel, fired by a Supabase database webhook on event insert |
| Outbox sweeper (safety net) | Vercel Cron, every few minutes |
| Nightly job generation, renewal reminders, compliance expiry, invoice runs, AR ageing | Vercel Cron and/or Supabase `pg_cron` |

The DigitalOcean droplet hosts an **unrelated AI content engine**; whether it stays is not MOP's decision. Supersedes the "Background workers: DigitalOcean VPS + PM2" row in §2 for MOP.

### 2.D — Deferred: no messaging intake bot *(24 Jul 2026)*

No Telegram/WhatsApp job-intake bot. Parsing free-text messages means brittle matching or AI on the operational path (Art. IV forbids the latter). Ad-hoc jobs are created via the admin console instead. Revisit as a candidate **after Phase 1**, once real message patterns are known.

---

## 3. RULING — Invoicing and Agreements: one platform, separate modules, phased

**The question:** build invoicing and agreements inside this platform, or as separate systems integrated later, to reduce complexity?

**The ruling: one database, one repository, one platform. Separate *modules*, not separate *systems*. Phased in time, not split in architecture.**

### Why separate systems would be a mistake

Look at what an invoice actually needs:

```
INVOICE requires:
  ├─ customer legal name, TRN, address, place of supply  → CRM
  ├─ contract terms, rate, frequency, VAT treatment      → Contracts
  ├─ proof the service was delivered                     → Jobs
  └─ payment status                                      → Ledger
```

Every one of those lives here. Put invoicing in a separate system and you must **synchronise customers, contracts, and job completion across a boundary** — building a sync problem, a reconciliation problem, and two versions of the truth.

That is precisely the disease this platform exists to cure. Constitution Art. III: *no duplicate entry, no manual reconciliation.* A separate invoicing system violates the founding philosophy on day one.

**Separating them doesn't reduce complexity. It relocates complexity into the integration — which is the most expensive place to put it.**

### Same reasoning, stronger, for agreements

An "agreement module" is not a system at all. It is **document generation from contract data** — a template engine over the `contracts` table. Your bilingual EN/AR templates with correct RTL rendering already exist and become the templates. Split out, you would be re-keying contract terms into a separate tool, which is exactly what you're eliminating.

### What genuinely reduces complexity — and what you should do

Complexity is reduced by **sequencing in time**, not by splitting the architecture:

| Item | Sprint Zero | Phase 2 | Phase 3 |
|---|---|---|---|
| `invoices` / `invoice_lines` **tables**, PINT AE fields | ✅ built now | | |
| Invoice row queued on `job.completed` | ✅ built now | | |
| Contract → agreement PDF generation | | ✅ | |
| Invoice PDF, numbering, VAT, credit notes | | | ✅ |
| AR ageing, statements, dunning | | | ✅ |
| e-invoicing ASP adapter | | | ✅ |

**The table is cheap now and expensive later. The module is expensive now and cheap later.**

Building the `invoices` table in Sprint Zero with the full PINT AE field set costs perhaps an hour. Retrofitting those fields after 12 months of live invoices is a data migration under a legal deadline (Art. V §7 — ASP by 31 March 2027, live 1 July 2027).

**Module boundaries are enforced by Art. V §4:** no module reads another module's tables. Invoicing consumes `job.completed` and calls published contract functions. It never issues a SELECT against `jobs`. That gives you every benefit of separation with none of the sync cost.

---

## 4. Added to Sprint Zero scope

Two items from tonight's discussion, both now on the critical path.

### 4.1 Admin Console (master data UI)

You asked for a UI to maintain backend data. This is not a nice-to-have — it is what makes the `ASSUMED`-defaults strategy work. Without it, every unknown business rule needs a code deploy to correct.

Scope: CRUD over customers, branches, contacts, contracts, items, **treatment recipes**, users, teams, technicians, service lines, and system settings. Every field seeded as `ASSUMED` renders with a visible flag until an owner confirms it.

Agent compute makes this genuinely cheap. Build it early.

### 4.2 Bulk Import

**Binding rule: imports never write directly to live tables.**

```
CSV → staging tables → validation → dry-run report → owner approves → commit → audit log
```

The dry-run report must state: rows accepted, rows rejected with reasons, duplicates detected, and every field left blank. Rollback by import batch ID. Re-runnable — importing the same file twice must not create 600 customers.

This matters more than it looks: those 300 AMCs are the foundation of e-invoicing compliance. Garbage in now is a legal problem in 2027.

---

## 5. Revised task assignments

Replaces `EXECUTION.md` §5 for Claude Code. Cowork tasks C1–C3 are unchanged.

**K1 — Foundations** *(unchanged from EXECUTION.md, plus:)*
> Additionally: seed reference data for 2 teams, 10 technicians, 1 service line (pest control), and a chart of service types. Include `invoices` and `invoice_lines` tables with the full PINT AE mandatory field set per CONTEXT.md §4.1 — tables only, no invoicing logic in this task.

**K1b — Admin Console** *(new, Thursday night / Friday)*
> Build an admin console in `apps/ops-console` for master data maintenance: CRUD over customers, customer_branches (with a map pin picker using MapLibre), contacts, contracts, items, treatment_recipes, teams, technicians, users, and settings.
>
> Requirements:
> - Any field whose value was seeded as `ASSUMED` renders with a visible warning badge and an "I confirm this value" action that clears the flag and writes to the audit log.
> - Table views with search, filter, and sort. No pagination gymnastics — 300 customers fits comfortably.
> - Every write goes through the domain layer, never raw. Every write is audit-logged.
> - Treatment recipes are editable here without a deploy. This is the point of the whole screen.
>
> Proof-of-Work per Art. X §5.

**K5 — Bulk Import** *(new, assign when Cowork's C1 output lands)*
> Build the bulk import pipeline for customer master data.
>
> Flow: upload CSV → write to staging tables → validate → produce a dry-run report → owner approves → commit to live tables → record in an import audit log.
>
> Requirements:
> - **Never write to live tables before approval.**
> - Validation covers: required fields, TRN format, duplicate detection (exact and fuzzy on legal name + emirate), GPS coordinate sanity, and referential integrity.
> - The dry-run report states rows accepted, rows rejected with per-row reasons, duplicates flagged for human decision, and a count of blank fields per column.
> - Idempotent by import batch ID — re-running the same file must not duplicate records.
> - Rollback by batch ID.
> - Blank means unknown. Never substitute a default for a missing value.
>
> Test with the real CSV in `/seed`, deliberately corrupted in three ways, and show me the rejection report.
>
> Proof-of-Work per Art. X §5.

---

## 6. Who instructs whom

**You do. The tools do not talk to each other.**

There is no mechanism by which Cowork hands a task to Claude Code, or by which either "takes over." You are the integration point, and files are the interface.

```
        ┌──────────────── YOU ────────────────┐
        │                                     │
    assign C1/C2/C3                    assign K1/K1b/K2…
        │                                     │
        ▼                                     ▼
   ┌─────────┐                          ┌───────────┐
   │ COWORK  │                          │  CLAUDE   │
   │         │  writes CSV → you copy → │   CODE    │
   │ mounted │     into repo /seed      │           │
   │ folder  │                          │   repo    │
   └─────────┘                          └───────────┘
        │                                     │
   no repo access                      no access to
   no git, no terminal                 Cowork's folder
```

**Both must be given the same governing documents:**
- Claude Code reads `CLAUDE.md` at the repo root automatically every session, which points it to the constitution.
- Cowork must have `CONSTITUTION.md` and `CONTEXT.md` **copied into its mounted folder** — it cannot see your repo.

**The handoff you will actually perform:** Cowork finishes C1 and writes `customers_clean.csv`. You copy that file into the repo at `/seed/`. You commit it. Then you tell Claude Code to run K5 against it. That copy step is manual, it takes ten seconds, and forgetting it is the single most common way this setup stalls.

---

## 7. Costing engine — assumptions and guards *(29 Jul 2026, owner-directed)*

**7.1 — Seeded labour rate is a PLACEHOLDER, not a soft-launch value.**
`cost.standard_labour_rate_hourly` is seeded at **AED 1,700 ÷ 176 productive hours = 9.6591/hr** (mig 025). **AED 1,700 is BASIC salary, not employment cost.** The real fully-loaded figure — including gratuity accrual, accommodation, transport, medical insurance, and visa/Emirates-ID amortisation — will be **materially higher** (UAE norm is 30–50% above basic; see `employee_cost_components`, mig 019). This is a development placeholder to unblock the engine, flagged `ASSUMED`, editable in Cost setup. Do not treat any margin computed from it as real. Overhead (1.4489/hr ≈ 15% of labour) and the vehicle operational rate (0.50/km) are ASSUMED placeholders likewise.

**7.2 — Assumed-costing is strict-block by default; dev opt-in only; environment-bound; FAIL CLOSED.**
The engine refuses to compute profitability on ASSUMED config **by default** (`cost.allow_assumed_costing` defaults false, mig 026). Computing on ASSUMED values is an explicit dev opt-in **and cannot take effect in production regardless of the setting**. `fn_cost_config_status` binds to the GUC `app.environment` set from **`MOP_ENV`** (pooled-connection `set_config`, session pooler). The binding is an **ALLOWLIST and fails closed** (mig 027): assumed costing is permitted **only** when `app.environment` ∈ {`development`, `staging`, `dev`, `test`}. **Unset, empty, `production`, or any unrecognised/misspelled value → BLOCKED** — the first-deploy "forgot to set MOP_ENV" case refuses to compute rather than emitting a placeholder margin. Proven for all four states (production/development/unset/garbage). Every figure produced under ASSUMED config is flagged (Art. X §4). **Production simply leaves `MOP_ENV` unset (or `production`) — it is fail-safe with zero config.**

**7.3 — Vehicle depreciation/lease is management-accounting only.**
Depreciation (company-owned) / lease (leased-rented) is **never** in operational, job, technician, or customer profitability. It is not in `job_costs`; it lives only in `fn_management_profit` (Operating Profit = default operational view; Net Profit = after depreciation/lease, management reporting only). Dev default depreciation AED 1,750/month, ASSUMED, per-vehicle configurable (mig 025).

**7.4 — Chart of accounts remains ASSUMED and editable.**
All GL account codes (labour/vehicle/overhead/clearing/accrual + inventory) are seeded ASSUMED and editable from Cost setup, replaceable with the accountant's final CoA without schema change.

## 8 — Pre-sales pipeline (Survey → Estimate → Quotation → Contract)

**8.1 — One pricing engine across the whole funnel.**
Survey lines, estimate lines, and the quotation all price through the same `fn_price` (mig 028) and cost through the same `fn_estimate_cost` (mig 029, operating basis — no depreciation). A survey's numbers are byte-identical to the estimate it seeds; the quotation is the estimate's frozen snapshot rendered revenue-only (retail mode — internal cost/margin never shown to the customer).

**8.2 — Data entered once; each stage seeds the next and links back.**
An accepted estimate seeds a draft contract + `contract_services` (`estimates.contract_id`, mig 031); a survey seeds a draft estimate copying every line (`surveys.estimate_id`, mig 032). Both conversions are idempotent — they refuse if already linked. The contract then follows the existing lifecycle (activate → `contract.activated` → K2 fans out schedule + jobs); no scheduling/exactly-once guarantee is touched.

**8.3 — Surveys are service-driven, not hardcoded (Art. XVIII).**
Survey header attributes are validated against `field_definitions` (`entity_type='survey'`), so per-service-line custom fields are configured, not coded. No survey fields are seeded/invented. Offline field capture (PWA) is a later technician-app concern; mig 032 is the ops-console capture path.

## 9 — Back Office Revenue Loop

**9.1 — Accounting model: the revenue loop posts to the double-entry GL (owner decision, 3 Aug 2026).**
In addition to the invoice/receipt/credit-note subledger, issuing an invoice will post **Dr Accounts Receivable / Cr Revenue / Cr VAT-Output**; recording a receipt posts **Dr Bank/Cash / Cr Accounts Receivable**; credit notes and cancellations post **reversing** entries (never edits). This requires introducing Revenue / Accounts Receivable / VAT-Output / Bank accounts — seeded **ASSUMED and editable** (per §7.4). The existing `debits=credits` constraint and append-only `journal_lines` are preserved; nothing in the cost/inventory posting is changed. *(Implemented from the Invoice milestone onward; the numbering + Service Report milestone is accounting-free.)*

**9.2 — Document numbering (mig 033).** One global gap-free counter per series via `fn_next_document_number` — `SR/YY/NNNNN`, `QTN/YY/NNNNN`, `AMTX/YY/NNNNN` (contract invoices), `AMTX/OW/YY/NNNNN` (ad-hoc invoices). The number never resets, the year is stamped from the issue date, and a cancelled document keeps its number forever (never reused). AMTX / AMTX-OW starting values are **ASSUMED** (owner sets the real next number to continue the legacy sequence before issuing).

**9.3 — Service Report is immutable; approval and attachments are separate append-only records (mig 033).** `service_reports` stays append-only (Constitution). Approval (`service_report_reviews`) and photos/signature/files (`service_report_attachments`) are their own append-only tables — the report is never mutated. An invoice is gated on a service report existing and not rejected (and approved, when approval is required) via `fn_job_service_report_ok`.

---

## Changelog

| Version | Date | Change |
|---|---|---|
| 1.0 | 23 Jul 2026 | Operating numbers confirmed. Infrastructure decided. Invoicing/agreements module boundary ruled. Admin console and bulk import added to Sprint Zero. |
| 1.1 | 23 Jul 2026 | §2.A — Docker dropped; Supabase staging becomes the dev database (owner-directed). Diverges from Constitution Art. XIII §1 pending ratification. Risks recorded. |
| 1.2 | 24 Jul 2026 | §2.B — Google Maps adopted for display, geocoding, and navigation deep-links (owner-directed). Routing/matrix stays off Google (VROOM/ORS); Art. XIII §2 reaffirmed. Supersedes the MapLibre/Protomaps/Nominatim choices in CONTEXT §9. |
| 1.3 | 24 Jul 2026 | Ratified hybrid Google (CONSTITUTION Art. XVII): §2.B rewritten — Google routing adopted for Phase 4 behind `RouteProvider`, VROOM/ORS as fallback; two keys, server-side geocoding, SKU finding. §2.C — MOP runtime is Vercel + Supabase, DigitalOcean dropped for MOP. §2.D — no messaging intake bot. |
| 1.4 | 29 Jul 2026 | §7 — Costing engine: labour rate is a placeholder (1700 basic ÷ 176, not employment cost); assumed-costing strict-block by default + dev-only, environment-bound (production fail-safe); vehicle depreciation/lease is management-accounting only (not in operational profit); chart of accounts stays ASSUMED and editable. |
| 1.5 | 3 Aug 2026 | §8 — Pre-sales pipeline: one pricing/cost engine across survey→estimate→quotation; each stage seeds the next and links back idempotently (estimate→contract mig 031, survey→estimate mig 032); surveys service-driven via `field_definitions(entity_type='survey')`. |
| 1.6 | 3 Aug 2026 | §9 — Back Office Revenue Loop: owner decision that the revenue loop posts to the double-entry GL (Dr AR/Cr Revenue/Cr VAT-Output on issue; Dr Bank/Cr AR on receipt; reversing entries for credits/cancellations; new ASSUMED accounts). Document numbering (mig 033: SR/QTN/AMTX/AMTX-OW). Service Report immutable; approval + attachments separate append-only records. |
