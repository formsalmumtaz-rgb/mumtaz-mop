# ROADMAP-AMENDMENT.md

**Status:** Backlog filing — recorded 25 Jul 2026, after K4 (Golden Thread) completed.
**This is a filing only.** No migration, schema change, or code was written for this
document. Nothing here is scheduled or authorised for build beyond what a later
`EXECUTION.md` sprint explicitly picks up.

Coverage is assessed against the schema actually built (migrations `001`–`013`) and
the governing documents (`CONSTITUTION.md`, `CONTEXT.md`, `DECISIONS.md`).

Each item is marked:
- **(a) ALREADY COVERED** — by existing schema or roadmap (named). **"Covered" here means the substrate exists or the item is FILED — it does NOT mean built.** See the build-status correction below.
- **(b) GENUINELY NEW** — candidate for the tier assigned.
- **(c) NEEDS DEDICATED DESIGN** — Tier 3.

---

## 0. Build status — CORRECTION (29 Jul 2026)

> A "90–95% already covered" reading of this document is **wrong**. Almost everything
> here is **FILED, not built**. "Covered by roadmap" ≠ delivered. A future session must
> not read this backlog as "nearly done" and must apply full Architecture Baseline
> discipline (affected modules + regression/offline re-proof) to every item below.

**Built and working today (migrations `001`–`023`):**
- **K1–K4** — schema, event outbox, offline technician PWA, sync, on-device PDF reports.
- **Customer groups + import provenance** (mig `014`–`015`).
- **Chemical batch traceability, unit costing & perpetual inventory** (mig `016`–`018`):
  suppliers, purchase logging, frozen batch cost, FEFO allocation, valued consumption.
- **Cost engine** (mig `019`–`023`): employee cost basis (fully-loaded hourly), capture
  (per-tech labour, per-job distance), vehicles + fuel cost/km, and the `job_costs`
  engine with **confidence flags** and the **ASSUMED configuration gate** (refuses to
  compute on placeholder rates/codes). GL absorption/variance *posting* not yet built.
- **Admin console:** technicians, customers, branches, contracts, chemical master, purchases.

**Not built — roadmap only:** everything else in this file (all Tier 2/3 modules), and
everything in the Service-Driven Platform amendment (§5 below) — Division Engine, Service
Definition Engine, Estimation Engine, Pricing Model Engine, analytics/KPI, manpower
deployment, etc.

---

## 1. Tiering & coverage assessment

### TIER 1 — Foundational (changes schema; build first)

| Item | Mark | Where covered / note |
|---|---|---|
| Chemical batch traceability | **(a) partial** | `item_batches` exists (batch_no, expiry_date, msds_ref, per-emirate `emirate_approvals`, mig 006). Traceability *skeleton* present; supplier + per-movement batch link + remaining-qty rollup still to add. |
| Chemical **unit costing** | **(b) new** | `items` has no cost/purchase fields. Add purchase logging (qty, unit size, cost → cost-per-ml), recurring-purchase flag, active ingredient. **Phase 5 exit criterion — profit-per-contract depends on it.** |
| Customer health / risk scoring | **(b) new** | No score fields. Tier 1 adds the stored score; the engine that computes it is Tier 2. |
| The reliability principle | **(b) new — propose for Constitution** | Not yet a stated principle. See §3 Principles. "Cheap today, expensive later" — adopt before more modules exist to violate it. |
| Emirate segregation | **(a) covered** | `customers.emirate` + `customer_branches.emirate` (mig 004). Filtering only, no new schema — dashboards/reports filter by it. |
| Customer / **group** workspace structure | **(b) new** (workspace UI is Tier 2) | No `customer_groups`. Add group schema: a `customer_groups` table + `customers.group_id`, **retroactively assignable with history following**. The *workspace* (aggregated UI) is Tier 2. |
| Legal / trade / **alias** name separation | **(a) partial** | `customers.legal_name` + `trade_name` exist (mig 004). **`alias_name` is new** (small Tier 1 add). |
| `location_source` on branches | **(b) new** | `customer_branches.location` exists (PostGIS, mig 004) but no provenance. Add `location_source` (whatsapp_link / address_search / technician_captured / office_estimate) + unverified-pin flag surfaced in the field app. |

### TIER 2 — Real modules (depend on Tier 1 schema)

