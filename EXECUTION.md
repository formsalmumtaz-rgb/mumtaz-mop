# EXECUTION.md — Sprint Zero
# Demo target: Monday 27 July 2026

**Governed by:** `CONSTITUTION.md` v1.0 · **Research annex:** `CONTEXT.md`
**Elapsed time available:** Thu 23 → Mon 27 July. Roughly 4.5 working days, part-time.
**Status:** Build authorised **for Sprint Zero scope only** (below). Nothing outside this scope is authorised.

---

## 1. What the demo is — and is not

### ❌ Not this
Not Phase 1. Not 30 modules. Not a clickable Figma. Not a slide deck.

### ✅ This — **The Golden Thread**

One unbroken vertical slice through the entire platform, using one real customer, one real contract, one real job.

```
1.  Contract activated in the office
         ↓  (event fires — nobody touches anything)
2.  Service schedule + 12 months of jobs generated automatically
         ↓
3.  Technician opens PWA on a real phone → PUTS IT IN AIRPLANE MODE
         ↓
4.  Checklist · photos · chemical dose calculated on device · customer signature
         ↓
5.  Service report PDF generated ON THE PHONE, still offline
         ↓
6.  Phone comes back online → syncs
         ↓
7.  Stock deducted · invoice appears · dashboard tile updates
```

**Why this slice and no other:** it demonstrates all four philosophy pillars at once — data entered once, automatic downstream propagation, deterministic calculation, and offline-first. Any single module built beautifully would demonstrate none of them.

**The two moments that sell it:**
- Step 2 — a contract is signed and tomorrow's work exists without anyone creating it.
- Step 3 — **airplane mode.** Turn the phone's radio off in front of your audience and keep working. That is the moment nobody expects.

### Explicitly excluded from Sprint Zero
Route optimisation · full inventory · HR · payroll · full double-entry ledger · complaints · compliance registers · analytics · AI · auth beyond a simple login · Arabic UI (Arabic on the **report PDF** only).

---

## 2. The two-tool split

| | **Claude Code** | **Cowork** |
|---|---|---|
| **Owns** | Everything inside the repo | Everything outside the repo |
| **Sprint Zero job** | Build the Golden Thread | Produce the real data the Golden Thread runs on |
| **Why** | Codebase awareness, terminal, Git. Your Art. X §5 Proof-of-Work Protocol requires `git diff` + commit hash + push — that only exists in Claude Code. | Lacks Git and terminal, but is built for document- and file-heavy work: extracting, cleaning, structuring, drafting. |

### ⚠️ The dependency that will bite you if you get it wrong

**Cowork's output is Claude Code's input.** The clean customer list and the chemical recipe table are *seed data* — Claude Code needs them by Friday. **Start Cowork today, before you start Claude Code.** Most people do this backwards and end up demoing with "Test Customer 1".

### One practical constraint
Cowork needs the desktop app open and the machine awake — if it sleeps, the task dies. Run its long jobs while you're at the desk, not overnight. Claude Code is the better tool for unattended long-running work.

---

## 3. Setup — do this first (60–90 minutes, today)

### 3.1 Claude Code

1. Install per the current docs: **https://docs.claude.com/en/docs/claude-code/overview** (package: `@anthropic-ai/claude-code`).
2. Create the repo `mumtaz-mop`. Put at the root:
   - `CONSTITUTION.md`
   - `CONTEXT.md`
   - `EXECUTION.md` (this file)
   - `CLAUDE.md` (provided separately — this is what Claude Code reads automatically every session)
3. Start Postgres locally — free, fast, no quotas, no 7-day pause:
   ```
   docker run --name mop-db -e POSTGRES_PASSWORD=dev \
     -p 5432:5432 -d postgis/postgis:16-3.4
   ```
   PostGIS image, not plain Postgres — you need geography columns from the first migration.
4. **Use plan mode before every non-trivial task.** Let it show you the plan, correct the plan, then let it execute. This is where you catch a wrong turn cheaply.

### 3.2 Cowork

1. Open Cowork in the Claude desktop app.
2. Create a folder on your machine, e.g. `~/Mumtaz-MOP-Data/`, and mount it. Cowork can only touch directories you explicitly mount.
3. Drop into it: the Google Sheets exports from the Field Ops PWA, a handful of past quotations, and any chemical/dosage documents you have.
4. Cowork shows you its intended steps before it starts — read them. That is your cheapest error-catch.

