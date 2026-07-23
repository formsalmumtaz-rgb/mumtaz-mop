# CONSTITUTION.md
# MUMTAZ OPERATIONS PLATFORM (MOP)

**Status:** v1.1 — GOVERNING DOCUMENT
**Ratified:** 23 July 2026
**Owner:** Zaza — Mumtaz Integrated Services Group
**Build authorisation:** 🟢 **GRANTED for Sprint Zero scope only** (Art. XV §1). Nothing beyond that scope is authorised.

> **Note on numbering.** Articles I–XII retain their v1.0 numbers permanently. New material is appended as Articles XIII–XVI rather than renumbered, because task prompts and `CLAUDE.md` cite article numbers directly. **Article references are stable identifiers and are never reordered.** Art. X §5 (Proof-of-Work) will always be Art. X §5.

---

## PREAMBLE

This is the founding document of the MOP project. Every task, prompt, pull request, and design decision references it.

Documents governing this project:

| Document | Role |
|---|---|
| **CONSTITUTION.md** (this file) | *What we build and by what rules.* Changes rarely. Requires ratification. |
| **CONTEXT.md** (Annex A) | Technology research, cost analysis, event catalogue, data model, risk register |
| **EXECUTION.md** (Annex B) | Current sprint scope and task assignments |
| **DECISIONS.md** (Annex C) | Infrastructure and scope decisions record |
| **START-HERE.md** (Annex D) | Non-technical operating guide for the owner |
| **CLAUDE.md** | Repo-root brief loaded by Claude Code every session |
| **DEBT.md** (Annex E) | Documented technical debt. *To be created at Phase 0.* |

Anything not in one of these is a change request.

---

## ARTICLE I — ROLE AND MANDATE

The agent working on this project is not a coding assistant. It holds, simultaneously: Chief Software Architect, Lead Backend Engineer, Lead Frontend Engineer, Database Architect, DevOps Engineer, Product Designer, QA Engineer, Security Engineer, and Technical Writer.

**Standing duties:**

1. **Challenge poor architectural decisions** — including decisions written in this document. Silence is not consent; it is negligence.
2. **Never assume a business rule.** If a rule is unknown, stop and ask, or apply Art. X §4.
3. **Never claim work is complete without proof** (Art. X §5).
4. **Build for ten years, not for the next release** — subject to Art. V §1.
5. **Prefer maintainability over cleverness**, always.
6. **The owner is not a developer.** Explain in plain language. Never require the owner to read, write, or debug code. Distinguish clearly between decisions only the owner can make (business rules, priorities, money) and decisions the agent should make itself (technical implementation).

---

## ARTICLE II — MISSION AND SCOPE

### §1 Mission

Build the operating system for Mumtaz Group: a single integrated ERP and Field Service Management platform where **data is entered once and every downstream process updates automatically.** No duplicate entry. No manual reconciliation.

### §2 First vertical

**Pest Control.** Not because it is easiest, but because it is the most regulated, the most inventory-intensive, and the most compliance-heavy. A platform that survives pest control will survive cleaning.

### §3 Confirmed operating scale

| Figure | Value |
|---|---|
| Active AMCs (pest control) | ~300 |
| Technicians (pest control) | 10 |
| Teams at launch | 2 |
| Estimated jobs/day | 15–40 |
| Service records after 5 years | ~45,000 |

These are the numbers every capacity decision is made against. They are small, and that is an advantage: it means correctness costs nothing extra.

### §4 Scope of eventual verticals — see Art. V §2

### §5 The one-sentence test of success

> Zaza opens one screen and knows what is happening today, what it will earn, what it will cost, and what is at risk — and nobody in the office retypes anything a technician already entered.

---

## ARTICLE III — PHILOSOPHY

> Data should only be entered once.
> Every downstream process should update automatically.
> No duplicate entry.
> No manual reconciliation.
> **Automation first. AI last.**

**Core principles:**

```
Automation      >  AI
Mathematics     >  AI
Algorithms      >  AI
Rules           >  AI
Optimization    >  AI
Deterministic   >  Probabilistic
```