| Item | Mark | Where covered / substrate |
|---|---|---|
| Compliance & municipality report generator | **(b) new** | Substrate: `document_templates` + `generated_documents` (mig 003/005), `customer_branches.municipality_licence`. |
| Pest trend analytics | **(b) new** | Substrate: `pest_types` (mig 002), `service_reports.snapshot`. Deterministic (Layer 2). |
| Structural & hygiene registers | **(b) new** | Separate from pest treatment; append-only, status-tracked. |
| Recommendation register | **(b) new** | Separate from service reports; status lifecycle. |
| Customer timeline | **(b) new** | Substrate: `audit_log` (mig 001) + `outbox_events`. A projection, not new source data. |
| KPI engine | **(b) new** | Must be nightly, deterministic (Layer 2). |
| Drill-down dashboard | **(b) new** | Extends the thin K4 `/dashboard`. Enforces the traceability principle (§3). |
| Service report & post-inspection redesign | **(a) partial + (b)** | Builds on `service_reports`, `job_checklists`, `checklist_templates`, `document_templates`, and the K4 on-device PDF. The redesign (trends, post-inspection form, registers link) is new. |
| Email / notification architecture | **(b) new** | Substrate: `reminders` (mig 012). Add delivery logging (sent/delivered/bounced), templates, channels. |
| Document expiry engine | **(a) partial + (b)** | `reminders` (types incl. compliance/vehicle/visa, `due_date`, mig 012) is the substrate. Engine + configurable intervals + a `documents` table with expiry are new. |
| Estimation engine & category code engine | **(b) new** | Category code becomes the scheduling input (replaces hardcoded assumptions). |
| Sales representative app | **(b) new** | Reference implementation: the K3 offline field-PWA pattern (Dexie + outbox + R2 sync). |
| Customer registration wizard | **(b) new** | Guided multi-step; writes through the existing domain layer. |
| Import/export engine | **(a) roadmap + (b)** | Bulk-import doctrine (`CONSTITUTION` Art. VII §5: staging → dry-run → approve) + planned **K5**. The engine/module + template spreadsheet are new. |

### TIER 3 — Needs dedicated design session (flag only, do NOT sequence)

| Item | Mark | Note |
|---|---|---|
| Permissions engine | **(c)** | RLS is the in-DB backstop (mig 009); app-layer RBAC (owner/ops/finance/HR/sales/warehouse/technician/auditor) needs its own design. |
| Approval engine | **(c)** | Maker-checker is named in `CONSTITUTION` Art. VIII; the raise→review→temporary-permission→audit flow needs design. |
| Business rules engine | **(c)** | Partial substrate: `settings` + `ASSUMED` + `field_definitions`. A general rules engine is a design problem. |
| Workflow engine | **(c)** | Substrate: `checklist_templates` + job states. **Changes the technician-app spine, currently proven offline (Art. III P1) — any change re-proves offline behaviour.** |
| Diagnostic agent | **(c)** | See also Explicitly Deferred (the production-log-access variant). |

### EXPLICITLY DEFERRED — not scheduled

| Item | Mark | Note |
|---|---|---|
| Diagnostic agent w/ production log access | **(c) deferred** | A security-design problem in its own right, separate from this platform. Do not fold into MOP. |
| Public booking site w/ instant pricing | **deferred** | Aligns with `CONSTITUTION` Art. XI (no customer self-service booking in v1). |
| Promo / discount pricing engine | **deferred** | Not scheduled. |
| WPS payroll | **(a) already out of scope** | `CONSTITUTION` Art. XI: no full payroll/WPS — "we store, we export." |
| Customer login portal | **(a) aligns with Constitution** | Art. VI: external parties (customers, auditors, inspectors) get scoped, expiring links — never logins. |

### AI-related items — already governed
The three-layer intelligence architecture, two report generators, and reliability
modes (Doc 5) are consistent with `CONSTITUTION` Art. IV (AI last) and Art. XVII
(RouteProvider seam). They are **(a) governed in principle**; the concrete Layer-2
analytics + Layer-3 adapter are new build (Tier 2 / later phases).

---

## 2. Principles proposed for constitutional ratification

The owner ratifies constitutional amendments (Art. XII); these are **proposed**, not in force.

1. **Reliability — NEW.** *"No single module failure shall prevent core business
   operations."* If email is down, technicians still work; if AI is down, schedules
   still generate; if reports fail, services continue; if notifications fail, jobs
   remain accessible; if analytics fails, invoicing and inventory continue. Every
   module fails in isolation and recovers.
2. **AI boundary — restates Art. IV, formalise wording.** *"AI shall never run the
   business. AI shall only explain the business."*
3. **Traceability — NEW.** *"Every dashboard metric must be traceable to raw
   operational data, including the exact formula used."*

---

## 3. Open decisions (resolve before the relevant tier builds)

- **Group invoicing/consolidation:** one invoice covering all sites, separate
  invoices per site, or a statement summarising many? Same question for **schedule
  notices** and **service reports** for a multi-site group. (Docs 3 & 5)
- **12-hour reminder email:** does it earn its place? ~3,500 visits/yr × 2 emails =
  ~7,000 emails/yr. (Doc 3)
- **Team-leader contact number:** a company number routed to the current team leader
  vs. a personal mobile — continuity + privacy. (Doc 3)
- **Night-shift day assignment:** how a job crossing midnight maps to a schedule day,
  attendance, route windows, and the "today's jobs" query. Schema-level. (Docs 1 & 2)

---

## 4. Filed requirement documents (source detail, verbatim)

### DOCUMENT 1 — Operational Workflow Requirements

**Sales representative app (offline-first).** Create customer, capture GPS
automatically, reverse geocode address, record customer information, legal company
name, trade licence number, TRN, contact person, mobile, email, business category,
service category, notes, photos, estimated area, service frequency, attach documents,
obtain digital signature. Sync automatically on reconnect. GPS stored permanently,
never re-geocoded unless edited.

**Customer registration wizard.** Guided workflow: Customer Information → Site
Information → Documents → Agreement → Service Details → Scheduling → Review → Submit.

