# HANDOVER — read this first, then CLAUDE.md and CONSTITUTION.md

Written for a session with **no conversation history**. Every claim is tagged
**[FACT]** (verifiable right now in the repo or the database) or **[ESTIMATE]**
(judgement, not verified). Trust nothing untagged.

Last updated: 19 Aug 2026.

---

## 1. WHERE WE ARE

Last updated: **19 Aug 2026**, head **`e034f3d`**.

- **[FACT] The 583-customer import is DONE and live.** 583 customers on 5-digit
  account numbers (11111-11827), 24 groups, 464 sites, 403 contacts. 16 legacy
  `CUST-` records remain: 1 linked (Calicut `CUST-0001` -> `11193`), 15 flagged
  for console resolution. **0 documents were moved** - reconciliation is a LINK
  (`customers.reconciled_to_customer_id`, mig 100), never a repoint, because an
  issued invoice or receipt is frozen (Art. VII §2).
- **[FACT] Doctrine now in force** - DECISIONS §12 (5-digit account numbers),
  §13 (multi-outlet = group -> customers -> branches; the Sultan Al Arab merge is
  SUPERSEDED and was never performed), §14 (file is truth, legacy is history).
- **[FACT] Migrations 097-119 applied.** 097 account-number scheme · 098 group
  matching · 099/104 declared attributes · 100 reconciliation link · 101 contract
  engagement type · 102/103 area-window settings (owner-ratified) · 105 schedule
  approvals + home-base pin · 106 team_vehicles · 107 category dosage · 108 fuel
  consumption · 109 invoices-are-triggered.
- **[FACT] Green at `e034f3d`:** `tsc` clean, RLS gate passes, `next build`
  compiles, worker suite **26/26**.
- **[FACT] The intermittent suite failure is CLOSED** - root cause proven, see
  `DEBT.md` D-TEST1. An idle-in-transaction session blocked the drain's claim
  insert until statement_timeout, leaving events unprocessed so the next assertion
  failed on a wrong value. Fixed with `lock_timeout`, an explicit LOCK CONTENTION
  log line, and orphan cleanup tightened 2 min -> 30 s.

### What shipped this run

- **§3.2 complete.** `components/RowLink.tsx` - ROW = the record, across all
  lists. Account number everywhere, search is number -> account -> name.
  ListToolbar on estimates/surveys/service-reports. The survey no longer re-asks
  the customer. Estimates no longer forced to AMC (mig 101). Quotations and
  agreements have **no standalone list** (views of estimates/contracts); pipeline
  is a counts dashboard.
- **§3.1 tail - the REQUIRED_INFO prompt exists.** 584 of 599 customers carry a
  flag and there was **no UI for them at all**; the profile now asks for exactly
  the missing fields and each answer clears only its own flag.
- **§3.3 complete.** `lib/domain/firstvisit.ts` + `FirstVisitPanel`: suggestions
  with reasons, booked only on a click, off-pattern flagged. No area master
  invented - area = the customer's district, pattern derived from live jobs.
- **§3.4 complete.** Calendar team/shift/area filters · `/schedule/approvals`
  with **24h customer notices gated on approval, not generation** ·
  `/teams/crews` drag-drop, date-effective, persists day-to-day.
