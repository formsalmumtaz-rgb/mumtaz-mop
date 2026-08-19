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

**9.5 — Unified GL posting engine built (mig 037).** One deterministic engine posts every revenue-loop event to the double-entry ledger: `fn_post_invoice_gl` / `_invoice_cancel_gl` / `_receipt_gl` / `_credit_note_gl` / `_refund_gl`, plus `fn_gl_sync` (idempotent back-post/catch-up). Append-only (inserts only; reversals are new entries), idempotent on `(source_type, source_id)`, balanced (existing `debits=credits` constraint), and configurable via `gl.account_code.*` settings resolving to ASSUMED, editable accounts (`1000` Cash/Bank, `1100` AR, `2200` VAT-Output, `4000` Revenue). The domain posts in the same transaction as each subledger write. Cost/inventory posting is unchanged.

**9.4 — Build order: full subledger first, then one unified GL posting engine (owner decision, 3 Aug 2026).**
The financial documents (invoice, receipt, credit note) are built as subledger records **first**, with **no GL posting** in those milestones. Once they all exist, a single unified, deterministic GL posting engine posts invoices, receipts, cancellations, refunds and credit notes together (per §9.1) — avoiding duplicated posting logic and keeping the ledger easier to audit. AR/aging/cash-flow/accrual-vs-cash reports read the subledger directly in the interim. The invoice subledger (mig 034: `fn_issue_invoice` numbering + SR-gate + due date; `fn_cancel_invoice` keeps the number reserved) posts nothing to `journal_lines`.

**9.3 — Service Report is immutable; approval and attachments are separate append-only records (mig 033).** `service_reports` stays append-only (Constitution). Approval (`service_report_reviews`) and photos/signature/files (`service_report_attachments`) are their own append-only tables — the report is never mutated. An invoice is gated on a service report existing and not rejected (and approved, when approval is required) via `fn_job_service_report_ok`.

## 10 — Recurring Contract Billing (mig 038)

**10.1 — Deterministic, idempotent recurring invoicing driven by the contract's own terms.** Contracts carry `billing_frequency` (per_visit/weekly/monthly/quarterly/half_yearly/yearly/custom), `billing_interval_days` (custom), `billing_day`, `next_invoice_date`, `last_invoice_date`, `auto_generate_invoice`. `fn_run_contract_billing(tenant, as_of)` generates due invoices (catching up missed periods), advances the schedule, audits each, and records failures without aborting the run — safe to run repeatedly. Generation reuses the existing pipeline (`fn_issue_invoice` → AMTX number → `fn_post_invoice_gl`); **no billing logic is duplicated**. Runs daily via Vercel Cron `/api/billing/run`.

**10.2 — Idempotency is enforced in the database.** A partial unique index on `invoices(tenant_id, contract_id, billing_period)` guarantees at most one tax invoice per contract per period, ever (a cancelled auto-invoice keeps its period; re-billing is manual). Per-visit contracts are excluded from date-driven billing — they stay on the Service-Report-gated `job.completed` path. Expired (past `end_date`), cancelled, suspended and draft contracts never bill.

**10.3 — Per-cycle amount basis (ASSUMED).** The per-invoice amount is the sum of the contract's active `contract_services` line totals (unit_price × quantity), or `contract_value` if there are no service lines — i.e. each cycle bills the configured line amounts as-is (no proration invented). VAT per the contract's `vat_treatment`. Editable via contract services.

*(Known gap: tenants provisioned after mig 033/037 need their document counters + GL accounts/settings seeded; there is effectively one tenant today. Tracked for the tenant-provisioning milestone.)*

## 11 — Security & access model (auth + RBAC + live RLS)

**11.1 — Authentication = Supabase Auth (owner-confirmed).** Office staff log in via Supabase Auth; `app_users.id` = `auth.users.id` (no passwords stored in our schema). The owner enables Supabase Auth and creates the first admin; the rest are added via an admin-driven invite flow. Claude never creates accounts or handles passwords.

**11.2 — RBAC (mig 039).** Six seeded roles — admin, management, finance, operations, technician, viewer — over a 28-code permission catalogue (`permissions` / `roles` / `role_permissions` / `user_roles`). **Profit and GL are finance/management only; technicians have no financial permissions.** Roles are per-tenant and editable.

**11.3 — External parties are not users.** Auditors and municipality inspectors are **not** `app_users`; no role grants them access. Per Constitution Art. V they receive scoped, expiring links (a separate mechanism, built later). Stated explicitly so the boundary isn't missed.