**Document management.** Configurable required documents at registration: trade
licence, municipality licence, VAT/TRN certificate, floor plan, site layout, previous
reports, other attachments. Each document carries: type, issue date, expiry date,
notes, uploaded by, version. Documents with expiry dates auto-register with the expiry
engine.

**Document expiry engine.** Reusable engine monitoring customer documents, employee
documents, vehicle documents, insurance, certificates, municipality licences, trade
licences, service agreements. Configurable reminder intervals (90/60/30/14/7 days,
expiry day, after expiry). Actions: email customer, notify operations, notify sales,
dashboard alert, future task generation. Configurable email templates.

**Estimation engine.** Configurable questionnaire per business category (restaurant,
warehouse, office, school, factory, villa, retail). Outputs: estimated area, estimated
duration, technician count, chemical requirement, recommended frequency, estimated
contract value, operational complexity, estimated service time.

**Category code engine.** Every service receives an internal operational category code
storing estimated duration, technician count, vehicle type, chemical profile,
operational complexity, scheduling weight, priority. Future scheduling relies on this
code rather than hardcoded assumptions.

**Quotation workflow.** After estimation: generate quotation request, email draft,
WhatsApp summary, route to quotation department. Architecture stays open for future
automation.

**Scheduling engine.** Contract approval auto-creates recurring schedules; admin may
override. Scheduler considers technician availability, working hours, service duration,
traffic, travel time, operational buffer, customer priority, vehicle, skills, frequency.

**Depot configuration.** Admin configures home depot GPS, working hours, shift times,
default start, default finish. Every optimised route begins and ends at depot.

**Shifts — day and night.** The platform must support two shifts. Night shift work
crosses midnight, which affects schedule day assignment, attendance, route optimisation
windows, and the "today's jobs" query. This is schema-level, not cosmetic.

**Technician assignment UI.** Assign technician, vehicle, team leader, assistants.
Manual override, automatic assignment, drag and drop, reassignment. UI must be simple
enough to require no training.

**Technician daily workflow (pre-flight).** Before jobs become available: attendance,
vehicle selection, equipment checklist, chemical checklist, PPE, fuel, odometer,
vehicle condition, ready confirmation.

**Team attendance.** Team leader selects today's employees. Unassigned employees
auto-marked absent. Architecture open for future payroll integration.

**Technician service workflow.** Receive jobs → navigate → arrival → pre-inspection →
treatment → before photos → after photos → checklist → customer signature → payment
collection → expense entry → completion → automatic sync.

**Inventory engine.** Warehouse → vehicle issue → today's allocation → consumption →
return → warehouse. Every movement logged.

**Chemical usage engine.** Every service template stores expected chemical consumption.
System calculates expected issue. Technician records actual usage. Variance reported.
Inventory updated automatically.

**Payment collection.** Cash, cheque, card, bank transfer. Receipt auto-generated
containing company details, TRN, receipt number, invoice reference, customer,
technician, payment method, amount. PDF downloadable, shareable via WhatsApp or email.

**Expense engine.** Sources: company credit, petty cash, cash collection, personal
reimbursement. Each expense requires category, amount, purpose, receipt, photo, GPS,
time, vehicle. Accounting ledger updates automatically.

**Fleet tracking.** Real-time technician GPS during working hours. Dashboard shows
vehicle, current location, current job, ETA, delay, completed jobs, remaining jobs.

**Time engine.** Every service template stores estimated duration. Scheduler considers
travel, traffic, parking, service duration, buffer, return to depot. Schedules must
avoid unrealistic workloads.

**Cleaning and manpower deployment.** Recurring cleaning contracts: daily, weekly,
monthly, deep cleaning, general cleaning. Deployment scheduling. Future support for
technician pickup/drop-off optimisation between nearby teams.

**Service templates.** No hardcoded workflows. Every service is template-driven.
Template defines checklist, photos, chemicals, equipment, technicians, duration,
reports, customer fields, documents. Supports future divisions without code duplication.

**Master data management.** Every master dataset has an admin UI: customers, employees,
vehicles, chemicals, equipment, business categories, service categories, questionnaires,
pricing rules, expense types, payment methods, service templates. No manual database
editing.

**Import and export engine.** CSV/Excel import for customers, contracts, employees,
inventory, vehicles, chemical stock, pricing. Export for reporting. Provide a template
spreadsheet with exact sheet names, column headers, one example row per sheet, and a
notes column explaining each field.

**Notifications.** Configurable notification engine: contract signed, job assigned, job
completed, payment received, low stock, document expiring, employee absent, vehicle due
for maintenance. Channels: dashboard, email, future SMS/WhatsApp.

**Storage provider abstraction.** Storage must be provider-independent. Initial provider
Cloudflare R2. Future: Google Drive, S3, Azure Blob, local. No module depends directly
on one provider. *(Note: K4 shipped a concrete R2 adapter in `apps/ops-console/lib/
storage/r2.ts`; the formal provider interface is still to be introduced.)*

**Documentation.** Each module includes business documentation, technical documentation,
API documentation, database documentation, workflow documentation, deployment
documentation, administrator guide, user guide, ADR, test cases, changelog.
Documentation is part of Definition of Done.

### DOCUMENT 2 — Schedule Conflict & Cancellation Handling