---

## 4. Day plan

### THU 23 JUL — Foundations
**Cowork (start first):** Task C1 — customer master extraction
**Claude Code:** Task K1 — repo, schema, outbox, event worker
**End of day:** an event emitted inside a transaction is provably consumed exactly once by two independent handlers. Nothing visible yet. This is the day that decides whether the rest works.

### FRI 24 JUL — The automatic fan-out
**Cowork:** Task C2 — chemical recipe table
**Claude Code:** Task K2 — contract activation → schedule + jobs generated
**End of day:** you activate a contract in a terminal and 12 months of jobs appear. **This is demo moment #1.**

### SAT 25 JUL — The field app
**Claude Code:** Task K3 — offline PWA shell, job list, checklist, camera, signature
**End of day:** it works on your actual phone, in airplane mode. Test on the real device, not the browser simulator.

### SUN 26 JUL — Close the loop
**Claude Code:** Task K4 — on-device PDF report, sync-on-reconnect, invoice, dashboard tile
**Cowork:** Task C3 — demo script
**End of day:** the full Golden Thread runs end to end.

### MON 27 JUL — Dry run, then demo
Morning: run the whole thing three times on the real phone. Fix only what breaks.
**Do not add features on demo day.** Every scope addition on the last morning is what breaks demos.

---

## 5. Copy-paste task assignments

### → COWORK

**C1 — Customer master extraction (assign today, first)**

> I'm giving you exports from our old field operations system (Google Sheets) in the mounted folder. Extract and clean a customer master list for our new operations platform.
>
> For each customer produce: legal entity name, trade name, TRN if present, customer type (B2B / B2G / B2C), primary contact name, phone, email, emirate, and each physical branch or site with its address and any GPS coordinates present.
>
> Rules:
> - Do not invent or guess any value. Leave it blank and list it in a "needs confirmation" sheet.
> - Flag duplicates and near-duplicates rather than merging them yourself.
> - Flag any customer missing a TRN or a legal name in a separate tab — these block UAE e-invoicing compliance and I need to see the size of that problem.
>
> Output one clean CSV per entity type plus a short summary of data quality: how many records, how many complete, what's missing.

**C2 — Chemical recipe table (assign Friday morning)**

> From the documents in the mounted folder plus your own research on standard pest control practice, build a treatment recipe table our system can calculate from.
>
> One row per treatment type (residual spray, gel bait, glue board placement, bait station, fogging, etc.), with columns for: treatment name, target pest, chemical/product, application rate with units, dilution ratio, coverage per unit, and any site-type variation (restaurant vs. villa vs. warehouse).
>
> Critical: mark every single value as either SOURCED (with the document or manufacturer reference) or ASSUMED. I will personally review and correct every ASSUMED row before it goes live. Do not present assumptions as facts.
>
> Output as CSV plus a one-page summary of what you had to assume and why.

**C3 — Demo script (assign Sunday)**

> Write a 10-minute demo script for the Mumtaz Operations Platform Golden Thread demo, for an audience of our operations manager and senior technicians.
>
> The narrative arc: today's process vs. what they're about to see. Build to two moments — (1) a contract is signed and tomorrow's jobs exist without anyone creating them, (2) the phone goes into airplane mode and the technician keeps working.
>
> Include: what to say at each step, what to click, what to deliberately NOT promise yet, and honest answers to the three most likely objections from a sceptical technician. Keep it plain-spoken. No jargon.

### → CLAUDE CODE

**K1 — Foundations (today)**