**P1 — Offline is the default state, not an error state.**
A technician in a basement car park, a villa compound, or a Mussafah warehouse has no signal. The field app must be **fully functional with zero connectivity for a complete working day** and reconcile on reconnect. Anything requiring a network round-trip to complete a job is a design failure, not a limitation.

**P2 — Cost must not scale with headcount or job count.**
A technician tapping "complete job" must cost AED 0.00 in inference and near-zero in infrastructure. Any dependency priced per-user or per-job requires written owner approval. Dependencies priced by data stored are acceptable.

**P3 — Capture once, at the point of truth.**
GPS is captured when the surveyor stands at the door. The photo is taken by the technician. The signature is on the technician's screen. Every downstream document is assembled from these primary captures — never re-keyed, never reconstructed.

---

## ARTICLE IV — AI POLICY

**AI may ONLY be used for:** natural-language search over analytics views · report and document summarisation · email and quotation drafting · trend explanation · assistant chatbot.

**AI is FORBIDDEN in:** scheduling · routing · inventory · chemical calculation · accounting and journal generation · payroll · pricing · any business rule · any operation on the critical path of a field job.

**The test:** if the AI layer is switched off entirely, the business must run normally. If it cannot, the AI has been put somewhere it does not belong.

---

## ARTICLE V — RULINGS ON THE DRAFT CONSTITUTION

Seven rulings made under the Art. I §1 duty to challenge.

### §1 — "Never generate prototype code. No technical debt. Build for ten years."

**Objection.** Taken literally, this converts an eight-week path to a technician holding a working app into an eighteen-month path to a beautifully architected system no technician has opened. The greatest risk is not bad architecture — it is **field adoption failure.**

**Ruling — the Two-Speed Rule:**

| Layer | Standard |
|---|---|
| **Schema, event model, ledger, audit log, security, IDs** | Ten-year grade. Migrations only. No shortcuts, ever. Expensive to get wrong — a bad schema is a rewrite. |
| **UI, workflows, screens, reports, checklists** | Production-quality but **explicitly disposable.** Expect to rewrite the technician screens twice after real field use. Cheap to get wrong; only learnable from reality. |

"No technical debt" is amended to **"no *undocumented* technical debt."** Every deliberate shortcut is logged in `DEBT.md` with an owner and a repayment trigger. Undocumented debt is a defect; documented debt is a decision.

### §2 — "One platform for pest, cleaning, FM, manpower, HVAC, water tank, landscaping, aviation, security."

**Objection.** Two of these are not the same kind of business.

- **Pest, cleaning, FM, HVAC, water tank, landscaping** share one shape: *dispatch a skilled crew with materials to a fixed site, on a recurring schedule, produce evidence, invoice.* One engine serves all six.
- **Manpower supply** is different: a worker is *deployed to a client for a period*, billed on timesheets, not dispatched to a job.
- **Aviation (Sapphire)** is not field service at all — enrolment and student lifecycle. It shares no operational concepts with a pest control route.

**Ruling — Platform Services vs. Vertical Engines:**

```
┌─────────────────────── PLATFORM SERVICES ───────────────────────┐
│  Identity & RBAC · Customers · Contracts · Documents · Finance  │
│  & Ledger · HR · Assets · Notifications · Audit · Analytics     │
└─────────────────────────────────────────────────────────────────┘
        ▲                      ▲                      ▲
┌───────┴────────┐   ┌─────────┴────────┐   ┌─────────┴────────┐
│ FIELD SERVICE  │   │  DEPLOYMENT      │   │  ENROLMENT       │
│ pest, cleaning,│   │  manpower supply │   │  aviation        │
│ FM, HVAC, tank,│   │  (later)         │   │  (separate app)  │
│ landscaping    │   │                  │   │                  │
└────────────────┘   └──────────────────┘   └──────────────────┘
```

The Field Service Engine is **service-line agnostic from day one** — job types, checklist templates, treatment recipes, pricing rules, report templates and compliance rules are **data, not code.** Adding "cleaning" must be configuration, not development.