**Mode 1 — future days (day-before planning). Recalculation is safe.**
- Requesting a conflicting slot flags the conflict and shows what it would displace.
- Office can force-insert; the day re-sequences.
- Jobs with hard time windows are pinned and never moved.
- Show before/after so the office can see what changed.

**Mode 2 — today (live). NEVER silently recalculate.**
- A technician is mid-route with a cached offline schedule.
- Conflicts and cancellations raise a flag to the office console, not an automatic
  reshuffle.
- Office decides and pushes the change; if the technician is online their app refreshes,
  if offline the office informs them directly.
- Define exactly what a technician sees when their day changes mid-route.

**Cancellation (the common case, not an edge case).**
- Customer absent, site inaccessible, gate locked.
- Technician marks job failed with reason; slot frees up.
- If online, offer to pull the next job forward.
- If offline, notify office to decide.
- Cancelled job returns to the scheduling pool for rebooking.

**Intelligent job insertion (Phase 4 — depends on scheduling engine, route optimisation,
category codes).**
- Recommend available slots based on team capacity, job duration, travel time from
  adjacent jobs, working hours, depot return.
- Allow custom date/time override with recalculation.
- Design must handle: pinned time windows, jobs already started or en route, days that
  genuinely cannot absorb the job, and reconciliation with technicians holding cached
  offline routes.

**Governing principle (design rule):** The system flags, a human decides, the correction
is one action in the admin console, and the system returns to normal operation
automatically. Every exception must have an in-system fix. No workaround should require a
spreadsheet, a phone call as the only record, or leave the system in a permanently manual
state.

### DOCUMENT 3 — Customer Communication & Email Architecture

**Schedule notifications.**
- Automatic email 24 hours before scheduled service.
- Automatic email 12 hours before scheduled service (evaluate whether this earns its
  place — 3,500 visits/year at two emails each is 7,000 emails).
- Approaching/ETA notification, fired when the technician completes the previous job —
  depends on technician being online.
- Night shift services require appropriately worded timing notices.
- Templates configurable with placeholders: customer name, on-site contact/manager name,
  service details, team details.

**Notification only — no self-service.**
- No reschedule links, no cancellation links, no booking links in notifications.
- To change or cancel, the customer calls the assigned team leader.
- Team leader contact number surfaces from the employee record for the team assigned to
  that job.
- Consider a company number routed to the current team leader rather than a personal
  mobile — continuity when staff change, and it keeps personal numbers private.

**Annual schedule document.**
- On contract confirmation, generate a per-customer schedule document listing all visits
  for the year.
- Include a clause: auto-generated from our system, subject to change, approximately 80%
  on-time adherence, changes will be communicated.
- Any subsequent schedule change must auto-trigger a notification email to the customer
  AND an internal notification instructing staff to call and inform them.

**Access requirements in notices.** Include site-specific preparation instructions
("ensure kitchen is accessible and food surfaces cleared") to reduce failed visits.

**Post-service.**
- Service report auto-emailed on sync, PDF attached.
- Certificate generated on renewal for client audit purposes.

**Delivery integrity.**
- Log every email: sent, delivered, bounced.
- Bounce raises a data-quality flag on the customer record — never fail silently.
- Office must be able to manually re-send any notification.
- Escalation rule: three no-access visits at the same site raises a commercial flag, not
  just an operational one.

**Consolidation question (needs decision).** For a customer group with many sites: does
each site receive its own notice, or does the group contact receive one consolidated
schedule? Same question for service reports and invoices — one per site, one consolidated,
or a statement summarising many.

### DOCUMENT 4 — Service Report & Post-Inspection Design

**Report structure.**
- Half 1: customer identity — legal name, trade name, alias, address, contract reference,
  visit N of 24.
- Half 2: today's service — chemicals used, areas treated, findings.
- Trends: bar graph over last 3 services — infestation level, hygiene score, structural
  score. Pure arithmetic, no AI.
- Most frequently flagged issue across recent visits.
- Recommendations: template sentences assembled from structured input.
- Keep it short but comprehensive-looking. Not confusing.

**Post-inspection form (technician, offline, button-driven).**
1. Select area from a configurable list per business category (restaurant: kitchen,
   pantry, dining, storage, sink, cooking area, exhaust hood, chimney).
2. Select issue type: hygiene / structural / other (other requires free text).
3. Photo optional per issue.
4. Scores: hygiene 1-5, structural 1-5, infestation none/low/moderate/high — buttons,
   not sliders.

Area lists and issue types are reference data, editable in admin. A tenth-grade student
must be able to complete the form.

**Sentence generation.** Templates, not AI. "A hygiene issue was identified in the
{area}." Assembled deterministically. 3,000 reports per year must cost zero inference.

### DOCUMENT 5 — Operational Intelligence & Enterprise Features

**Municipality and compliance module.** First-class module generating: municipality
inspection report, monthly chemical utilisation report, customer service history, pest
trend analysis, non-conformance report, corrective action report (CAPA), preventive
action report, complaint register, chemical inventory report, technician activity report,
compliance summary. All reports: branded per division, engineer signature, authorised
signatory, company stamp, PDF export, version history.

**Municipality inspection pack.** One click on a customer produces a single PDF
containing contract, trade licence, municipality licence, service reports, chemical usage,
technician history, recommendations, photos, complaint history, trend charts.