**11.4 — One choke point; phased flip to live RLS.** All DB access flows through `withRequest(ctx, fn)` which sets `app.current_tenant` + `app.current_actor` per transaction. **Phase A1 (done):** identity schema + the helper, privileged role kept → no behaviour change. **A2:** wire Supabase Auth, session, `can(permission)` guards, populate `audit_log.actor_id`. **A3:** add `set local role mop_app` in the one helper → RLS becomes the live boundary. Gated by a fail-closed coverage test: under mop_app with no tenant set, every tenant table returns zero rows.

**11.5 — Offline sessions (constrains the PWA).** The field app validates the Supabase access token locally (JWT signature vs cached JWKS + `exp`) — no live round-trip per request. Short access-token TTL (~1h), long refresh-token TTL (30–60 days). Offline with an expired access but valid refresh token → the technician keeps working; mutations queue under the login actor and are re-authorized server-side at sync. Re-login only if the refresh token itself expires (≫ a working day).

**11.6 — Cron/worker context without superuser.** Scheduled jobs (billing run, outbox drain) run under mop_app and iterate tenants via the single `SECURITY DEFINER` pinhole `fn_all_active_tenant_ids()` (returns tenant IDs only), opening a per-tenant `withRequest` with a reserved system actor. No superuser bypass reopens the hole.

**11.7 — Outbox immutability whitelist refined (owner-ratified, 12 Aug 2026).** The `outbox_events` append-only guard (mig 008) froze all columns except the processing-bookkeeping pair `processed_at`/`attempts`. The technician-app work (mig 054) added two columns that gate processing in the same way — `needs_review` (a held-for-admin flag the drain skips) and `review_reason` — so mig 056 extends the mutable whitelist to include them. **Event content — `event_type`, `payload`, `actor_id`, `device_time`, `server_received_at`, `time_suspect` — remains immutable; DELETE remains forbidden.** This is a *refinement* of the bookkeeping category, not a relaxation of content immutability (Art. VII §1 holds). Recorded here per the rule that any change touching a structural invariant is a constitutional amendment requiring the owner — ratified so the precedent is explicit, not implied.

---

## 12 — Customer account numbers: the 5-digit scheme (RATIFIED 19 Aug 2026)

**Decision (owner, ratified).** The 5-digit account numbers in
`merge/CUSTOMER_Master_MOP.xlsx` (**11111–11827**, digit 0 never used, 583
unique) become **THE permanent customer account number**. `CUST-XXXX` is
retired.

**Consequences, all binding:**

1. `customers.code` holds the 5-digit number. The column is `text` with
   `unique (tenant_id, code)`, so no schema change is required — only the
   minting logic changes.
2. **CUST-0001 … CUST-0600 are BURNED — never reusable.** Account numbers are
   permanent identifiers; a retired number is never reissued to a different
   customer, because historical documents already carry it.
3. New numbers continue the file's sequence from **11828**, skipping any number
   containing the digit 0 (11830 → 11831, 11899 → 11911). Three call sites mint
   codes today and all three change: `lib/domain/customers.ts`,
   `lib/domain/imports.ts`, `scripts/import-merge.ts`.
4. **Every surface, list and document shows the 5-digit number** — customers
   list and detail, ⌘K search, exports, quotation PDF ("Account no."), service
   report S2 ("Account No."), agreement client block, receipts, estimates. All
   already read `customers.code`, so they follow automatically; the labels say
   "Account no.", not "customer code".