- **§3.5 complete.** All four restaurant presets carry owner-stated numbers
  (only D's duration/crew remain ASSUMED; its 150 ml cap is a CHECK constraint).
  `lib/domain/quickprice.ts` + `QuickPricePanel` on `/categories` show dosage,
  crew, time and the material/labour/travel breakdown, Dubai +15% as guidance.
  **Correction:** mig 108 had invented `cost.vehicle_litres_per_100km` = 12 when
  `cost.vehicle_km_per_litre` = 5 already existed unassumed; mig 110 deleted it
  and travel now reads `cost.standard_vehicle_rate_per_km`.
- **§3.6 COMPLETE.** Invoices are TRIGGERED (109). Attestation charge (112) —
  settings rate, per-contract override, per-contract waiver. Job outcome from the
  app (114) — completed / cancelled / **delayed**, reason mandatory by CHECK.
  **Technician invoice at completion (115)** — partial AND overpayment now
  possible at all: `fn_record_receipt` had required allocations to EQUAL the
  receipt (overpayment impossible) and ad-hoc invoices to be paid in full
  (partial impossible). Unapplied cash credits a new customer-advances liability
  (2250) instead of understating AR. Field cash previously never reached the
  ledger at all; it does now.
- **§3.7 part done.** Google sign-in restricted to pre-registered employees
  (116) — `fn_link_google_identity` allows only an active, pre-registered
  address and **never creates an app_user**; eight decisions proven. Uniform
  checklist, TIME IN/OUT and a derived working-hours view (117). HR requests
  incl. sick leave with an approval queue (118).
- **§3.8 part done.** Fuel bands corrected from 4 quarters to the 8 specified
  (117). Refuel records **who paid** — payer, cash vs top-up card, receipt photo,
  gauge band — and `fuel_cash_owed_to_technicians` reconciles by PAYER, not by
  van (119). fuel.logged proven idempotent by client_uuid.

## 2. THE DECISION JUST MADE — 5-digit account numbers (RATIFIED)

Recorded in **DECISIONS.md §12**. Summary:

- The master file's **5-digit numbers (11111–11827, digit 0 never used)** become
  THE permanent customer account number. **CUST-XXXX is retired.**
- **CUST-0001 … CUST-0600 are burned — never reusable.**
- New numbers continue from **11828**, skipping any number containing a 0.
  Three call sites mint codes and all three change:
  `apps/ops-console/lib/domain/customers.ts`,
  `apps/ops-console/lib/domain/imports.ts`,
  `apps/ops-console/scripts/import-merge.ts`.
- **Every surface, list and document displays the 5-digit number.** All read
  `customers.code`, so they follow automatically; relabel to "Account no.".
- **Calicut Restaurant (`CUST-0001`) → 11193.**
- **The six Sultan Al Arab records (`CUST-0026, 0088, 0089, 0090, 0091, 0092`)
  → 11662.**

**[FACT] The Sultan Al Arab renumbering is a MERGE, not a rename.** The file has
one record; the live system has six, holding **7 contracts and 3 jobs**.
`unique (tenant_id, code)` forbids six rows sharing 11662. So: one record
becomes 11662, the other five have their contracts and jobs repointed to it and
are archived — one transaction, audited, counts reported before and after.
Nothing is deleted.

---

## 3. THE WORK QUEUE — in this exact order

### 3.1 — Import the 583 customers through the dry-run pipeline
Staging → validation report → **owner approval** → commit. Idempotent by batch,
rollback by batch (Art. VII §5). The UI exists at `/imports`.
Respect the file's own conventions:
- `LOCATION_SOURCE` / `LOCATION_STATUS` import as-is: **VERIFIED 80,
  UNVERIFIED 15, AREA_APPROX 304** (district centroids — must be flagged as
  approximate in the technician app), **NO_LOCATION 184**.
- **`PLACE_OF_SUPPLY` is the UAE VAT field — keep it distinct from emirate**
  even though every value matches today.
- `LEGACY_CODES` links the old system; `CONTRACT_NUMBERS` + `CONTRACT_SL_NOS`
  link 128 customers to contracts. **[FACT] None of the file's 121 distinct
  contract numbers exist in the live system** — the live contracts are all test
  data, so there is nothing real to reconcile against yet.
- `ALIAS` → `alias_name`; `CUSTOMER_GROUP` + the Groups sheet create/attach
  groups. Sultan Al Arab reconciles with the **existing** group — no duplicate.
- **Nothing invented: blank stays blank. Do NOT geocode NO_LOCATION records** —
  technicians capture the pin at the door.
- `REQUIRED_INFO` is a feature, not just data: store it per customer, and when
  any user first opens a customer whose `REQUIRED_INFO` is non-empty, the
  profile prompts *"This customer is missing: EMAIL, PHONE — capture now?"*
  with inline fields. That is how the 568 incomplete records complete through
  daily use instead of a data project.

### 3.2 — §4 flow fixes
- **ROW = the record.** In every list (quotations, estimates, surveys,
  contracts, agreements, invoices, service reports) clicking anywhere on the row
  opens **that record's** detail. The customer **name inside a row is NOT a
  link**. Inside the record detail there is a clear **"View customer profile"**
  link. Currently name-click hijacks to the customer profile — fix everywhere.
- **Account number everywhere:** on every record, list row and document.
- **Universal numbering:** every entity carries its own document number
  (survey, estimate, quotation, contract, agreement, service report, invoice,
  receipt) — largely true already; verify and expose.
- **Search + filters on every list:** search by **number first**, then customer
  name, then date; filters by date range, status, team, division, customer.
- **Customer creation is ONE complete form** — trade/legal name, TRN, licence,
  contact person, email, phone, mobile, one paste-friendly address line plus
  Google Maps capture, category, night shift + closing time. Not split across
  modules, not re-asked later. After save, a **"Start survey"** button carries
  the customer straight in — **the survey must never re-ask who the customer
  is** (it still offers a blank picker when arriving from a customer — fix).
- **Estimates are NOT forced to AMC.** Recurring is a **choice** at
  estimate/contract creation; one-off stays one-off.

### 3.3 — §2 area-window first-visit scheduling
When a new contract is signed, the first visit slots by this logic:
- **(a)** If the customer's area is already scheduled for a team **this week on
  a coming day** → book the first visit into that day.
- **(b)** If that area's day already passed this week → find any day this week
  where a team passes **near** the area (closest-area match) → book as an
  **additional** job on that day's route, flagged **"first visit —
  off-pattern"**.
- **(c)** If nothing near this week → book **next week's** area day.
- **(d)** From the **second visit onward** the customer syncs onto the area's
  normal pattern (F&B monthly-twice = every 2 weeks on that area's day), even
  if the first→second gap is shorter than the normal interval. **One-time
  compression is acceptable** to lock the pattern.
Surface as **suggestions with reasons** ("Team A passes Al Zahia Thursday — add
as extra job?"). **The office confirms; never silent auto-booking.**

### 3.4 — §3 operations calendar + approval queues
- **Operations calendar:** month/week/day, all teams, filter by team / shift /
  division / area, drag-drop reschedule. (A month/week/day calendar with
  drag-drop exists at `/schedule` — extend it to teams/shift/area filters
  rather than rebuilding.)
- **Next-day and night-schedule approval queue:** tonight's/tomorrow's generated
  schedule appears for review each day; the office adjusts (drag-drop) and
  approves; **approval triggers the customer 24h notices**.
- **Team assignment screen:** drag-drop technicians into teams and vehicles.
  Persists day-to-day automatically, changeable any day; changes flow to the
  technician apps.

### 3.5 — §5 category quick-pricing
The category picker is currently dead — make it work. Presets drive the estimate
in one tap:
- **RESTAURANT A:** small kitchen + small cafeteria, ~20 min service, **1 mix =
  50 ml Blitz** (1 L ≈ AED 85) + surfactant.
- **RESTAURANT B / C:** intermediate sizes — propose defaults, mark **ASSUMED**,
  editable.
- **RESTAURANT D:** full-size restaurant, **max 3 mixes = 150 ml. Never more.**
- Each preset carries est. service minutes, mixes (→ material cost from **real
  batch costs**), crew size. Selecting it computes labour and material;
  distance/fuel compute from the pin.
- **Emirate pricing factor:** Dubai quotes **+10–20%** over the Sharjah-based
  suggestion — configurable %, not forced rounding, shown as pricing guidance.
- **Home base = Ajman New Industrial Area** (Etihad Road, near Gift Way Home),
  stored as the configurable depot pin (`settings.operations.home_base`,
  **[FACT] created, lat/lng still null**). All distance/fuel/time calculations
  run from this base to the site pin.

### 3.6 — §6 attestation charge + invoicing rules — PART DONE
- **DONE:** invoices are triggered, never auto-generated (mig 109). The nightly
  cron prepares; a human issues, which numbers and GL-posts. Two tests pin down
  both halves.
- **DONE:** Sharjah F&B AED 250 + VAT attestation charge (mig 112) — settings
  rate, per-contract override, per-contract waiver, first invoice only,
  idempotent.
- **DONE:** job status from the app (mig 114) — completed / cancelled / delayed,
  reason mandatory on the two non-completion outcomes, idempotent by client_uuid,
  a late cancel cannot overwrite a completed job.
- **DONE:** technician invoice at completion (mig 115) — `job.invoiced` raises it
  at the door with an adjustable amount, respecting the service-report gate
  (no report yet = a PREPARED invoice, not a failing event). `cash.collected`
  settles it as far as the money goes: underpayment leaves the shortfall in AR,
  overpayment credits customer advances. §3.6 is complete.

### 3.7 — §7 technician + supervisor apps
- **All ~20 technicians get auth accounts.** Bulk-create from the imported staff
  data. **Google sign-in restricted to pre-registered employee emails** — each
  employee record carries their Google email and OAuth succeeds only on a match;
  unknown Google accounts are **rejected, never auto-provisioned**.
  Email/password remains the fallback.
- **Technician flow:** login → mark attendance → personal checklist (**uniform:
  t-shirt, pants, socks, safety shoes, mask**) → **TIME IN** → view today's team
  + schedule → work jobs → **TIME OUT**. Working hours computed from time
  in/out. Daily KPIs on their dashboard; salary-credit notification + amount
  from payroll; **apply for sick leave** and general HR requests from the app.
- **Supervisor = technician plus:** complete jobs per the schema/constitution,
  log expenses, pre- and post-flight checklists, and an explicit
  **accountability confirmation that the inputs are true**.
- **UI: modern, playful, colourful, button-first** — these users are not
  technical. Big touch targets, icons + colour, celebration states.

### 3.8 — §8 fuel
- **Bands:** CRITICALLY LOW / <10% / <20% / <40% / <60% / <80% / <100% / FULL,
  asked **every morning** at pre-flight.
- **Refuel flow:** band + **litres** + **amount** + vehicle + **receipt photo**
  + **payer** (cash or top-up account; **teams may fuel for each other**, so
  capture who paid or reconciliation breaks).
- Monthly fuel price setting + month-end reminder stay as built.

### 3.9 — §11 modern UI refresh
Design tokens (spacing scale, type scale, 8px grid), card layouts with depth,
motion 150–250 ms, skeletons, ⌘K, grouped nav (Sales / Operations / Finance /
Admin), collapsible sidebar with user avatar + role, top bar with global search
/ quick-create / notification bell / health indicator, clean tables with sticky
headers and inline status pills, empty states with one primary action,
**dark-ready tokens (do not ship dark mode, just do not hardcode colours)**.
Field apps colourful, button-first, playful, celebration states.
**Commit hash stays in the footers.** Verify on the deployed URL, not just code.

### 3.10 — §9 HR module (inside the ops console)
Staff records from the imported staff data; approval queue for requests from the
tech/supervisor apps (leave, expenses); **payroll**: monthly run from attendance
+ working hours, salary components per employee (already modelled in costing),
salary-credit notifications to the apps; **document expiry** for visa, Emirates
ID, labour card, passport, municipality card wired to the existing expiry
engine, with the **sponsorship entity recorded per employee**; **manpower**:
optional timesheet upload per deployment feeding technician KPIs.

### 3.11 — §10 accounts module
All deterministic, from the existing GL: **SOA per customer**; **daily /
monthly / quarterly / half-yearly / yearly** report packs; **P&L**; trend
analysis; **reconciliation** (cash vs bank, daily petty cash, bookkeeping
views); **VAT report** (5%, from invoices/receipts as recorded); **corporate tax
(basic)** — research current UAE rules (9% above the small-business threshold,
registration, deductible expense recording) and build the module to **record**
tax-relevant figures and register expenses correctly. **Filing stays with
experts.** **Cite what the rules are based on; flag ASSUMED where UAE guidance
is ambiguous.**

---

## 4. BLOCKED.MD STATE — what the owner must do

BLOCKED.md carries the owner's tasks **at the top**, numbered, with exact
click-paths. Open at this handover:

1. **Anthropic API key** → unlocks the assistant, report commentary and
   draft-to-estimate (paste into `apps/ops-console/.env.local` + Vercel).
2. **Google sign-in** — full Google Cloud Console steps (OAuth consent screen,
   Web application credentials, redirect URI
   `https://xpkniuhcjysisfbfiqhn.supabase.co/auth/v1/callback`) and the Supabase
   Authentication → Providers → Google steps. **[FACT] written out in
   BLOCKED.md task 2.** After the owner confirms, wire the employee-email
   allowlist so only registered staff can complete a sign-in.
3. **Google Maps browser key** (Maps JavaScript API + Places API) → map previews
   and address autocomplete, and the home-base pin.
4. **Supabase service-role key** → office invites + instant revocation.
5. **Phone re-test** — clear the old PWA cache, confirm the build hash in the
   footer, walk the field flow.
6. **Answers still needed:** an address whose pin lands wrong; cleaning/FM
   quotation wording; Dubai + Abu Dhabi municipality attestation rules.
7. **Real-device checklist** (release gate) — airplane-mode completion, PDF on
   the phone, photo capture, map tiles.

**[ESTIMATE] Supabase steps for the 20 technician accounts:** the accounts can
be created programmatically once the **service-role key** (item 4) is present —
so the owner's only manual step is likely supplying that key, plus the Google
provider setup in item 2. Confirm before promising it.

**[FACT] Email sending is live** (Resend; deliveries proven). If Vercel lacks
the email env vars, the scheduled sends will fail there while working locally —
verify before claiming production email works.

---

## 5. STANDING RULES — load these before writing code

- **Proof-of-Work per Art. X §5.** Any completion claim carries, in the same
  message: `git diff --stat`, build/test output showing a pass, the commit hash,
  and confirmation of push. Without all four it is **not done**.
- **Invariants may not be weakened.** Exactly-once event processing,
  `debits=credits` by constraint, append-only on stock movements / journal lines
  / service reports / audit log / generated documents, RLS tenant isolation
  tested with a non-privileged role, version immutability on reference data,
  frozen snapshots on transaction records. Relaxing one is a **constitutional
  amendment — stop and ask the owner**.
- **ASSUMED discipline.** Never invent a business rule. Unknown → ask, or seed
  as a value marked `ASSUMED`, editable from settings without a deploy, and
  visibly flagged in the UI. Never present an assumption as fact.
- **SOURCED citations for municipality data** — cite the document; the files in
  `docs/reference/` are the **source of truth for every document format** and
  for the municipality contract clauses.
- **Invoices are triggered, never auto-generated.**
- **Flags — a human decides.** The system surfaces suggestions with reasons; the
  office confirms. No silent auto-booking, no silent merges.
- **Channel-plural notifications.** Email today; WhatsApp only via the
  **official WhatsApp Business API** — unofficial WhatsApp Web automation is
  forbidden (business-number ban). See ROADMAP-AMENDMENT.md.
- **Night shift is per-branch.** Closing time lives on the branch; visits are
  sequenced after that outlet's own closing time, never a fixed shift start.
- **Salesforce-grade reliability.** Every new domain (HR, payroll, fuel,
  approvals, calendar, accounts) gets **dedicated tables with constraints, RLS
  and audit** — **no JSON-blob shortcuts on financial or HR data**.
  Transactional writes through the established choke point (`withTenantTx` /
  `withRequest`). **Nothing may fail silently.**
- **Automation first, AI last.** Scheduling, routing, dosing, inventory and
  accounting are deterministic. The AI layer explains; it never runs the
  business. Deleting it must leave the business running normally.

---

## 6. HOW THE OWNER WORKS

- **[FACT] Not a developer.** Explain in plain business language, not code.
- **[FACT] Instructions are voice-dictated** — long, detailed, occasionally
  repeating a point for emphasis. Read the whole instruction before starting;
  the important constraint is often mid-paragraph.
- **[FACT] Review happens on the deployed URL only**, on a phone. The **commit
  hash in the footer** is how the owner proves which build they are looking at —
  keep it there. A stale PWA cache has already caused a false "nothing changed"
  report once.
- **[FACT] Honest summaries required: built ≠ verified on device.** Say what
  shipped, what is partial, what is blocked, and what bugs were found and fixed.
  Never report a clean test run that did not happen. If two of twenty-five tests
  fail, say so and show the output.
- **[FACT] The owner has standing authority for the agent to push and merge its
  own work** on this repo, over the `github-mumtaz` SSH remote.