**Customer health and risk engine.** Continuously updated score per customer (e.g.
92/100, low risk) derived from pest activity, complaint frequency, missed visits, hygiene
observations, structural issues, open recommendations, document compliance, contract
compliance. Dashboard highlights customers requiring attention.

**Pest trend analytics.** Track cockroach, rodent, fly, mosquito, bed bug, ant, termite,
other species over time. Graphs and historical trends per customer, group, emirate, and
company. Demonstrates service effectiveness.

**Chemical traceability.** Every chemical tracks supplier, batch number, expiry, vehicle,
technician, customer, service, date, remaining quantity. Full batch traceability — answer
"where was batch XYZ used" in seconds.

**Chemical unit costing (critical for profitability).** Purchase logged with quantity,
unit size, and cost — e.g. 10L bottle for AED 100 yields cost per ml. Record intended
service types, a recurring-purchase flag, and active ingredient for compliance. Without
this, profit-per-contract is unknowable, and that is the Phase 5 exit criterion.

**Structural and hygiene registers.** Separate from pest treatment. Structural: pipe
gaps, broken traps, drain damage, door gaps, ceiling holes, wall cracks, grease build-up,
standing water, food storage. Hygiene: food uncovered, overflowing bins, standing water,
poor sanitation, drain blockage, bird nesting. Each entry: photos, status
(open/closed/ignored/customer declined), responsible party, follow-up history, timestamped.

**Recommendation register.** Maintained separately from service reports. Tracks
recommendation, date, technician, status (open → completed → ignored → customer declined),
completion date, customer acknowledgement. Proves "we informed the customer."

**Customer timeline.** Chronological record per customer, forever: registration, survey,
contract, visits, complaints, payments, recommendations, reports, renewals, municipality
inspections, documents, photos, invoices, receipts.

**Emirate segregation.** Customers belong to an emirate: Sharjah, Dubai, Ajman, Abu
Dhabi, Ras Al Khaimah, Fujairah, Umm Al Quwain. Dashboards, reports, KPIs and analytics
filter by emirate. No duplicated systems — filtering only.

**Customer workspace.** Replace simple customer records with a full workspace: overview,
contracts, quotations, schedules, service reports, photos, documents, payments,
receivables, invoices, receipts, municipality reports, chemical usage, complaints,
recommendations, timeline, analytics.

**Group workspace.** Customer groups are organisational, not legal entities. Customers
remain independent entities; the group sits above them and must be retroactively
assignable to existing customers with history following. Supports group statements, group
receivables, group municipality reports, group analytics, group service reports, group
KPIs, a group-level contact, and group-level negotiated pricing. Open decision: one
invoice covering all sites, separate invoices per site, or a statement summarising many.

**Operations intelligence dashboards.**
- Owner: today's revenue, collections, operational profit, receivables, payables, staff
  attendance, jobs completed, fleet status, inventory consumption, customer health,
  contracts due, municipality alerts, KPIs, pending approvals.
- Operations Manager: scheduling, technician assignment, fleet, inventory, attendance,
  complaints, payments, reports, route monitoring, expense approvals.
- Technician App: attendance, pre-flight checklist, assigned jobs, navigation, service
  execution, photos, signatures, payment collection, expense entry, fuel entry, sync
  status.

**Drill-down requirement.** Every dashboard metric must be clickable down to raw
operational data. Today's collections → receipts → customer → technician → payment method
→ invoice → timeline. No magic numbers: tapping a figure must reveal the exact formula and
inputs behind it.

**Daily operations briefing.** Prepared every morning from deterministic calculations:
jobs scheduled today, routes needing extra travel time, documents expiring, stock below
reorder level, team performance variance, customers with repeat complaints, contracts due
for renewal. If AI is enabled it only rewrites this into natural language; if unavailable,
the same facts display as bullet points.

**Operations command center.** A layer above all modules answering: which jobs are at
risk today, which technicians are overloaded, which customers require attention, which
documents expire this week, which vehicles need maintenance, which chemicals are running
low, which contracts are due for renewal, which customers are becoming unprofitable, what
were yesterday's operational exceptions.

**Inventory intelligence.** Current stock, vehicle allocation, today's issue, today's
return, forecast consumption, low stock alerts, purchase recommendations, upcoming
schedule requirements.

**Finance workspace.** Receivables, payables, invoices, receipts, ledger, bank
transactions, credit purchases, petty cash, expense claims, profitability reports, cash
flow reports.

**KPI engine.** Nightly deterministic calculation of: jobs completed, jobs delayed,
on-time completion rate, average service duration, revenue collected, outstanding
receivables, gross margin by customer and by service type, chemical consumption, inventory
variance, low stock, fuel cost per kilometre, cost per service visit, vehicle utilisation,
conversion rate, average contract value, renewals due, lost quotations, technician
utilisation, complaint rate, renewal rate.

**Approval engine (Tier 3).** Sensitive operations never edit records directly. Flow:
raise request → owner/admin review → approve/reject → temporary permission → audit log.
Applies to invoice edits, receipt edits, customer changes, contract changes, inventory
corrections, financial adjustments.

**Permission engine (Tier 3).** Configurable role-based permissions: owner, operations
manager, finance, HR, sales, warehouse, technician, read-only auditor. No hardcoded
permissions.