`tenant_id` and `service_line_id` exist from the first migration.

### §3 — "Accounting: no manual journal entries."

**Objection.** Wrong as stated, and it would produce unauditable books. No ledger closes without accruals, prepayments, depreciation, provisions, opening balances, corrections and auditor-proposed entries. A system forbidding them will be bypassed with a parallel spreadsheet — the exact disease this platform cures.

**Ruling.** Amended to **"no manual journal entry for any transaction the system already knows about."**

- Operational transactions post automatically from events. An accountant may **never** hand-key these.
- Adjusting entries go through a **controlled path**: templated where possible, maker-checker approval, mandatory reason, fully audit-logged, reportable as a distinct class.
- The ledger is **append-only.** Corrections are reversing entries, never edits.
- `debits = credits` is enforced by a database constraint, not application code.

### §4 — "Clean Architecture, SOLID, Repository Pattern, Dependency Injection."

**Objection.** Right instincts, wrong target. Repository interfaces exist to let you swap Postgres for MongoDB. **We never will** — we build deliberately *on* row-level security, `pg_cron`, PostGIS and constraints. An abstraction hiding Postgres forfeits the features we chose it for and triples the code a one-to-two person team maintains.

**Ruling.**
- **Adopted:** modular monolith with hard module boundaries · feature-based structure · strong typing end to end · dependency inversion at genuine seams (payment providers, e-invoicing ASP adapter, messaging channel, routing engine — these *will* be swapped) · DRY · KISS · tests · documentation.
- **Rejected:** repository interfaces over the primary database · pass-through service layers · DI containers.
- **Binding rule instead:** *no module may read another module's tables directly.* Cross-module access is by published function or domain event.

### §5 — "JWT, refresh tokens, RBAC."

**Objection.** Incomplete. Role-based access alone cannot express "this technician sees only his jobs today" or "this customer sees only their own reports." That is row-level, not role-level.

**Ruling.** Two mandatory layers:
1. **Postgres Row-Level Security** as enforcement backstop — in the database, so an application bug cannot leak data.
2. **Application-layer authorisation** as the primary gate, producing clean errors.

Every RLS policy is tested with a **non-privileged user** as a condition of merge. An untested policy is assumed broken. Technician sessions must survive a full offline day without forced re-authentication (P1).

### §6 — "Support 100,000 customers, millions of records, hundreds of technicians."

**Objection.** Half is free, half is not. Postgres handles 100,000 customers and millions of records with no special design. **Hundreds of technicians is the expensive half**, changing the offline-sync architecture.

**Ruling.** Schema designed for the full target now (free). Sync infrastructure designed for actual scale, with a pre-declared migration trigger.

> **Settled by Art. II §3:** with **10 technicians**, the trigger of 20 concurrent field users is not met. **Hand-rolled sync — Dexie.js/IndexedDB plus an explicit outbox queue — is confirmed and will remain correct for years. PowerSync is off the table until headcount doubles.**

### §7 — Missing from the draft entirely

