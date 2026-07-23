# CONTEXT.md — Mumtaz Integrated Operations Platform (MIOP)

**Document type:** Context brief + Architecture plan + Project kickoff, in one file
**Version:** 0.1 (Planning — NOT approved for build)
**Date:** 23 July 2026
**Owner:** Zaza — Mumtaz Integrated Services Group
**Status:** 🔴 PLANNING ONLY. No code is to be written against this document until Section 16 (Open Questions) is closed out and the version is bumped to 1.0.

---

## 0. How to use this document

This file is the **single source of truth** for the MIOP project. It is designed to be:

1. **Pasted as context** at the start of any Claude Code / agent session on this repo.
2. **Read by a new developer** on day one to understand the entire system without a meeting.
3. **The contract** against which "is this done?" is judged.

If something contradicts this file, this file wins until this file is edited. Edits require a version bump and a changelog line at the bottom.

**What this document is not:** it is not the customer-facing legal/agreement documentation. That workstream (service agreements, data-processing terms, SLA annexes, customer consent for GPS/photo capture) is owned by Zaza separately and is referenced here only where it constrains the build (see §4.6).

---

## 1. Cover brief

### 1.1 What we are building

A single operating system for Mumtaz Integrated Services Group that replaces the current patchwork of WhatsApp, Excel, Google Sheets, the Apps Script PWA, and manual accounting with one event-driven platform covering the full lifecycle:

> **Lead → Survey → Quotation → Contract → Schedule → Route → Service → Report → Invoice → Payment → Ledger → Renewal**

Every action in the field creates data automatically. Nobody enters the same data twice.

### 1.2 Why now

| Driver | Detail |
|---|---|
| **Regulatory deadline** | UAE mandatory e-invoicing (Peppol / PINT AE). Businesses under AED 50M revenue must appoint an Accredited Service Provider by **31 March 2027** and be live by **1 July 2027**. PDF invoices stop having compliance value. Our invoice module must be born structured. |
| **Margin visibility** | Currently profit-per-contract and profit-per-route are unknown. They are the two numbers that decide which contracts to renew and which to walk away from. |
| **Cash leakage** | Technician cash collection, fuel spend, and chemical consumption are reconciled manually and late. |
| **Compliance load** | Three municipalities (Dubai, Sharjah, Abu Dhabi) + ISO 9001/14001/45001 audits. Evidence is currently reconstructed after the fact instead of being generated as a by-product of work. |
| **Scale ceiling** | The company cannot add technicians without adding office staff. That is the constraint the platform removes. |

### 1.3 Design philosophy (from the source brief, adopted verbatim)

> **AI is the last 5%, not the first 95%.**

Scheduling, routing, chemical dosage, inventory, and accounting are **deterministic problems** with known-correct answers. They get rules, formulas, solvers, and SQL. AI is layered on top only for summarisation, natural-language query, drafting, and anomaly flagging — where a wrong answer is an inconvenience, not a liability.

A technician tapping "complete job" must cost **AED 0.00** in inference. Non-negotiable.

### 1.4 Headline numbers

| Item | Figure |
|---|---|
| Target infrastructure cost, Year 1 | **< USD 60 / month** (see §11) |
| Target infrastructure cost at 50 technicians | **< USD 150 / month** |
| Modules | 17, grouped into 6 domains, delivered in 6 phases |
| Phase 1 (usable in the field) | Target **8–10 weeks** from kickoff |
| Full scope | Target **9–12 months** |
| Hard external deadline | ASP appointment **31 Mar 2027**; e-invoicing live **1 Jul 2027** |

### 1.5 Definition of success (one sentence)

> Zaza opens one screen on his phone in the morning and knows — without asking anyone — what is happening today, what it will earn, what it will cost, and what is at risk. And no one in the office retypes anything a technician already entered.

---

## 2. Business context

### 2.1 The company

- **Mumtaz Integrated Services Group** (Al Mumtaz Building Cleaning & Pest Control), established 2006.
- Licence 546486. ISO 9001 / 14001 / 45001. Triple municipality approval: Dubai, Sharjah, Abu Dhabi.
- Three divisions: **Pest Control**, **Cleaning Crew**, **Facilities Management**.
- Three offices: Sharjah HQ (Estiqlal St), Dubai (Hashmi Office Tower, Deira), Abu Dhabi (Mussafah).
- Toll free 800 688 · info@almumtaz.ae · Brand red `#A31E22`.
- Payroll runs across four licence entities (Al Mumtaz, Al Iman, Wadi Al Nsoor, Nashir Facilities) under WPS.

### 2.2 Existing assets we build on or retire

| Asset | Disposition |
|---|---|
| **Mumtaz Field Ops PWA** (mumtazops.netlify.app, Apps Script + Google Sheets, 14-tab schema, signature pads, jsPDF → Drive) | **Retire.** But harvest: the 14-tab schema is a real, battle-tested domain model. It becomes the starting point for §8. Sheets data is migrated, not abandoned. |
| **DigitalOcean VPS** (running the AI content engine, PM2, Node.js) | **Reuse.** Becomes the host for self-hosted routing (OSRM/VROOM) and background workers. Marginal cost ≈ 0. |
| **Mumtaz website** (Next.js 14 App Router, Tailwind, Framer Motion, Supabase, Vercel) | **Reuse the stack and the Supabase project pattern.** Website stays separate; MIOP is its own project. Web enquiry forms will POST into MIOP as leads. |
| **Imtithāl** compliance-SaaS concept (Dubai Municipality regulated services, tamper-evident service records, two-sided customer link) | **Fold in as a design principle, not a separate product — for now.** MIOP's service records are built tamper-evident from day one, so Imtithāl can later be spun out as a productised layer over the same schema. This is a deliberate strategic option, not scope creep. |
| **Existing quotation / contract templates** (bilingual EN/AR, RTL-correct) | **Reuse as document templates** in the Contract Engine. |

### 2.3 Who this is for