**Business rules engine (Tier 3).** Configurable from the admin console without code
changes: expense approval limits, mandatory customer documents, invoice generation rules,
payment terms, contract renewal timing, low stock thresholds, chemical issue formulas,
scheduling rules, customer category rules, technician assignment rules, municipality-
specific compliance rules.

**Workflow engine (Tier 3).** All operational workflows template-driven across pest
control, cleaning, facilities management and future divisions. Workflows define steps,
checklists, required photos, required documents, required signatures, reports, chemical
calculations, completion criteria. **Note: this changes how jobs move through states — the
technician app's spine, currently proven working offline. Any change requires re-proving
offline behaviour.**

**Audit trail.** Every important action immutable: who changed what, old value, new value,
user, time, IP, reason. *(Substrate: `audit_log`, mig 001.)*

**Three-layer intelligence architecture.**
- Layer 1 — Operational Engine: 100% deterministic. Which jobs are due, who is assigned,
  chemical issue quantities, actual usage, cash collected, operational profit, unpaid
  invoices. Same inputs always produce same outputs.
- Layer 2 — Analytics Engine: mathematical formulas only. Revenue, collections, fuel,
  expenses, profit, technician productivity, vehicle utilisation, inventory consumption,
  renewal rate, complaint rate, customer profitability.
- Layer 3 — Intelligence Layer: optional AI. Receives a structured object only — never
  queries the database directly. Explains KPIs, summarises reports, produces municipality
  narratives and management summaries, highlights trends, suggests improvements. If
  unavailable, the system operates normally.

**Two report generators.** Generator 1 (default): pure code, always deterministic, 100%
reliable. Generator 2 (on request): AI makes the same facts read better. Prompt constraint
— do not invent facts, use only supplied data. AI makes it prettier, never different.

**Reliability modes.** Critical (must fail safely): scheduling, customer database,
technician sync, inventory, payments. Important (can retry): reports, analytics,
notifications. Optional (can be unavailable): AI insights, trend summaries, forecasts.

**Reliability principle (adopt now):** "No single module failure shall prevent core
business operations." If email is down, technicians still work. If AI is down, schedules
still generate. If report generation fails, services continue. If notifications fail, jobs
remain accessible. If analytics fails, invoicing and inventory continue. Every module must
fail in isolation and recover.

**Constitutional principle (propose for ratification):** "AI shall never run the business.
AI shall only explain the business."

**Traceability principle (propose for ratification):** "Every dashboard metric must be
traceable to raw operational data, including the exact formula used."

### DOCUMENT 6 — Customer Data Model Additions

**Name fields.** `customers` requires `legal_name`, `trade_name` and `alias_name` as
separate fields. Example: trade name "McDonald's Branch 134", legal name "Emirates
Hospitality Company Branch 134". Both are needed — trade name for recognition, legal name
for tax invoices. *(legal_name + trade_name already exist, mig 004; alias_name is new.)*

**Location source.** `branches` requires `location_source`: whatsapp_link / address_search
/ technician_captured / office_estimate. Rationale: a pin from a customer's shared WhatsApp
location is reliable; a pin from an address search is a guess; a pin captured at the door
is truth. If all three look identical in the database, a technician will eventually drive
to a geocoding error. Unverified pins must be flagged in the technician app so they confirm
on arrival. Support pasting a Google Maps link to extract coordinates — this matches how
customers already share locations. *(The K3 ad-hoc job screen already parses pasted Google
Maps links.)*

**Access notes.** Permanent per-branch access knowledge: gate codes, which lift, security
desk, parking, who to ask for. Distinct from per-job communication between office and
technician, which is a separate feature. *(Substrate: `customer_branches.access_notes`,
mig 004.)*

---

## 5. Amendment — Service-Driven Platform / Multi-Division (filed 29 Jul 2026)

**Filing only. No code, migration, or schema change was written for this amendment.**
Nothing here is authorised for build. The constitutional principle in §5.5 is a
**candidate for owner ratification** (Art. XII), not in force.

### 5.1 Extension vs replacement — the decision that gates everything (answers the owner's question)

K1 already ships `service_line_id`, `treatment_recipes`/`_versions`, `field_definitions`
+ `validate_entity_attributes`, and JSONB `attributes` on core entities. The
Service-Driven Platform (Division Engine, Service Definition Engine, Estimation/Survey
engine, Pricing Model Engine) must **EXTEND these, not replace them.** Replacement is
explicitly *not* recommended and would be a constitutional-grade change (see cost below).

| K1 structure | Verdict | How it extends |
|---|---|---|
| `service_line_id` (on ~every table) | **EXTEND** | It is the seed of "division." The Division Engine adds a richer configuration layer keyed to service lines (or promotes `service_lines` into `divisions` additively). The FK stays; no table loses it. |
| `field_definitions` + `attributes` JSONB + `validate_entity_attributes()` | **EXTEND** | This *is* the runtime-extensible-field spine K1 built for exactly this. A **survey template** is a versioned, ordered collection of `field_definitions` scoped to a division/service; answers land in existing `attributes` JSONB and are validated by the existing trigger. Build on it. |
| `treatment_recipes` / `treatment_recipe_versions` | **EXTEND** | Generalise into a "service operational / inventory formula"; **recipes remain the pest-control instantiation.** Frozen recipe snapshots on append-only `service_reports` are immutable and must not be rewritten. |
| `pricing_models` + `price_lists` / `_versions` | **EXTEND** | `pricing_models` is already a catalogue; the Pricing Model Engine adds the model-type *strategies* (per_sqm, per_duct, formula, …) as configuration over the existing versioned/frozen pricing tables. |