> Read CONSTITUTION.md and CONTEXT.md at the repo root before doing anything. They govern this project.
>
> Task: build the foundation layer for Sprint Zero.
>
> 1. Monorepo scaffold: `apps/ops-console` (Next.js 15 App Router + Tailwind), `apps/field-pwa`, `packages/domain`, `packages/db`, `services/worker`.
> 2. Migration 001 — core schema. Every table gets `id` (uuid), `tenant_id`, `service_line_id`, `created_at`, `created_by`. Tables: customers, customer_branches (PostGIS geography column for the GPS pin), contacts, contracts, contract_services, contract_schedule, jobs, job_checklists, job_photos, job_signatures, service_reports, items, treatment_recipes, stock_movements (append-only), invoices, invoice_lines.
> 3. Migration 002 — the transactional outbox: `outbox_events` (event_id, event_type, entity_id, payload jsonb, occurred_at, actor_id, processed_at) and `event_consumers` for idempotency tracking.
> 4. `packages/domain` — TypeScript types and Zod schemas for every domain event in CONTEXT.md §7. Defined once, imported everywhere.
> 5. `services/worker` — outbox drain loop: polls unprocessed events, dispatches to registered handlers, marks processed, idempotent by event_id.
> 6. A test proving an event emitted inside a transaction is consumed **exactly once** by two independent handlers, and that replaying it a second time changes nothing.
>
> Constraints from the constitution: migrations only, never dashboard edits. Append-only tables get no UPDATE or DELETE grants. No module reads another module's tables.
>
> Per Art. X §5, report back with `git diff --stat`, passing test output, the commit hash, and confirmation of push. A completion claim without all four is not accepted.

**K2 — Contract fan-out (Friday)**

> Task: implement the contract activation fan-out. This is the core demo moment.
>
> When a contract is activated, emit `contract.activated` in the same transaction as the write. Consumers, each independent and idempotent:
> 1. Generate `contract_schedule` rows for 12 months from the contract's service frequency.
> 2. Generate `jobs` rows for the next 30 days from that schedule.
> 3. Create a renewal reminder 60 days before contract end.
>
> Also build a minimal ops console screen: create a customer with a branch and a GPS pin, create a contract, activate it, and see the generated schedule and jobs appear.
>
> Seed the database from the CSVs in `/seed` (real customer data — treat blank fields as genuinely unknown, never fill them in).
>
> Proof-of-Work per Art. X §5.

**K3 — Offline field app (Saturday)**

> Task: the technician PWA. Constitution Art. III P1 — it must be fully functional with zero connectivity.
>
> 1. Installable PWA with a service worker. Pre-sync today's jobs, customer details, access notes, and treatment recipes to IndexedDB (Dexie.js) on last connection.
> 2. Job list → job detail → start job → checklist → camera capture (compress to WebP, max 1600px, ~150KB, before storing) → chemical dose calculated locally from the cached recipe table → signature pad → complete.
> 3. Every write goes to IndexedDB and an outbox queue, each carrying a client-generated UUID. Nothing blocks on the network.
> 4. A visible, honest sync indicator: "N items waiting to sync".
>
> Test protocol before you report done: load the app, force the device offline, complete two full jobs including photos and signature, kill the browser tab, reopen, confirm nothing was lost.
>
> Proof-of-Work per Art. X §5.

**K4 — Close the loop (Sunday)**

> Task: complete the Golden Thread.
>
> 1. On-device PDF service report via jsPDF — generated fully offline, with the Mumtaz logo, brand red #A31E22, job details, photos, chemicals used, and the customer signature. Arabic section rendering correct RTL.
> 2. Sync on reconnect: drain the outbox in order, dedupe server-side by client UUID, surface any rejection to both technician and ops. Never fail silently.
> 3. On `job.completed`: deduct stock via append-only `stock_movements`, and queue an invoice. The `invoices` table carries the PINT AE fields from CONTEXT.md §4.1 even though nothing transmits yet.
> 4. Dashboard: one mobile screen — jobs today, completed, revenue, outstanding. Live-updating.
>
> Proof-of-Work per Art. X §5.

---

## 6. Demo-day rules

1. **Real phone, real hands.** Hand the phone to a technician. Do not drive it yourself.
2. **Airplane mode on stage.** Non-negotiable. It is the whole demo.
3. **Real customer data.** "Test Customer 1" halves your credibility in one second.
4. **Show one thing that is broken**, deliberately, and say so. It buys more trust than a flawless demo, and it sets the expectation that this is Sprint Zero, not a finished product.
5. **Promise nothing about dates.** Show what exists.
6. **No feature additions on Monday morning.**

## 7. If you fall behind — cut in this order

1. Dashboard (describe it verbally)
2. Invoice generation (show the queued row)
3. Stock deduction
4. **Never cut:** the contract fan-out, or airplane mode. Those two *are* the demo.