| Role | Primary surface | Cares about |
|---|---|---|
| **Technician** | Mobile PWA, offline-first | Today's list, navigation, fast completion, no typing |
| **Team leader / driver** | Mobile PWA | Route, vehicle, stock on van |
| **Ops Manager (Sahar Said)** | Desktop console | Scheduling, exceptions, technician availability, complaints |
| **BD (Sahad Saleem)** | Desktop + mobile survey app | Leads, surveys, quotations, renewals |
| **Accounts** | Desktop console | Invoices, receipts, ledger, VAT return, WPS |
| **Zaza (owner)** | Mobile dashboard | The one screen. Cash, margin, risk. |
| **Customer** | Emailed/WhatsApp link — no login | Their service history, reports, certificates, invoices |

---

## 3. Architecture doctrine

Seven rules. Every design decision is checked against these.

### D1 — Deterministic first, AI last
If the answer can be computed, compute it. AI is confined to §Module 17 and may never sit in the critical path of a field operation. If the AI layer is down, the business runs normally.

### D2 — Event-driven, not module-to-module
Modules never call each other directly. They emit and consume **domain events** through a durable log in Postgres. `service.completed` is emitted once; inventory, invoicing, payroll, and the dashboard each react independently. This is what keeps the system synchronised without nightly reconciliation, and what lets us build modules in any order.