5. **The demo customer and the Sultan Al Arab records renumber to their IDs in
   the master file** (owner's instruction, 19 Aug):
   - Calicut Restaurant (`CUST-0001`) → **11193**.
   - Sultan Al Arab (`CUST-0026`, `0088`, `0089`, `0090`, `0091`, `0092`) →
     **11662**.

**MECHANICAL CONSEQUENCE THE NEXT SESSION MUST HANDLE EXPLICITLY.** The master
file holds **one** Sultan Al Arab record (11662, Al Barsha, Dubai) while the
live system holds **six**, carrying **7 contracts and 3 jobs** between them.
`unique (tenant_id, code)` means six rows cannot share 11662. The renumbering
is therefore a **merge**: one record becomes 11662, the other five have their
contracts and jobs repointed to it and are then archived. That repointing
touches live transactional links, so it runs inside one transaction, audited,
with counts reported before and after. Nothing is deleted.

[FACT, verified 18–19 Aug 2026] Live state at the time of this decision: 16
customers, codes to `CUST-0604`, burn counter `import.next_customer_code` = 601;
none of the 11 live contract numbers appear in the master file.

## 13 — Multi-outlet customers: group, customer, branch (RATIFIED 19 Aug 2026)

**Owner ruling, 19 Aug 2026. Supersedes the Sultan Al Arab merge plan in §12** —
the six live records are NOT merged into one customer.

**The ruling.** Both things are true of a chain like Sultan Al Arab:
operationally the outlets are branches of one group; legally they may be
separate entities with their own licences and legal names. The structure follows
the schema:

1. The **group** (`customer_groups`) holds the outlets together for consolidated
   statements and group reporting.
2. An outlet with its **own trade licence / legal name stays its own customer**,
   keeping its own contract and its own account number from the master file
   where the file assigns one.
3. Outlets sharing the **same licence** become **branches** under one customer.
4. Contracts and jobs **stay pointed at their correct legal entity**. Nothing is
   repointed across entities — which also keeps issued invoices and service
   reports intact (Art. VII §2).
5. The structure — group → customers → branches, with account numbers and
   contract counts — is shown in the validation report **before** any commit.

**[FACT, verified 19 Aug 2026] What implementing it established.**

- The master file holds **five** Sultan Al Arab outlets, not one: **11525**
  (Al Majas), **11662** (Al Barsha), **11663** (Business Bay), **11664**
  (Manipal), **11665** (Al Qusais). Four are spelled "SUL**TH**AN", which is why
  earlier passes found only one. No number needs minting for them.
- All five share TRN **104774977300003** — one tax registration, five outlets.
  **11662 is the parent**: the only one written "L.L.C" and the only one the file
  tags into SULTAN ALARAB GROUP.
- The six live records carry **no address, emirate, TRN or site row** and share
  the identical name. The live-record → outlet mapping **does not exist in the
  system** and can only come from the owner, by contract number. The five file
  rows are HELD until it does.
- **`contracts` has no branch reference — only `customer_id`.** Rule 3 above
  therefore cannot be applied without losing which outlet a contract covers.
  Until a branch reference exists on contracts, multi-outlet companies are
  structured under rule 2 (a customer each, held together by the group). Adding
  that reference is a schema change and needs its own decision.
- The master file has **no trade licence column**, so the platform cannot
  currently tell which outlets share a licence — only which share a TRN.
- This is general, not specific to one chain: **14 companies across 41 records**
  in the master file trade from more than one address under a single TRN.

**Import rules added to give effect to this (migration 098, `lib/domain/imports.ts`):**

- A file row whose group resolves to a live group that already has customers is
  **held**, never created blind — the importer cannot tell a new outlet from one
  already recorded.
- Every row sharing that row's TRN is held with it, so one legal entity is
  always mapped as a whole rather than half-imported.
- Group names reconcile on `fn_group_key` — case, spacing, punctuation and a
  trailing "GROUP" are not meaning, and nothing looser is ever matched.

## 14 — File is truth, legacy is history (RATIFIED 19 Aug 2026)

**Owner ruling, 19 Aug 2026.** The master file
(`merge/CUSTOMER_Master_MOP.xlsx`) is authoritative. Records that predate the
import are history and reconcile **to** the file, never the file to them.
Anything that cannot auto-reconcile is **flagged for the console**, never held
out of the import.

**Binding consequences, all implemented:**

1. **No reconciliation holds.** A row is imported and flagged; it is not held
   back. Holds move a decision into the import; flags leave it where the owner
   works. Replaces the hold rules added under §13.
2. **A malformed TRN never holds a customer out.** The number is dropped (a wrong
   tax number on an invoice is worse than none), the original string is written
   to the customer's notes so the office can correct it from the VAT certificate,
   and the customer is flagged `ASK: TRN`.
3. **File wins on conflicting fields.** A row matching an existing customer now
   *updates* that customer from the file instead of being skipped — but only
   where the file carries a value. A blank in the file means unknown and never
   erases what the office already knows (Art. VII §5).
4. **Groups follow the legal entity.** A row is attached to its group by its own
   `CUSTOMER_GROUP`, or by sharing a TRN with a row that has one — the file does
   not repeat the group name on every outlet (four of the five Sultan Al Arab
   rows carry no group tag). Reading a tax-registration number is exact; it is
   not name guessing.
5. **Reconciliation is a LINK, never a move** (`customers.reconciled_to_customer_id`,
   migration 100). A legacy record keeps every document ever issued against it.
   Repointing an issued invoice, a cash receipt or a service report would rewrite
   a finished record — an append-only violation (Art. VII §2) needing an
   amendment under Art. XII. The link gives the office the same single view of
   the business with nothing rewritten. **0 documents were moved.**

**[FACT, 19 Aug 2026] Result of applying it.** All **583** master-file customers
are live on 5-digit account numbers. **16** legacy records remain: **1** linked
(Calicut `CUST-0001` → `11193`, owner-directed) and **15** flagged for console
resolution. Auto-reconciliation matched **zero** of the six Sultan Al Arab legacy
records, because those records carry no address, no emirate, no TRN and an
identical name — there is nothing in the database to match on. Each therefore
keeps its own contract, exactly as the ruling requires.

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
| 1.7 | 3 Aug 2026 | §9.4 — Roadmap adjustment (owner): build the full revenue subledger first (invoice→receipt→credit note→AR→aging→cash flow) with NO GL posting, then one unified GL posting engine. Invoice subledger shipped (mig 034): AMTX/AMTX-OW numbering on issue, service-report gate, cancel keeps number reserved. |
| 1.8 | 3 Aug 2026 | §9.5 — Unified GL posting engine shipped (mig 037): deterministic, append-only, idempotent, balanced, settings-configurable postings for invoice/cancel/receipt/credit-note/refund; new ASSUMED accounts (1000/1100/2200/4000). Subledger complete (receipts mig 035, credit notes/refunds mig 036, AR & cash-flow reports). |
| 1.9 | 3 Aug 2026 | §10 — Recurring Contract Billing (mig 038): deterministic, idempotent date-driven invoice generation from contract terms; DB-enforced one-invoice-per-contract-per-period; daily Vercel Cron `/api/billing/run`; per-visit stays SR-gated; expired/cancelled never bill; per-cycle amount = contract services (ASSUMED). |
| 2.0 | 3 Aug 2026 | §11 — Security model: Supabase Auth + RBAC (6 roles, 28 permissions; profit/GL finance+management only, technicians none); external parties get scoped links, not logins; `withRequest` choke point with phased flip to live RLS under mop_app; offline field sessions; cron context via `fn_all_active_tenant_ids()` SECURITY DEFINER pinhole. Phase A1 shipped (mig 039): identity schema + helper, inert (no behaviour change). |
| 2.1 | 3 Aug 2026 | §11.4 — Security A2+A3 complete: reads migrated onto `scopedRead` + build-failing `pool.query` gate; RLS policy gaps closed (mig 040) + structural guard; login/invite UI; first admin provisioned; audit attributes the actor; auth enforcement + 51 permission guards behind fail-closed `AUTH_REQUIRED`; **A3 flip live — `withRequest` runs as `mop_app`, RLS is now the live boundary.** Gated on `rls_coverage.sql` (no tenant ⇒ zero rows), which passed before the flip. |
| 2.2 | 12 Aug 2026 | §11.7 — Technician app T1 (offline auth): device+server time provenance (Art. VII §4), Bearer re-auth on `/api/field/*`, token revocation with held-for-review (never discarded). **Ratified refinement:** mig 056 extends the `outbox_events` mutable-bookkeeping whitelist to `needs_review`/`review_reason`; event content stays immutable (Art. VII §1 holds). Recorded as a constitutional amendment per the owner's rule. |
| 2.3 | 19 Aug 2026 | §12 — **Customer account numbers switched to the 5-digit master scheme (11111–11827)**, ratified by the owner. CUST-0001…0600 burned and never reusable; new numbers continue from 11828 skipping any digit-0; every list and document displays the 5-digit number. Calicut → 11193; the six Sultan Al Arab records **merge** into 11662 (unique constraint ⇒ contracts/jobs repoint to the survivor, the other five archived, in one audited transaction). |
| **2.4** | **19 Aug 2026** | §13 — **Multi-outlet customers ruled (owner): group → customers → branches; the §12 Sultan Al Arab merge is superseded and NOT performed.** Each outlet keeps its own customer record, contract and account number; the group consolidates. Established while implementing: the master file holds five Sultan outlets (11525/11662/11663/11664/11665) sharing one TRN, 11662 the parent; the six live records are indistinguishable and are held pending an owner mapping by contract number; `contracts` has no branch reference, so licence-sharing outlets cannot become branches without a schema change; 14 companies across 41 file records share a TRN. |
| **2.5** | **19 Aug 2026** | §14 — **"File is truth, legacy is history" ratified (owner).** No reconciliation holds — import and flag. A malformed TRN is dropped, recorded in notes and flagged, never a hold. Matched rows are UPDATED from the file (file wins where the file has a value; blank never erases). Groups attach by legal entity (shared TRN) as well as by group name. Legacy records reconcile by LINK (mig 100), never by moving a document — 0 documents moved. All 583 master-file customers now live on 5-digit numbers; 16 legacy records remain, 1 linked and 15 flagged. |