- **Offline-first** — Art. III P1. The highest-risk engineering item.
- **UAE e-invoicing (Peppol / PINT AE)** — a legal deadline, not a feature. Under AED 50M: appoint an Accredited Service Provider by **31 March 2027**, live by **1 July 2027**. The invoice schema is born structured; customer master data (legal name, TRN, place of supply, free-zone status, Peppol ID) is a **compliance obligation.** Verify current dates with the FTA before Phase 3.
- **Data protection (UAE PDPL)** — technician GPS traces and premises photographs are sensitive personal data. Lawful basis, retention limits and access control are schema-level concerns. *(Legal drafting: owner's parallel track.)*
- **Arabic / RTL** — not a layer added at the end. Every customer-facing artefact renders correct RTL Arabic from Phase 1.

---

## ARTICLE VI — SYSTEM MAP

### §1 Platform services (built once, used by everything)
Identity & Access · Users & Permissions (RBAC + RLS) · Audit Log · Notifications · Document Management & Templates · Settings & Configuration · Public API · Approval Workflow · Search

### §2 Shared business modules
CRM & Customer Management · Contracts · Quotations · Finance & Accounting · HR · Assets & Fleet · Compliance · Complaints · Analytics · Dashboard · Reports

### §3 Field Service Engine (service-line agnostic)
Survey · Scheduler · Route Optimisation · Technician App · Inventory & Warehouse · Chemical / Materials Engine · Job & Service Records

### §4 Target users
Administrator · Managing Director · Operations Manager · Sales Manager · Surveyor · Sales Representative · Warehouse Staff · Technician · Driver · HR · Finance · Accountant · Customer · Auditor · Municipality Inspector

**Customer, Auditor and Municipality Inspector are external and get no login.** They receive scoped, expiring, tamper-evident links. Binding security decision.

---

## ARTICLE VII — DATA AND EVENT DOCTRINE

### §1 Event-driven, not module-to-module

Modules never call each other directly. They emit and consume **domain events** through a durable log.

**Implementation: transactional outbox in Postgres.**
- Business write and event insert occur in the **same transaction.** An event can never exist for a job that did not save, and vice versa.
- Consumers are **idempotent**, keyed by `event_id`. Replay must never double-deduct stock or double-post a journal.
- Events are **append-only and replayable.**
- No Kafka, RabbitMQ or SQS. Postgres is the bus until it demonstrably is not.

Canonical chain: `ContractSigned → CustomerCreated → ServiceScheduled → InventoryReserved → RouteGenerated → TechnicianAssigned → ServiceStarted → InventoryConsumed → ServiceCompleted → InvoiceGenerated → PaymentReceived → LedgerUpdated → DashboardUpdated`. Full catalogue: Annex A §7.

**Test of a new feature:** *what event does it emit or consume?* If the answer is "none, it reads one table and writes another," it is probably a boundary violation.

### §2 Immutability

Append-only without exception: service records · ledger entries · stock movements · cash receipts · audit log · generated customer documents. Corrections are new signed reversing entries. Soft delete applies to *master data* only (customers, items, employees) — never to transactions.

### §3 The database is the system of record

No business truth lives in a spreadsheet, a PDF, a WhatsApp thread, or a person's memory. Every report and PDF is a **rendered projection** of database rows, regenerable at any time.

### §4 Conflict rules

- Every client command carries a **client-generated UUID**; replays deduplicate server-side.
- **Last-write-wins is forbidden** for stock and money — append-only deltas reconciled by summation.
- Last-write-wins acceptable for descriptive fields with `updated_at`.
- Offline records store **both** device timestamp and server receipt timestamp. Reports use device time; audit uses both.

### §5 Data entering the system from outside

**Binding: bulk imports never write directly to live tables.**

```
File → staging tables → validation → dry-run report → owner approves → commit → audit log
```

The dry-run report states rows accepted, rows rejected with per-row reasons, duplicates flagged for human decision, and blank-field counts per column. Rollback by import batch ID. Idempotent — importing the same file twice must not duplicate records. **Blank means unknown; never substitute a default for a missing value.**

---

## ARTICLE VIII — SECURITY

Row-Level Security (mandatory, tested with a non-privileged user) · application-layer authorisation · short-lived access tokens with refresh rotation · encryption in transit and at rest · full audit log of who-changed-what-when · maker-checker approval on financial adjustments and contract changes · version history on documents and contracts · scoped expiring links for external parties · **tested backups.**

**Binding:** a backup that has never been restored is not a backup. A restore is tested in Phase 0 and at every phase boundary.

---

## ARTICLE IX — STANDARDS

**Code:** modular monolith · feature-based structure · strong typing end to end · shared domain types and event schemas defined **once** and imported everywhere · migrations only, never dashboard edits · tests on business rules (chemical calculation, ledger balancing, schedule generation are non-negotiable test targets) · documentation as part of Done.

**UI:** professional · minimal · enterprise · fast · mobile-first for field, desktop-first for office · tablet supported · dark mode · **and the field app is measured in taps-to-complete-a-job, which is the only UI metric that decides whether this project succeeds.**

**Media:** photographs are compressed on-device before upload — max 1600px, WebP, target ~150 KB. **Binding, not optional:** at 25 jobs/day this is the difference between ~675 MB/year (14 years inside the free tier) and ~9 GB/year (13 months). Full resolution retained 12 months, thumbnails indefinitely, subject to a `retain_until` column.

**Performance:** 100,000 customers, millions of service records, thousands of daily jobs without architectural redesign. Subject to Art. V §6.

---

## ARTICLE X — DEVELOPMENT PROCESS AND GOVERNANCE

### §1 Never build the whole system at once
Phased delivery. Each phase includes requirements, architecture, database, API, backend, frontend, testing and documentation. **A phase ends only on written approval from the owner.**

### §2 Blueprint before code
No implementation begins on a phase until its architecture is stated and approved: module boundaries · schema · event model · API strategy · security model · deployment · implementation order.

### §3 Phase gates
Every phase has a **single hard exit criterion**, true or false with no interpretation (Art. XV).

### §4 Business rules are never invented — *ratified amendment*

An agent may not invent a business rule. Where a rule is unknown, one of two paths applies:

1. **Ask the owner** — for rules that are consequential and cheap to answer.
2. **Seed as `ASSUMED`** — the value is stored as data, marked `ASSUMED`, rendered with a visible flag in the admin console, and **editable by the owner without a code deploy.** Confirmation clears the flag and writes to the audit log.

**This is why the Admin Console (Art. XIII §3) is on the critical path.** Without it, every unknown rule requires a deployment to correct, and the `ASSUMED` strategy fails.

**Never present an assumption as a fact.** An unflagged invented rule is a defect of the same severity as data loss.

### §5 Proof-of-Work Protocol — mandatory

Any claim that a task is complete must include, in the same message:

1. `git diff --stat`
2. Build/test output showing a pass
3. The **commit hash**
4. Confirmation of push

**A completion claim without all four is treated as not done, regardless of how confident it sounds.** This rule exists because it has already been violated on a previous project in this organisation.

### §6 Definition of Done

- [ ] Migration written and applied
- [ ] RLS policy written and tested with a non-privileged user
- [ ] Events emitted are defined in `packages/domain`; consumers idempotent
- [ ] Works offline where Art. III P1 requires it
- [ ] Arabic/RTL correct where customer-facing
- [ ] Error states designed, not just the happy path
- [ ] Proof-of-Work supplied
- [ ] Owner has used it on a real phone

---

## ARTICLE XI — WHAT WE WILL NOT BUILD

- ❌ Full payroll calculation and WPS filing (four licence entities — its own project). We store, we export.
- ❌ A general accounting package. Operational ledger and statements, yes; fixed-asset registers and multi-currency consolidation, no.
- ❌ An Accredited Service Provider for e-invoicing. We integrate with one.
- ❌ Native iOS/Android apps until a PWA-shaped limitation actually bites.
- ❌ Real-time second-by-second telematics. Periodic GPS from the technician's phone.
- ❌ Customer self-service booking in v1. Customers get a scoped link; booking stays human.
- ❌ Aviation or manpower supply inside the Field Service Engine (Art. V §2).
- ❌ AI anywhere on the operational critical path (Art. IV).

---

## ARTICLE XII — AMENDMENT

Amended only by the owner, only with a version bump and a changelog entry. An agent may **propose** amendments — and under Art. I §1 is obliged to when it believes a provision is wrong — but may never act as though an unratified amendment is in force.

---

## ARTICLE XIII — INFRASTRUCTURE *(new in v1.1)*

### §1 Decided stack

| Layer | Decision |
|---|---|
| **Dev database** | Postgres 16 + PostGIS, local Docker |
| **Staging database** | Supabase free project |
| **Production database** | Supabase Pro, $25/mo — created the day a real technician's work depends on it, not before |
| **Region** | Closest available to the UAE. Mumbai preferred, Frankfurt fallback. **Never a US default. Cannot be changed later without migration.** |
| **App hosting** | Vercel — Hobby now, Pro when commercial |
| **Background workers** | Existing DigitalOcean VPS, PM2 |
| **Photo storage** | Cloudflare R2 |
| **Auth** | Supabase Auth — phone OTP for technicians, email for office |
| **Repo** | GitHub, private, single monorepo |

**Why we pay for Pro:** backups and the 7-day inactivity pause — not capacity. At 300 customers, capacity is irrelevant. The ledger is the company.

**Escape hatch:** if a client imposes UAE data residency, self-hosted Supabase on the DigitalOcean VPS is the documented answer. Nothing in this stack blocks it.

### §2 Rejected

Google Maps Platform for routing or matrix (cost scales with operations) · Kafka/RabbitMQ/SQS (Postgres is the bus) · Google Sheets or any spreadsheet as a database (no transactions, no constraints, no RLS — Art. VII §1 and Art. V §3 are impossible on it) · PowerSync at current scale (Art. V §6).

### §3 Admin Console — on the critical path

CRUD over customers, branches, contacts, contracts, items, **treatment recipes**, teams, technicians, users, service lines and settings. Map pin picker for branch GPS. Every `ASSUMED` value renders with a warning badge and a confirm action. Every write goes through the domain layer and is audit-logged.

This is not a convenience feature. It is the mechanism that makes Art. X §4 work.

---

## ARTICLE XIV — MODULE BOUNDARIES AND BUILD SEQUENCING *(new in v1.1)*

### §1 Ruling: invoicing and agreements

**One database, one repository, one platform. Separate modules, not separate systems. Phased in time, not split in architecture.**

An invoice requires customer legal name and TRN (CRM), contract terms and VAT treatment (Contracts), proof of delivery (Jobs), and payment status (Ledger). All four live here. Building invoicing as a separate system means **synchronising customers, contracts and job completion across a boundary** — creating a sync problem, a reconciliation problem, and two versions of the truth. That violates Art. III on day one.

**Separating systems does not reduce complexity. It relocates complexity into the integration, which is the most expensive place to put it.**

An "agreement module" is not a system at all — it is document generation over the `contracts` table, using the existing bilingual EN/AR templates.

### §2 The general rule

> **Build the table early. Build the module late.**

Schema is cheap now and expensive later; modules are expensive now and cheap later. The `invoices` table with the full PINT AE field set costs an hour today; retrofitting those fields after a year of live invoices is a data migration under a legal deadline (Art. V §7).

| Item | Sprint Zero | Phase 2 | Phase 3 |
|---|---|---|---|
| `invoices` / `invoice_lines` tables, PINT AE fields | ✅ | | |
| Invoice row queued on `job.completed` | ✅ | | |
| Contract → agreement PDF generation | | ✅ | |
| Invoice PDF, numbering, VAT, credit notes | | | ✅ |
| AR ageing, statements, dunning | | | ✅ |
| e-invoicing ASP adapter | | | ✅ |

Boundaries are enforced by Art. V §4: invoicing consumes `job.completed` and calls published contract functions. It never issues a SELECT against `jobs`.

---

## ARTICLE XV — ROADMAP *(new in v1.1)*

### §1 Sprint Zero — demo target 27 July 2026

**The Golden Thread:** contract activated → schedule and jobs auto-generate → technician completes a job **in airplane mode** → PDF report generated on device → syncs on reconnect → stock deducted, invoice queued, dashboard updates.

**Exit criterion:** the thread runs end to end on a real phone with real customer data, with the radio switched off during the job.

**Excluded:** route optimisation · full inventory · HR · payroll · full ledger · complaints · compliance registers · analytics · AI · Arabic UI (Arabic on the report PDF only).

### §2 Phases and exit criteria

| Phase | Duration | Exit criterion | Bound by |
|---|---|---|---|
| **0** Foundations | 2–3 days | An event emitted in a transaction is provably consumed exactly once by two independent handlers; a restore from backup succeeds | compute |
| **1** Field proof | 3 weeks | **One pest control team runs one full week entirely on the platform with paper switched off**, and every job has a photo, a signature and a retrievable report | **calendar** |
| **2** Front of funnel | 2 weeks | A signed contract produces a 12-month schedule and invoice schedule with zero manual entry | owner decisions |
| **3** Money & materials | 4 weeks | A month closes from the system — P&L, VAT return, AR ageing — reconciling to the bank with no spreadsheet | chart of accounts |
| **4** Fleet, HR, compliance | 3 weeks | No compliance document expires without 30 days' warning having fired | municipality confirmation |
| **5** Insight | 1 week | Owner answers "which contracts lose money?" in under 30 seconds | compute |
| **6** AI layer | 1 week | The AI layer can be switched off entirely and the business runs normally | compute |

**Total: ~4 months.**

### §3 The real constraint

Agent compute compresses building by roughly 10–20×. It compresses **nothing** in five places: owner review bandwidth · calendar time in the field · third-party latency (WhatsApp verification, ASP onboarding, municipality confirmation) · physical device and site reality · schema decisions that cannot be undone.

**The bottleneck of this project is the owner, not engineering.** Unreviewed output at 20× speed produces 20× the wrong architecture before anyone notices. Hitting four months requires protecting owner review time daily and enabling the Operations Manager to answer operational rules — not more compute.

This is Risk R7 in Annex A, and it is the risk most likely to be realised.

---

## ARTICLE XVI — OPERATING MODEL *(new in v1.1)*

### §1 The tools do not talk to each other

There is no mechanism by which Cowork hands a task to Claude Code, or by which either takes over from the other. **The owner is the integration point. Files are the interface.**

```
        ┌──────────────── OWNER ───────────────┐
        │                                      │
    assigns C-tasks                      assigns K-tasks
        │                                      │
        ▼                                      ▼
   ┌─────────┐                           ┌───────────┐
   │ COWORK  │  writes CSV → owner copies│  CLAUDE   │
   │ mounted │      into repo /seed  →   │   CODE    │
   │ folder  │                           │   repo    │
   └─────────┘                           └───────────┘
   no repo access                        no access to
   no git, no terminal                   Cowork's folder
```

### §2 Task naming

**K-tasks** → Claude Code (build, inside the repo). **C-tasks** → Cowork (data and documents, outside the repo).

### §3 Division of labour

| | Claude Code | Cowork |
|---|---|---|
| Owns | Everything inside the repo | Everything outside it |
| Why | Codebase awareness, terminal, Git — Art. X §5 requires `git diff` and a commit hash, which exist only here | No Git or terminal, but built for document- and file-heavy work: extracting, cleaning, structuring, drafting |
| Typical work | Schema, migrations, apps, tests, imports | Customer master cleaning, recipe tables, legal drafting, SOPs, demo scripts |

**Both must be given the governing documents.** Claude Code reads `CLAUDE.md` at the repo root automatically. Cowork cannot see the repo — the constitution must be **copied into its mounted folder.**

### §4 Sequencing rule

**Cowork's output is Claude Code's input.** Data tasks start before build tasks. Starting them in the wrong order costs a day.

---

## CHANGELOG

| Version | Date | Change |
|---|---|---|
| 1.0 | 23 Jul 2026 | Ratified. Merged draft Project Constitution with CONTEXT.md v0.1. Seven rulings under Art. V. |
| **1.1** | **23 Jul 2026** | Operating scale confirmed (Art. II §3) — settles Art. V §6 in favour of hand-rolled sync. Art. X §4 amendment ratified (`ASSUMED` defaults + admin console). Bulk import doctrine added (Art. VII §5). Photo compression made binding (Art. IX). Owner-is-not-a-developer duty added (Art. I §6). Four new articles: XIII Infrastructure, XIV Module Boundaries (invoicing/agreements ruling), XV Roadmap (revised to ~4 months), XVI Operating Model. Build authorised for Sprint Zero. Article numbers I–XII frozen as stable identifiers. |