**If a future design proposes REPLACEMENT instead**, it is a migration touching working
K1–K4 code, frozen/append-only records (`service_reports`, `journal_lines`,
`generated_documents`), and the technician-app job-state flow proven offline. Per the
Architecture Baseline that requires, before any code: the affected-modules statement, a
regression plan, an **offline re-proof**, and owner approval — and if it relaxes a
structural invariant, an Art. XII amendment. The owner has asked to see that cost before
agreeing; the default answer is **extend**.

### 5.2 Tiering of the amendment's items (corrections #2 and #4 applied)

**TIER 3 — needs a dedicated design session; changes the job-state spine → re-prove offline (Baseline).**
- **Service Definition Engine** — subsumes the workflow, pricing and category engines into one configurable unit and **changes how jobs move through states** (the technician app's spine, currently proven offline). *(Corrects the source doc, which framed it as a refinement.)*
- **Division Engine / Universal Division Builder** — create any division from the UI (config, not code).
- Division-specific **category / estimation / workflow** builders.
- **One Estimation Engine** that loads per-service logic (survey + estimation change per selected service) — part of the same state-flow change.
- **AI profitability recommendations** for manpower/allocation — Analytics Layer only, **recommendation-only**, never auto-acts (Art. IV).
- **Retail quotation mode** (hide internal margin on the customer-facing document) — filed Tier 3 per owner; *note: relatively contained (a document-rendering variant) and a candidate to pull into Tier 2 at design time.*

**TIER 2 — real modules on existing substrate; less entangled.**
- **Pricing Model Engine** *(correction #4 — its own Tier 2 item)* — one reusable engine supporting: fixed, per hour, per day, per person, per month, per visit, per m², per apartment, per room, per floor, per duct, per linear metre, quantity × unit price, formula-based, custom. **Each service selects which model(s) it supports.** Extends `pricing_models` + `price_list_versions`.
- **Manpower supply estimation + deployment costing** — see §5.4 (needs its own contract/period costing path).
- **Fixed-price vs hourly quotations** — a subset of the Pricing Model Engine.
- **Cleaning category-engine improvements.**
- **Survey → quotation** direct conversion; **quotation → contract → scheduling** refinement.
- **Automatic slot suggestion** after contract approval; **live ETA notification** when a technician completes the previous job; **manual schedule → auto-recurring** transition; **GPS capture on first visit**.
- **Personal (non-contract) customer workflow.**
- **Per-division inventory auto-issue toggle** — see §5.4.

### 5.3 Candidate constitutional principle (correction #5 — Art. XII, owner ratifies)

Recorded **verbatim as a candidate**, not adopted. Per Art. XII an agent may propose but
"may never act as though an unratified amendment is in force."

> *"The platform shall be service-driven, not hardcoded. Every business service is defined
> through configurable service definitions, each with its own categories, survey,
> estimation, pricing, workflow, inventory, scheduling, reporting, and compliance rules.
> New services must be addable without changing the core application."*

Related principles already filed for ratification in §2 (reliability, AI boundary,
traceability) remain candidates likewise.

### 5.4 Confirmations requested (correction #6)

**(a) Does the costing engine (019–023) extend to manpower supply?** *Partly — inputs yes,
model no.*
- **Covered:** `employee_cost_components` (mig 019) already captures the full manpower cost
  basis — basic, accommodation, transport, medical, visa/EID (amortised), air ticket,
  gratuity → `monthly_employment_cost`. Reuse it directly.
- **Not covered:** the `job_costs` engine (023) is **job-centric** (per job, on
  `job.completed`, labour-by-time-on-job, vehicle-by-distance, material valuation).
  Manpower supply has **no jobs, no distance, no materials** — profitability is *monthly
  contract revenue − deployed staff monthly cost (salary + accommodation + transport)*.
- **Verdict:** the deployment/manpower engine needs its **own contract/period costing
  path** (sum assigned employees' relevant monthly components against the recurring
  contract revenue). It **reuses** `employee_cost_components` but does **not** ride the
  job-absorption model. Filed Tier 2 (§5.2).

**(b) Can inventory be configured per division to track purchases WITHOUT auto-issue?**
*Yes — and cleaning must not auto-calculate consumption.*
- Today, auto-issue fires **only** from a job's frozen recipe/dose
  (`generation_snapshot.dose`). A division with no dosing recipe already records purchases
  (`recordPurchase`) with **no** automatic consumption — so cleaning, having no dose
  recipes, would not auto-issue.
- **Recommendation:** make this **explicit** rather than an accident of missing recipes —
  a per-division/service-line setting (e.g. `inventory.auto_issue_enabled`, default **off**
  for non-dosing divisions). Small Tier 2 refinement (§5.2). Cleaning stays purchase-only.

### 5.5 Source document (filed verbatim)

#### DOCUMENT 7 — Service-Driven Platform / Multi-Division (verbatim)

**One estimation engine, not separate modules.** Do not build separate estimation modules;
build one Estimation Engine that loads different logic depending on the selected service.
Example: Division → Facilities Management; Service → Manpower Supply; Pricing Model → Fixed
Contract / Per Person Per Month / Per Hour / Per Day / Custom. The survey then changes
automatically. For Manpower Supply the survey could ask: number of personnel; job role
(cleaner, helper, technician, …); working hours; monthly or hourly; accommodation provided?;
transport provided?; uniform provided?; visa required?; contract duration; customer
location. The engine then calculates: revenue; salary cost; accommodation cost; transport
cost; visa / amortised onboarding cost; management overhead; gross profit; gross margin %.
Then the standard flow follows: Estimate → Quotation → Approval → Agreement → Recurring
Invoice Schedule → Payment Tracking → Accounting — exactly the same workflow as every other
service.

**AI must not decide pricing.** Profitability analysis belongs in the Analytics Layer. After
three months the owner dashboard might say: "Manpower Contract ABC has a gross margin of 8%
against a company target of 20%. The assigned staff are underutilised, and the same labour
capacity could generate higher returns in pest control." That is a recommendation only. It
must never automatically change prices, move staff, or alter contracts.

**Reusable Pricing Model Engine.** Instead of every service having its own isolated pricing
engine, build one reusable Pricing Model Engine supporting: fixed price, per hour, per day,
per person, per month, per visit, per square metre, per apartment, per room, per floor, per
duct, per linear metre, quantity × unit price, formula-based, custom. Each service chooses
which pricing model(s) it supports. Adding a new division like rope access or HVAC
maintenance becomes configuration rather than code.

**The long-term pipeline.** Division → Service → Survey → Category → Estimation → Pricing →
Quotation → Approval → Agreement → Scheduling/Deployment → Execution → Inventory/Labour/
Expenses → Accounting → KPI & Analytics. Every new business line plugs into the same
pipeline while changing only its survey, category definitions, pricing rules and workflow;
the core engine remains unchanged.

**Division Engine.** Do not build separate hardcoded modules for pest control, cleaning, AC
duct cleaning, kitchen duct cleaning, water tank cleaning and so on. Build a Division Engine.
The system starts with no assumptions. Admin creates a division; each division owns its own
configuration: category engine, survey template, estimation engine, pricing rules, service
templates, checklist templates, required photos, required documents, required equipment,
required chemicals/materials, required PPE, technician requirements, report template,
certificate template, completion workflow, KPI definitions, municipality/compliance rules.

**Worked examples.** *Pest Control* — categories: apartment, villa, restaurant, hotel,
warehouse; survey: pest type, floors, kitchens, garbage rooms, drain count; chemicals:
cypermethrin, gel, bait, glue board; reports: pest report, municipality report, chemical
utilisation. *Cleaning* — categories: office, villa, school, warehouse; survey: floor area,
washrooms, windows, marble, carpet, staff required; materials: detergent, degreaser, mop,
vacuum; reports: cleaning checklist, completion report. *AC Duct Cleaning* — categories:
villa, apartment, commercial, hospital; survey: ducts, duct length, AHU units, diffusers,
ceiling height; equipment: vacuum, brush machine, camera; reports: before/after photos, air
quality report, completion certificate.

**What this means.** Clicking "Add Division" creates a configuration, not code. That division
automatically gets its own survey, category engine, pricing engine, scheduling rules,
reports, dashboards and KPIs.

**Service Definition Engine.** Rather than only a Category Engine, create a Service Definition
Engine. A service definition contains: division, service, categories, survey template,
pricing formula, operational formula, scheduling formula, inventory formula, report template,
workflow, notification templates. Everything related to that service lives inside one
definition. Five years from now, adding solar panel cleaning, bird control, swimming pool
maintenance, landscaping or HVAC maintenance requires no new software — only a new service
definition with its survey, pricing, workflow and reports configured.

**Proposed constitutional principle (candidate — requires owner ratification):** "The
platform shall be service-driven, not hardcoded. Every business service is defined through
configurable service definitions, each with its own categories, survey, estimation, pricing,
workflow, inventory, scheduling, reporting, and compliance rules. New services must be
addable without changing the core application." *(Filed as candidate in §5.3.)*

**Refinements noted (tiered in §5.2):** Universal Division → Category Engine; fully
customisable service divisions; cleaning category engine improvements; manpower supply
estimation; fixed-price vs hourly quotations; AI profitability analysis for manpower
allocation (analytics layer, recommendation only); retail quotation mode (hides internal
margin from the customer-facing document); survey converts directly to quotation; quotation →
contract → scheduling flow refinement; automatic slot suggestion after contract approval;
live ETA notification when a technician completes the previous job; existing customers can
start from a manual schedule then move to auto-recurring; capture GPS during first visit;
personal (non-contract) customer workflow.

**Stated as missing (Tier 3, pending the design session):** Universal Division Builder
(create any division from the UI); division-specific category engine builder;
division-specific estimation engine builder; division-specific workflow builder; retail
quotation mode; manpower profitability recommendations.

---

*End of filing. Nothing above is authorised for build until a sprint in `EXECUTION.md`
picks it up.*