**Implementation:** transactional outbox pattern.
- Business write and event insert happen in the **same Postgres transaction** (so an event can never exist for a job that didn't save, and vice versa).
- A worker drains the outbox and dispatches to handlers.
- Handlers are **idempotent** and keyed by `event_id` — replaying an event twice must not double-deduct stock or double-post a journal.
- No Kafka. No RabbitMQ. No SQS. Postgres is the bus until it demonstrably isn't.

### D3 — The database is the system of record; every screen is a projection
No business truth lives in a spreadsheet, a PDF, a WhatsApp thread, or someone's head. Reports and PDFs are **rendered views** of database rows, regenerable at any time.

### D4 — Append-only where it matters
Service records, ledger entries, stock movements, and cash receipts are **never updated or deleted**. Corrections are new, signed, reversing entries. This gives us: audit defensibility for ISO and municipality, a real double-entry ledger, and forensic answers to "who changed this?".

### D5 — Offline is the default state, not an error state
A technician in a basement car park, a villa compound, or a Mussafah warehouse has no signal. The app must be **fully functional with zero connectivity** for a whole working day and reconcile on reconnect. Anything that requires a round-trip to complete a job is a design failure.

### D6 — Capture once, at the point of truth
GPS is captured when the surveyor stands at the door — not typed by an office clerk later. The photo is taken by the technician, not emailed. The signature is on the technician's screen. Every downstream document is assembled from these primary captures.

### D7 — Free and open by default, paid only where it buys reliability
Every dependency must have an escape hatch: either it is open source and self-hostable, or its data is exportable and its role is replaceable in under a week. We will pay for exactly two things without argument: managed Postgres with backups, and object storage. Everything else must justify itself.

---

## 4. Non-negotiable constraints (UAE-specific)

These are not preferences. They are the hard edges of the box.

### 4.1 E-invoicing (the biggest one)

The UAE is moving to a Peppol-based decentralised model (often called the 5-corner model), with invoices exchanged as structured XML in the **PINT AE** specification (a UAE extension of Peppol/UBL) through an **Accredited Service Provider (ASP)**, with tax data reported to the FTA in near real time. Legal basis: Ministerial Decisions 243 & 244 of 2025; penalties under Cabinet Decision 106 of 2025.

**Timeline as it applies to Mumtaz (revenue < AED 50M):**

| Date | Requirement |
|---|---|
| 1 July 2026 | Voluntary/pilot phase open (already live) |
| **31 March 2027** | **Appoint an Accredited Service Provider** |
| **1 July 2027** | **Mandatory e-invoicing live** |

**Design implications — build these in from day one, do not retrofit:**
- The invoice table must carry every PINT AE mandatory field. FTA technical guidance (Feb 2026) specifies roughly 51 mandatory fields for an electronic tax invoice and 49 for a commercial e-invoice — seller/buyer identification, tax breakdowns, line-level detail, document totals.
- Participant identifier is the **TIN** = first 10 digits of the corporate tax registration number, in Peppol format `0235:<TIN>`.
- **Customer master data quality becomes a compliance issue.** Legal name, TRN, address, place of supply, free-zone status, and eventually the customer's Peppol ID must be structured fields with validation — not free text. This is the single highest-value thing we can get right early.
- B2C is currently excluded from the mandate. Our data model must still distinguish B2B / B2G / B2C per customer.
- The ASP is an **integration point, not a rebuild**: MIOP generates a compliant invoice object; an adapter serialises it to PINT AE XML and hands it to the ASP. Keep that adapter behind an interface.

> ⚠️ Verify these dates against the FTA / Ministry of Finance before committing engineering time — the AED 50M-and-above ASP deadline was already moved once (from 31 July to 30 October 2026).

### 4.2 VAT
5% standard rate. Tax invoice format requirements, credit notes, and the reverse-charge / zero-rating cases (export of services) must be first-class in the ledger, not bolted on. Quarterly VAT return should be a report, not a spreadsheet exercise.

### 4.3 Corporate tax
Registration, 9% above the threshold, Small Business Relief where applicable. The ledger must be able to produce a defensible P&L per licence entity.

### 4.4 WPS and multi-entity payroll
Four licence entities. The HR module must keep employees attached to the correct entity and produce WPS-format SIF files. **Note: this is the module most likely to be better solved by buying rather than building** — see §14.

### 4.5 Municipality & ISO
- Pest control service frequency, chemical usage, and MSDS availability are inspectable.
- Service records must be tamper-evident and reproducible on demand.
- Chemical registration/approval status per emirate differs. Model chemicals with per-emirate approval flags and expiry dates.
- ISO 9001/14001/45001 audit evidence should fall out of normal operation, not be assembled the week before the audit.

### 4.6 Data protection & customer-facing legal (Zaza's workstream — but constrains the build)
- UAE PDPL: personal data (technician Emirates ID, passport, customer contacts, GPS traces) needs a lawful basis, retention limits, and access control.
- **Photographs of customer premises and GPS traces of technicians are both sensitive.** The customer service agreement needs a clause permitting site photography for service-evidence purposes; the employment/HR policy needs a clause covering GPS tracking during working hours.
- Data residency: no hard UAE-residency requirement for a private company today, but a customer (especially a government or bank client) may impose one contractually. **Keep the option open** — this is a reason to favour self-hostable components (D7).
- The customer-facing report/certificate is a legal artefact. Its content and wording sit with Zaza; the platform's job is to render it faithfully and immutably.

### 4.7 Language
Arabic is not a translation layer added at the end. Customer-facing documents (reports, certificates, invoices, contracts) must render correctly in RTL Arabic from Phase 1. Internal UI can be English-first. Existing bilingual contract templates with correct RTL rendering already exist — reuse that work.

---

## 5. System architecture

### 5.1 Layers

```
┌──────────────────────────────────────────────────────────────┐
│  SURFACES                                                    │
│  Technician PWA │ Survey App │ Ops Console │ Owner Dashboard │
│  (offline-first)│ (offline)  │ (desktop)   │ (mobile)        │
│                          Customer Link (no login)            │
└──────────────────────────────────────────────────────────────┘
                              │
┌──────────────────────────────────────────────────────────────┐
│  API / DOMAIN LAYER                                          │
│  Command handlers · validation · authorisation (RLS)         │
│  Everything writes through here. Nothing writes raw.         │
└──────────────────────────────────────────────────────────────┘
                              │
┌──────────────────────────────────────────────────────────────┐
│  EVENT LOG (transactional outbox, Postgres)                  │
│  append-only · idempotent consumers · replayable             │
└──────────────────────────────────────────────────────────────┘
        │            │             │            │
   ┌────▼───┐  ┌─────▼────┐  ┌────▼─────┐ ┌────▼──────┐
   │Schedule│  │Inventory │  │ Finance  │ │Compliance │
   │& Route │  │& Stock   │  │ & Ledger │ │& Docs     │
   └────────┘  └──────────┘  └──────────┘ └───────────┘
                              │
┌──────────────────────────────────────────────────────────────┐
│  DETERMINISTIC ENGINES                                       │
│  Scheduler (rules) · Route optimiser (VROOM) ·               │
│  Chemical calculator (formulas) · Ledger (double-entry)      │
└──────────────────────────────────────────────────────────────┘
                              │
┌──────────────────────────────────────────────────────────────┐
│  AI LAYER (thin, optional, non-blocking)                     │
│  summarise · natural-language query · draft · flag anomalies │
└──────────────────────────────────────────────────────────────┘
```

### 5.2 The nightly and hourly clock

| Job | Cadence | What it does |
|---|---|---|
| Schedule generator | 00:05 daily | Reads contracts, frequencies, holidays, leave, skills → creates tomorrow's jobs |
| Route optimiser | 00:20 daily | Batches jobs by team/vehicle → calls VROOM → writes ordered routes |
| Reminder sweep | 06:00 daily | Contract renewals, municipality deadlines, chemical expiry, vehicle registration/insurance, visa/EID expiry |
| Invoice run | 01:00 daily | Generates invoices due per contract schedule |
| Ageing / AR | 02:00 daily | Recomputes receivables buckets, flags overdue |
| Outbox drain | continuous (~5s) | Dispatches domain events |
| Dashboard rollups | 15 min | Materialised views refresh |

All of these are plain cron + SQL. None involve AI.

### 5.3 Idempotency & conflict rules (write these down before coding)

- Every command from a client carries a **client-generated UUID**. Replays are deduplicated server-side. A technician tapping "complete" four times on a flaky connection creates one completion.
- **Last-write-wins is banned** for stock and money. Stock movements and ledger entries are append-only deltas; two technicians consuming from the same van reconcile by summation, not by overwrite.
- For descriptive fields (job notes, customer contact), last-write-wins with `updated_at` is acceptable.
- A job completed offline carries the **device timestamp** and the **server receipt timestamp**. Both are stored. Reports use device time; audit uses both.

---

## 6. Module map

The 17 modules from the source brief, regrouped into 6 domains with dependency order made explicit.

| # | Module | Domain | Depends on | Phase |
|---|---|---|---|---|
| 1 | CRM & Customer Management | Commercial | — | **1** |
| 2 | Survey App | Commercial | 1 | **2** |
| 3 | Contract Engine | Commercial | 1, 2 | **2** |
| 4 | Scheduler | Operations | 3, 13 | **2** |
| 5 | Route Optimiser | Operations | 4, 9 | **4** |
| 6 | Technician App | Operations | 4 | **1** |
| 7 | Inventory | Operations | 6 | **3** |
| 8 | Chemical Calculator | Operations | 7 | **3** |
| 9 | Vehicle | Operations | 6 | **4** |
| 10 | Expense | Finance | 6, 9 | **3** |
| 11 | Cash Collection | Finance | 6, 12 | **3** |
| 12 | Finance / Ledger | Finance | 3, 11 | **3** |
| 13 | HR | People | — | **4** |
| 14 | Compliance | Governance | 1, 6, 7 | **4** |
| 15 | Dashboard | Insight | all | **1** (thin) → **5** (full) |
| 16 | Analytics | Insight | 12, 15 | **5** |
| 17 | AI Layer | Insight | 16 | **6** |

**Deliberate sequencing choices:**

- **Module 6 (Technician App) is in Phase 1, before the Scheduler.** Reason: the fastest way to prove the platform is to have a technician complete a real job on it. In Phase 1 jobs are created manually by ops; the scheduler automates that in Phase 2. Build the leaf that touches reality first.
- **Route optimisation is deferred to Phase 4.** With current team sizes, a human ops manager sequencing a day is *good enough*, and the optimiser is a large piece of work. Optimising a route nobody is following yet is waste.
- **Finance is Phase 3, not Phase 6.** The ledger must exist before there is a large volume of untracked transactions to backfill. Retrofitting double-entry over six months of live operations is painful.
- **HR is Phase 4 and deliberately minimal.** See §14 non-goals.

---

## 7. Event catalogue (v0 draft)

The vocabulary of the system. Naming convention: `noun.verb_past_tense`. Every event carries `event_id`, `occurred_at`, `actor_id`, `entity_id`, `payload`, `source_device`.

| Event | Emitted when | Consumers |
|---|---|---|
| `lead.captured` | Web form, call, walk-in | CRM, BD notification |
| `survey.completed` | Surveyor submits site survey | Quotation draft, CRM |
| `quotation.issued` | Quote sent to customer | CRM, follow-up reminder |
| `quotation.accepted` | Customer approves | **Contract Engine (the big fan-out)** |
| `contract.activated` | Contract signed & effective | Service schedule, invoice schedule, renewal reminder, municipality reminder, technician requirement |
| `job.scheduled` | Nightly scheduler or manual | Technician app, route optimiser |
| `route.optimised` | Nightly optimiser | Technician app |
| `job.started` | Technician taps start | Inventory reservation, live map |
| `job.arrived` | Geofence / manual | SLA clock, customer notification |
| `job.completed` | Technician submits | **Stock deduction, report generation, invoice trigger, compliance record, dashboard** |
| `job.failed` | No access / customer absent | Rescheduler, complaint watch |
| `stock.consumed` | Derived from job completion | Inventory, chemical usage analytics, cost-of-service |
| `stock.transferred` | Warehouse → van, van → van | Inventory |
| `expense.recorded` | Technician logs fuel/parking | Petty cash, vehicle cost, ledger |
| `cash.collected` | Technician takes payment | AR, petty cash, ledger, customer balance |
| `cash.deposited` | Bank deposit confirmed | Ledger, petty cash |
| `invoice.issued` | Invoice run or manual | AR, ledger, **e-invoicing adapter**, customer link |
| `payment.received` | Bank/cash/cheque cleared | AR, ledger, contract standing |
| `contract.renewal_due` | Scheduled reminder | BD, CRM |
| `compliance.expiring` | Licence/chemical/vehicle/visa | Ops, HR, compliance dashboard |
| `complaint.raised` | Customer or internal | CRM, ops escalation, quality metrics |

> **Rule:** when a new feature is proposed, first ask "what event does this consume or emit?" If the answer is "none, it just reads a table directly and writes another table directly" — it is probably a module boundary violation.

---

## 8. Core data model (sketch, not final)

Harvested from the existing 14-tab Field Ops schema plus what the event catalogue requires.

**Commercial**
`customers` · `customer_branches` (GPS, municipality licence, access notes) · `contacts` · `leads` · `surveys` · `survey_photos` · `quotations` · `quotation_lines` · `contracts` · `contract_services` · `contract_schedule`

**Operations**
`jobs` · `job_assignments` · `job_checklists` · `job_photos` · `job_signatures` · `service_reports` · `routes` · `route_stops` · `teams` · `technicians`

**Materials**
`items` (chemicals, consumables, equipment) · `item_batches` (expiry, MSDS ref, per-emirate approval) · `stock_locations` (warehouse, van) · `stock_movements` (append-only) · `treatment_recipes` (dose rules)

**Assets**
`vehicles` · `vehicle_documents` · `vehicle_odometer` · `maintenance_records` · `fuel_records`

**Finance**
`invoices` · `invoice_lines` · `credit_notes` · `receipts` · `accounts` (chart of accounts) · `journal_entries` · `journal_lines` (append-only; debits = credits enforced by constraint) · `petty_cash_ledger` · `bank_accounts`

**People**
`employees` (→ licence entity) · `attendance` · `leave` · `employee_documents` (visa, EID, passport with expiry) · `skills` · `certifications`

**Governance**
`compliance_items` · `audit_log` (append-only) · `document_templates` · `generated_documents`

**System**
`outbox_events` · `event_consumers` · `sync_queue` · `idempotency_keys`

**Two structural rules:**
1. Every table carries `created_at`, `created_by`, `tenant_id`.
2. `tenant_id` exists from day one even though there is one tenant. It costs nothing now and it is what makes the Imtithāl spin-out (§2.2) possible later without a rewrite.

---

## 9. Technology decisions

Researched July 2026. Every figure below should be re-verified at build time — free tiers move.

### 9.1 The stack

| Layer | Chosen | Why | Cost |
|---|---|---|---|
| **Database** | **Postgres via Supabase** | Gives us the event log, RLS, `pg_cron`, PostGIS, and real constraints in one engine. Team already knows it. | See 9.2 |
| **Backend/API** | **Next.js Route Handlers + Supabase Edge Functions** | Same stack as the existing website. One language end to end. | $0 |
| **Ops console** | **Next.js 15 App Router + Tailwind** | Continuity with existing build. | $0 |
| **Technician & Survey app** | **PWA** (installable, offline-first) | No app-store review cycle, instant updates, one codebase, already proven at Mumtaz with the Field Ops PWA. | $0 |
| **Hosting (web)** | **Vercel** Hobby → Pro when commercial | Existing deployment target. | $0–20 |
| **Workers / self-hosted services** | **Existing DigitalOcean VPS** + PM2 | Already paid for by the AI content engine. | ~$0 marginal |
| **Object storage (photos)** | **Cloudflare R2** | 10 GB free, **zero egress fees**. The single most important cost decision — see 9.4. | $0 → ~$5 |
| **Map rendering** | **MapLibre GL JS** (MIT, no API key) | Free fork of Mapbox GL; no vendor key in the client. | $0 |
| **Map tiles** | **Protomaps PMTiles, UAE extract, self-hosted on R2** | One file, byte-range served, no tile server, no per-tile billing, ever. MapTiler free tier (~100k tiles/mo) as quick-start fallback. | $0 |
| **Geocoding** | **Nominatim / Photon** — *but see 9.3* | | $0 |
| **Routing & matrix** | **OpenRouteService free key** → **self-hosted OSRM** at scale | See 9.7 | $0 |
| **Route optimisation (VRP)** | **VROOM** (via ORS `/optimization`, later self-hosted) | Purpose-built VRP solver: time windows, skills, capacities, multi-vehicle. | $0 |
| **Offline sync** | **Hand-rolled outbox on IndexedDB (Dexie.js)** Phase 1; re-evaluate **PowerSync** at Phase 4 | See 9.5 | $0 |
| **PDF generation** | **jsPDF client-side** (offline) + server-side render for archival | Technician must produce a report with no signal. Proven in the Field Ops PWA. | $0 |
| **OCR (receipts)** | **Tesseract.js**, client-side, *optional assist only* | Never blocking; technician always confirms the number. | $0 |
| **Internal alerts** | **Telegram Bot API** | Free, unlimited, already in use for the AI content engine approvals. | $0 |
| **Customer messaging** | **WhatsApp Cloud API** (Meta, direct) | No platform fee. See 9.6. | small, variable |
| **Push notifications** | **Web Push (VAPID)**, self-hosted | Works in installed PWAs on Android and iOS 16.4+. No FCM billing. | $0 |
| **Email** | Existing domain SMTP, or Resend free tier | | $0 |
| **Auth** | **Supabase Auth** | Phone/OTP for technicians, email for office. RLS ties directly to it. | $0 |
| **Error tracking** | **Sentry** free tier | | $0 |
| **Uptime** | **UptimeRobot** free (50 monitors) | Doubles as the Supabase keep-alive ping. | $0 |
| **CI** | **GitHub Actions** | Also the free nightly DB backup runner. | $0 |

### 9.2 Supabase — read this before assuming "free"

Verified July 2026, the free tier gives: 500 MB database, 1 GB file storage, 5 GB egress, 50,000 MAU, 500,000 edge-function invocations, ~200 concurrent realtime connections, 2 active projects, shared compute with 500 MB RAM.

**Three free-tier facts that decide the architecture:**

1. **Free projects pause after 7 days of inactivity.** For a production operations platform this is disqualifying on its own.
2. **There are no backups on the free tier.** For a system holding the company's ledger this is the real dealbreaker — bigger than the 500 MB limit.
3. **Crossing a limit (e.g. egress) triggers a fair-use stop: services return HTTP 402 until the period resets or you upgrade.** A technician cannot be told "402" at 11am on a Tuesday.

**Decision:**
- **Production → Supabase Pro from the first day a real technician uses it. $25/month.** Non-negotiable. One of the two things we pay for without argument (D7).
- **Staging/dev → free tier** (2 projects allowed), with a GitHub Actions or UptimeRobot ping to prevent the 7-day pause.
- **Backups → belt and braces.** Pro backups *plus* a nightly `pg_dump` from GitHub Actions to Cloudflare R2. The ledger is the company.
- Note: new Supabase projects created after 30 May 2026 require explicit Postgres grants for PostgREST access. Handle this during setup — otherwise it presents as a mysterious permissions bug.
- **Self-hosting Supabase on the DigitalOcean VPS is a viable Plan B** (and the answer if a client ever demands UAE data residency), but it converts a $25/month bill into an ongoing operations burden. Not recommended for Phase 1. Keep it documented as the escape hatch.

### 9.3 Geocoding — a UAE-specific warning

**Address geocoding in the UAE is unreliable and must not be on the critical path.** Street addressing is inconsistent, building names dominate over street numbers, and Dubai uses Makani numbers that open-source geocoders do not understand.

**Doctrine:** the **GPS pin captured by the surveyor standing at the door is the address.** Everything else — text address, building name, Makani number, emirate — is metadata attached to that pin. Reverse geocoding is used only to *suggest* a human-readable label, which a human confirms or overwrites.

This inverts the usual design and it is correct here. It also means we geocode a site once and never again, which keeps us permanently inside any free tier.

Store coordinates in PostGIS geography columns. Store access notes (gate code, which lift, security desk, parking) against the branch — high-value operational knowledge that currently lives only in a technician's memory.

### 9.4 Photos — the hidden cost bomb

This is where a project like this quietly starts costing real money.

**Naive maths:** 50 jobs/day × 6 photos × 2 MB = 600 MB/day ≈ **18 GB/month, growing forever**, plus egress every time someone views a report.

That blows the Supabase free storage tier (1 GB) in two days and makes egress the dominant line item.

**Decisions:**
1. **Compress on device before upload.** Resize to max 1600px, convert to WebP, target ~150 KB, using a browser canvas. Free, and roughly a 10× reduction: ~18 GB/month becomes ~1.4 GB/month.
2. **Store in Cloudflare R2, not Supabase Storage.** 10 GB free and **zero egress fees** — reports get viewed repeatedly by customers, auditors, and inspectors, and egress is the cost that compounds.
3. **Retention policy from day one.** Job photos: full resolution 12 months, thumbnail forever. Compliance photos: retain per municipality/ISO requirement (Zaza to confirm — likely 3–5 years). Encode as a `retain_until` column enforced by a scheduled job.
4. Photos are referenced by key in Postgres, never stored as blobs in the database.

### 9.5 Offline sync — the highest-risk engineering decision

D5 says offline is the default state. Two credible ways to deliver it:

| Option | How | Verdict |
|---|---|---|
| **A. Hand-rolled: IndexedDB (Dexie.js) + explicit outbox queue** | Local writes go to IndexedDB and an outbox; a service worker drains the outbox when online; the server dedupes by client UUID. | **Chosen for Phases 1–3.** Zero cost, zero vendor dependency, full control over conflict rules, and — decisively — our domain is *low-conflict*. Two technicians rarely edit the same job. |
| **B. PowerSync** (Postgres ↔ local SQLite sync engine) | Declarative sync rules, bucket-based partial sync, causal consistency, first-class offline write support, integrates with Supabase without schema changes. Free tier ~500 MB hosted / ~50 concurrent connections; paid tier from roughly $49/mo. | **Re-evaluate at Phase 4**, or when technicians > 20, or the first time we lose field data. Right answer for a large complex offline app — just more machinery than Phase 1 needs. |

*(ElectricSQL and Zero were considered. Electric routes writes through your API rather than direct; Zero's offline story is read-cache-oriented. PowerSync is the one with first-class offline write support today.)*

**Non-negotiable regardless of option:**
- The app must survive: airplane mode for 8 hours, browser tab killed mid-job, battery death, and a device that never comes back online (data is lost in that last case — accept it, but make it loud and visible).
- **Test protocol:** every release is tested with the network forced offline for a complete simulated working day before it ships. Automate this.

### 9.6 Messaging costs

WhatsApp Business Platform has **no subscription fee** — you pay per message, and since 1 July 2025 Meta bills per message rather than per 24-hour conversation.

In practice:
- **Free:** any reply we send inside the 24-hour window after a customer messages us. Service conversations became free and uncapped in November 2024.
- **Free:** utility templates sent *inside* an open customer service window.
- **Paid:** utility templates we initiate (appointment reminders, "technician on the way", invoice issued) — cheap, sub-cent to low-cent per message depending on the rate card.
- **Most expensive:** marketing templates, which are also capped by Meta at roughly 2 marketing messages per user per day across all businesses combined.

**Design implication:** structure customer flows so **the customer messages first** wherever possible (e.g. the service reminder asks them to reply CONFIRM), which opens a free 24-hour window for everything that follows. Budget the initiating templates; assume everything reactive is free.

Going direct to Meta's Cloud API avoids BSP platform fees entirely. Telegram stays the internal channel — free and already integrated.

### 9.7 Routing — free-tier reality

**OpenRouteService** public free plan: on the order of 2,000 directions requests/day with a ~40/minute sliding window; matrix supports up to 3,500 origin×destination pairs per request (e.g. 50×50); the `/optimization` endpoint is VROOM-backed and handles multi-vehicle VRP with skills, capacities, and time windows.

**Our actual load:** ~50–80 jobs/day, run once nightly. That is **one matrix call and one optimisation call per day per division.** Roughly 1% of the free quota. ORS is comfortable for years.

**When to self-host** (OSRM + VROOM in Docker on the DigitalOcean VPS, UAE OSM extract from Geofabrik — a few tens of MB):
- Job count passes ~300/day, or
- We need same-day dynamic re-optimisation (emergency call inserted at 11am), or
- We need a hard guarantee that no customer address ever leaves our infrastructure.

**Explicit rejection: Google Maps Platform.** Directions and Distance Matrix are pay-as-you-go, and cost scales exactly with operational activity — which violates the core philosophy of this project. We use Google for the one thing it is uniquely good at: **handing off to the Google Maps app for turn-by-turn navigation via a deep link**, which is free.

**Explicit rejection (for now): Google OR-Tools.** Excellent, but VROOM already solves our VRP shape out of the box. Writing a custom solver is a month of work to beat a free service we are not straining. Revisit only if we hit constraints VROOM genuinely cannot express.

### 9.8 The chemical calculator — worked example

Confirming the source brief's point that this is pure arithmetic, with the compliance layer added:

```
INPUT   site type = restaurant, area = 300 m², target = cockroach
RECIPE  spray rate      40 ml/100 m²
        dilution        5 ml chemical : 5 L water
        gel             2 g / 10 m² (harbourage)
        glue boards     1 per 25 m²
        bait stations   1 per 50 m² perimeter

OUTPUT  spray solution   120 ml  → 120 L water + 120 ml concentrate
        gel              60 g
        glue boards      12
        bait stations    6

ALSO    ✓ batch selected (FEFO — first expiry, first out)
        ✓ batch approved for this emirate?
        ✓ batch not expired at service date?
        ✓ MSDS version attached to the service record
        ✓ stock_movements rows written on job.completed
```

Every recipe is a **row in `treatment_recipes`**, editable by ops without a code deploy. No AI. Ever.


---

## 10. Offline-first doctrine (technician app)

What the technician app must do with **zero connectivity**, in order:

1. Show today's job list, pre-synced at last connection (and yesterday's, for corrections).
2. Show the customer, branch, access notes, service history, and last report.
3. Open navigation (deep-link handoff — the map app handles its own offline maps).
4. Run the checklist, capture photos, capture chemical usage, capture the customer signature.
5. Compute the chemical dosage locally (recipes cached).
6. Generate and show the service report PDF locally (jsPDF).
7. Record cash collected and issue a numbered receipt (**receipt numbers pre-allocated in blocks per device** — never generated server-side at point of sale).
8. Record an expense with a photo.
9. Queue all of it, durably, and show the technician an honest "N items waiting to sync" indicator.

On reconnect: drain in order, dedupe by client UUID, surface any rejected item to the technician **and** to ops. Never silently drop.

**What is allowed to require connectivity:** viewing analytics, editing contracts, anything in the ops console, anything AI.

---

## 11. Cost model

### 11.1 Steady state, Year 1 (up to ~20 technicians)

| Line | Monthly (USD) |
|---|---|
| Supabase Pro (production) | 25 |
| Supabase free (staging) | 0 |
| Vercel (Hobby → Pro when commercial) | 0–20 |
| DigitalOcean VPS (already paid; marginal) | 0 |
| Cloudflare R2 (within 10 GB free, then ~$0.015/GB) | 0–5 |
| Maps, tiles, routing, optimisation | 0 |
| Telegram, Web Push, Sentry, UptimeRobot, GitHub Actions | 0 |
| WhatsApp initiated templates (~1,500/mo) | ~2–15 |
| AI layer (Phase 6, capped) | 10–30 |
| **Total** | **≈ USD 40–95 / month** |

### 11.2 What would break this

| Trigger | Consequence | Mitigation already designed in |
|---|---|---|
| Uncompressed photos | Storage + egress becomes the largest line | §9.4 client-side WebP compression, R2 zero egress |
| AI in the operational loop | Per-action inference cost scaling with headcount | D1 — architecturally prevented |
| Google Maps for routing/matrix | Cost scales with jobs | §9.7 — explicitly rejected |
| Real-time GPS tracking at high frequency | Realtime connections + row volume explode | Track at 60–120s intervals, not 5s. Store as a compressed trace, not a row per ping. |
| Per-seat SaaS creeping in | Cost scales with headcount, defeating the point | §14 non-goals |

**The rule:** any proposed dependency whose price scales with *number of technicians* or *number of jobs* requires explicit written approval from Zaza. Dependencies that scale with *data stored* are fine.

---

## 12. Roadmap

Six phases. Each has a **hard exit criterion** — a sentence that is either true or false, with no interpretation.

### Phase 0 — Foundations (2 weeks)
Repo, environments, schema v1, auth, RLS, outbox table + worker, CI, backups, design system.
Migrate the existing 14-tab Field Ops data into the new schema.
**Exit:** an event emitted in a transaction is provably consumed exactly once by two independent handlers, and a nightly `pg_dump` lands in R2.

### Phase 1 — Prove it in the field (6–8 weeks)
CRM (customers, branches, GPS, contacts, history) · Technician PWA (offline, checklist, photos, signature, PDF report) · manual job creation by ops · thin owner dashboard (jobs today / completed / outstanding).
**Exit:** **one pest control team runs one full week entirely on the platform with the paper process switched off**, and every job that week has a photo, a signature, and a report retrievable from the database.

### Phase 2 — Close the front of the funnel (6 weeks)
Survey app (GPS, photos, area, licence capture) · quotation generator · Contract Engine (the fan-out) · nightly Scheduler · customer link (no-login portal).
**Exit:** a signed contract automatically produces a 12-month service schedule and an invoice schedule with **zero manual data entry**, and tomorrow's jobs appear without anyone creating them.

### Phase 3 — Money and materials (8 weeks)
Inventory · chemical calculator · expenses · cash collection · double-entry ledger · invoicing (**PINT AE-shaped from the start**) · AR ageing · VAT return report.
**Exit:** a month closes from the system — P&L, balance sheet, VAT return, and AR ageing all generated with no spreadsheet, and reconciling to the bank.

### Phase 4 — Fleet, people, compliance, optimisation (8 weeks)
Vehicles · HR (attendance, leave, document expiry) · compliance registers · route optimiser (VROOM) · offline-sync re-evaluation (PowerSync decision point).
**Exit:** the optimiser's route is accepted and driven without ops overriding it for two consecutive weeks, and no compliance document expires without at least 30 days' warning having fired.

### Phase 5 — Insight (4 weeks)
Full dashboard · analytics (pure SQL): revenue and profit per technician / route / customer / contract, chemical usage, average visit time, fuel per vehicle, late arrivals, renewal rate, customer lifetime value.
**Exit:** Zaza can answer "which contracts lose money?" in under 30 seconds without asking anyone.

### Phase 6 — The last 5% (4 weeks, and ongoing)
AI layer: report summarisation, natural-language query over the analytics views ("show overdue contracts in Sharjah"), quotation and email drafting, anomaly flagging.
**Exit:** the AI layer can be switched off entirely and the business runs normally.

### Parallel track (Zaza) — Legal & customer-facing
Service agreements, data-processing terms, photography/GPS consent clauses, SLA annexes, report and certificate wording, HR GPS-tracking policy, **ASP selection for e-invoicing (deadline 31 Mar 2027)**.

**Total: roughly 9–10 months of build.** Comfortable margin against the July 2027 e-invoicing deadline — provided Phase 3 is not allowed to slip past Q1 2027.

---

## 13. Risk register

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | **Field adoption fails** — technicians revert to WhatsApp and paper | **High** | **Fatal** | Phase 1 exists solely to test this. Involve two technicians in design, not just at rollout. Measure: taps to complete a job. If it is slower than paper, we have failed and must fix it before Phase 2. |
| R2 | Offline sync loses data | Medium | Severe (trust) | §9.5 test protocol; loud sync indicator; server-side audit that flags a device silent > 24h |
| R3 | Scope creep — 17 modules invite infinite features | **High** | High | This document. Anything not in it is a change request with an owner and a phase. |
| R4 | Agent/dev reports work as complete without commits *(observed previously on the Mumtaz website build)* | **High** | High | **Proof-of-Work Protocol, §15.2 — mandatory** |
| R5 | E-invoicing retrofit | Medium | High | PINT AE field set designed into `invoices` in Phase 3, not Phase 7. ASP selected by Q4 2026. |
| R6 | Photo storage cost blowout | Medium | Medium | §9.4 |
| R7 | Single-person bus factor (Zaza is architect, PO, and owner) | **High** | High | This document is the mitigation. Also: no undocumented infrastructure; all credentials in one managed vault; a second person able to deploy by Phase 3. |
| R8 | Free-tier terms change mid-build | Medium | Medium | D7 escape-hatch rule; re-verify §9 at each phase boundary |
| R9 | Municipality/ISO requirements differ per emirate in ways not yet modelled | Medium | Medium | Model per-emirate flags from day one (§9.8); validate with an actual inspector before Phase 4 |
| R10 | Data loss with no backup | Low | **Fatal** | Supabase Pro backups + independent nightly dump to R2. Test a restore in Phase 0 and again at every phase boundary. An untested backup is not a backup. |

---

## 14. Non-goals (explicitly out of scope)

Saying no here is what makes the yes's deliverable.

- ❌ **Full payroll processing.** We store employees, attendance, leave, and document expiry, and we *export* to whatever runs WPS. We do not calculate gratuity or file WPS ourselves in v1. Four licence entities makes this a project of its own.
- ❌ **A general accounting package.** We keep a correct double-entry ledger of *operational* transactions and produce statements. We do not build fixed-asset registers, multi-currency consolidation, or an audit-firm-facing suite.
- ❌ **Becoming an Accredited Service Provider.** We integrate with one.
- ❌ **Native iOS/Android apps.** PWA until a PWA-shaped limitation actually bites.
- ❌ **Real-time second-by-second vehicle telematics.** Periodic GPS from the technician's phone. Hardware trackers are a separate decision.
- ❌ **Customer self-service booking portal** in v1. Customers get a no-login link to their history, reports, and invoices. Booking stays human.
- ❌ **Multi-tenant SaaS productisation** in v1 — but `tenant_id` is in the schema so this stays possible (§2.2, Imtithāl).
- ❌ **AI anywhere in the operational critical path.** Doctrine D1.

---

## 15. Working protocol

### 15.1 Repository & environments

- Monorepo: `apps/ops-console`, `apps/field-pwa`, `packages/domain` (events, types, validation — shared, single definition), `packages/db` (migrations), `services/workers`.
- Environments: `local` → `staging` (Supabase free) → `production` (Supabase Pro).
- **Migrations only.** No schema change is ever made by hand in the Supabase dashboard. If it is not in a migration file, it does not exist.
- Domain events and their payload schemas are defined **once** in `packages/domain` and imported everywhere.

### 15.2 Proof-of-Work Protocol (mandatory — carried over from the Mumtaz website build)

Any agent or developer reporting a step complete must supply, in the same message:

1. `git diff --stat` for the change
2. Build/test output showing a pass
3. The **commit hash**
4. Confirmation of the push (`git log origin/<branch> -1`)

**A claim of completion without all four is treated as not done.** No exceptions, no matter how confident the report sounds. This rule exists because it has already been violated on a previous Mumtaz project.

### 15.3 Definition of Done (per feature)

- [ ] Migration written and applied to staging
- [ ] RLS policy written and **tested with a non-privileged user**
- [ ] Events emitted are in `packages/domain`; consumers are idempotent
- [ ] Works offline where §10 requires it
- [ ] Arabic/RTL correct where customer-facing
- [ ] Error states designed, not just happy path
- [ ] Proof-of-Work supplied (§15.2)
- [ ] Zaza has clicked it on a real phone

### 15.4 Cadence

Weekly: demo of something working on a real device, not a screenshot. Phase boundaries: re-verify §9 free-tier figures, test a database restore, review §13 risks.

---

## 16. Open questions — close these before v1.0

These block the start of Phase 0. Most are 30-second answers from Zaza; a few need a call.

**Business shape**
1. Current volume: jobs/day, active contracts, technicians, vehicles, warehouses? (Sizes every capacity decision.)
2. Split across the three divisions — is pest control the pilot, and which team specifically?
3. Do the three offices operate as one pool or three independent operations?

**Commercial rules**
4. How is a quotation priced today — per m², per visit, per contract? Is there a rate card, or is it judgement?
5. Standard contract shapes: AMC frequencies actually sold (monthly, quarterly, custom)?
6. What triggers an invoice — completion of service, calendar schedule, or milestone?

**Operational rules**
7. How are jobs assigned today — by area, by skill, by whoever is free?
8. Working hours, weekend, Ramadan hours, public holidays — where does the authoritative calendar live?
9. Emergency/callout jobs: what proportion, and what SLA is promised?

**Money**
10. Does the chart of accounts already exist? Which system holds it today (Tally, Zoho, Excel)?
11. Petty cash: current float per technician, and current reconciliation process?
12. VAT: quarterly or monthly filing? Which entity is the VAT registrant?

**Compliance**
13. Photo/report retention period required by each municipality?
14. Are there per-emirate chemical approval lists we need to load, and where do they come from?
15. Who signs off that a service report is legally adequate — Zaza, Sahar, or an external consultant?

**Technical**
16. What phones do technicians actually carry? (Decides PWA baseline: iOS 16.4+ is the Web Push floor.)
17. Company-issued devices or personal? (Decides MDM, data-wipe policy, and who owns the photos.)
18. Is there budget appetite for Supabase Pro ($25/mo) at Phase 1, or must Phase 1 run on free with the pause risk accepted for internal testing only?
19. Does any existing client contract impose data-residency or data-handling terms we must honour?

**Legal (Zaza's track, but affects the schema)**
20. Confirm Mumtaz's revenue band for e-invoicing (< AED 50M → ASP by 31 Mar 2027, live 1 Jul 2027). Confirm which of the four licence entities are separately in scope.

---

## 17. Appendix — tool shortlist

| Tool | Role | Licence / tier | Link |
|---|---|---|---|
| Supabase | Postgres, auth, storage, realtime, edge functions | Free / $25 Pro | supabase.com |
| Next.js | Console + API | MIT | nextjs.org |
| Vercel | Hosting | Free / $20 | vercel.com |
| Cloudflare R2 | Object storage, zero egress | 10 GB free | cloudflare.com/r2 |
| MapLibre GL JS | Map rendering | MIT | maplibre.org |
| Protomaps / PMTiles | Self-hosted vector tiles | Open | protomaps.com |
| MapTiler | Hosted tiles (fallback) | ~100k tiles/mo free | maptiler.com |
| OpenRouteService | Directions, matrix, isochrones, optimisation | Free key | openrouteservice.org |
| OSRM | Self-hosted routing | BSD | project-osrm.org |
| VROOM | VRP solver | BSD | github.com/VROOM-Project/vroom |
| Geofabrik | UAE OSM extracts | ODbL | download.geofabrik.de |
| PostGIS | Spatial in Postgres | GPL | postgis.net |
| Dexie.js | IndexedDB wrapper | Apache 2.0 | dexie.org |
| PowerSync | Offline sync engine (Phase 4 option) | Free tier / ~$49 | powersync.com |
| jsPDF | Client-side PDF | MIT | github.com/parallax/jsPDF |
| Tesseract.js | Client-side OCR | Apache 2.0 | tesseract.projectnaptha.com |
| web-push | VAPID push | MIT | github.com/web-push-libs/web-push |
| Telegram Bot API | Internal alerts | Free | core.telegram.org/bots |
| WhatsApp Cloud API | Customer messaging | Per-message | developers.facebook.com/docs/whatsapp |
| Sentry | Errors | Free tier | sentry.io |
| UptimeRobot | Monitoring + keep-alive | 50 monitors free | uptimerobot.com |
| Maputnik | Map style editor | MIT | maputnik.github.io |
| Planetiler / tippecanoe | Build custom PMTiles | Open | github.com/onthegomap/planetiler |

---

## Changelog

| Version | Date | Change |
|---|---|---|
| 0.1 | 23 Jul 2026 | Initial context + architecture + kickoff brief. Planning only — build not authorised. |

