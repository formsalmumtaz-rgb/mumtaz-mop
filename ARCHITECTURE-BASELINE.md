# ARCHITECTURE-BASELINE.md — Baseline v1

**Frozen:** 25 Jul 2026, after K4 (Golden Thread) completed and verified.
**Purpose:** the reference point every future feature (Tier 1 onward) is measured
against. A feature is acceptable only if this baseline's evidence still passes and
none of its invariants have weakened.

Commit at freeze: run `git log --oneline -1` — Baseline v1 is the tree at the commit
that adds this file.

---

## 1. What K1–K4 delivers (module by module, plain language)

**K1 — Foundations** (`packages/db` migrations, `packages/domain`, `services/worker`)
- A tenanted schema: every table carries `tenant_id` + `service_line_id` from day one,
  so multi-tenant and multi-service-line are free later.
- Editable reference data (service/job/pest types, units, frequencies, pricing models,
  facility types) and **versioned** config (treatment recipes, price lists, checklist &
  document templates) that is effective-dated and immutable once written.
- Runtime-extensible fields (`field_definitions` + validated `attributes`) so new fields
  are admin config, not a migration.
- Commercial core (customers, branches with GPS, contracts), operations (teams,
  technicians, jobs, service_reports), materials & finance (items, stock_movements,
  chart of accounts, journal, invoices with PINT-AE fields).
- A transactional outbox (`outbox_events` + `event_consumers`) — the event bus in
  Postgres. Shared event schemas + a `RouteProvider` interface in `packages/domain`.
- The outbox worker drains events to idempotent consumers.
- **Proven:** an event emitted in a transaction is consumed exactly once by two
  independent handlers; replay is a no-op.

**K1b — Admin console** (`apps/ops-console`)
- Customers: list, search, create, edit, confirm-ASSUMED.
- Branches: a **Google Maps** pin picker (display) + **server-side** geocoding; GPS
  stored once as a PostGIS point.
- Contracts: create and **activate** (activation emits `contract.activated`).
- Ad-hoc jobs: a mobile "create job" screen; `job_sources` make jobs exist without a
  contract.

**K2 — Contract fan-out**
- On `contract.activated`, three idempotent consumers generate a 12-month schedule from
  the contract's frequency, the next 30 days of jobs, and a renewal reminder 60 days
  before end. Visit spacing is an editable ASSUMED setting.
- Every generated schedule row and job **freezes** the pricing (and recipe version when
  configured). **Verified:** contract 1330/25 (twice-monthly) → 24 visits.

**K3 — Offline technician PWA** (`apps/field-pwa`)
- Installable PWA (Vite + service worker + Dexie/IndexedDB). Pre-syncs today's jobs +
  site details.
- Full job flow offline: checklist → WebP photo → local chemical dose → signature →
  complete; every write hits IndexedDB + an outbox with a client UUID.
- On-device PDF report (jsPDF; logo; Arabic RTL rendered via canvas).
- **Proven genuinely offline:** with the server stopped and the network unreachable, the
  app loaded from cache, completed jobs, and lost nothing across a reload.

**K4 — Close the loop**
- Reconnect drain: events → server (deduped by client UUID), photos/signatures → **R2**.
- On `job.completed`: queue an invoice (per-treatment bills per visit with buyer identity
  frozen at issue; fixed-annual is not per-visit billed) and deduct stock via append-only
  `stock_movements`.
- Live owner dashboard (jobs today / completed / revenue / outstanding).
- **Proven:** interrupted sync is exactly-once (mid-drop + lost-ack); full dry-run ALL
  GREEN with a real R2 upload.

---

## 2. Baseline evidence (executable — captured 25 Jul 2026)

Re-run any of these to check the baseline still holds. `DATABASE_URL` from `.env.local`;
`psql` = `/usr/local/opt/libpq/bin/psql`.

| Evidence | Command | Baseline result |
|---|---|---|
| Worker test suite | `node --env-file=.env.local --import tsx --test services/worker/test/*.test.ts` | **8 tests, 8 pass, 0 fail** |
| RLS isolation (non-privileged role) | `psql "$DATABASE_URL" -f packages/db/tests/rls_isolation.sql` | **PASSED — 4 checks** |
| DB invariants | `psql "$DATABASE_URL" -f packages/db/tests/invariants.sql` | **ALL INVARIANT CHECKS PASSED** |
| Schema fingerprint | `psql "$DATABASE_URL" -tA -f packages/db/tests/fingerprint.sql \| wc -l` | **1315 descriptors** |
| Full Golden Thread dry-run (real R2) | `node --env-file=.env.local --import tsx apps/ops-console/scripts/dry-run.ts` | **ALL GREEN (6 checks)** |
| R2 connectivity | `node --env-file=.env.local --import tsx apps/ops-console/scripts/r2-check.ts` | **upload+retrieve+delete OK** |
| Migrations | `ls packages/db/migrations/*.sql` | **13 (001–013)** |
| Builds | `pnpm --config.verify-deps-before-run=false --filter @mop/ops-console build` and `... @mop/field-pwa build` | both **pass** |

**Reproducibility rebuild (the byte-identical proof):** capture the fingerprint
(`baseline.txt`), wipe the public schema, re-apply migrations `001`–`013` **from the
files**, re-capture (`after.txt`), and `diff baseline.txt after.txt` — an **empty diff**
is the guarantee the migration set alone reproduces the schema. Baseline v1 = **1315**
descriptors, empty diff.

---

## 3. Structural invariants — MUST NEVER WEAKEN

| # | Invariant | Enforced by | Tested by |
|---|---|---|---|
| 1 | **Exactly-once event processing** | `event_consumers (consumer_name, event_id)` PK; event insert + business write in one transaction; drain is idempotent | `exactly_once.test.ts` (incl. concurrent webhook+sweeper), `interrupted_sync.test.ts` |
| 2 | **debits = credits** (in the DB, not app code) | deferred constraint trigger `journal_lines_balanced` + per-line debit-XOR-credit CHECK (mig 007) | `invariants.sql` |
| 3 | **Append-only** on `stock_movements`, `journal_lines`, `service_reports`, `audit_log`, `generated_documents` (+ `outbox_events` content) | `enforce_append_only()` triggers block UPDATE/DELETE; corrections are reversing entries | `invariants.sql` (audit_log, stock_movements) |
| 4 | **RLS tenant isolation**, verified with a **non-privileged** role | `tenant_isolation` policies + `app_current_tenant()`; the `mop_app` role has no bypass | `rls_isolation.sql` (4 checks) |
| 5 | **Version immutability** on reference data | `enforce_version_immutable()` on `treatment_recipe_versions`, `price_list_versions`, `checklist_template_versions`, `document_template_versions`, `team_assignments` — only `effective_to` may close; values immutable | `invariants.sql` (recipe version) |
| 6 | **Frozen snapshots** on transaction records | `service_reports.snapshot`+`recipe_version_id`, `jobs.generation_snapshot`, `contract_schedule.snapshot`, `invoice_lines` frozen price/VAT, `invoices` frozen buyer identity (SCHEMA.md F1–F4) | `fanout.test.ts`, `billing.test.ts`, `dry-run.ts` |
| 7 | **Byte-identical migration rebuild from empty** | migrations only; no dashboard edits | fingerprint diff after wipe+reapply (§2) |

Weakening any of these is not an implementation choice — see §4.

---

## 4. Standing rule for every future feature (Tier 1 onward)

**Before writing any code for a feature:**
1. **Identify affected modules and why** — which tables, events, consumers, apps.
2. **Provide a regression test plan** — which of the §2 evidence items and §3 invariants
   the change touches, and how each will be re-proven.

**Hard constraints — a feature may NEVER weaken or bypass:**
- offline sync (the technician-app spine),
- scheduling integrity,
- inventory accuracy (append-only stock),
- payment recording,
- audit logging,
- or any invariant in §3.

**If a feature genuinely requires relaxing an invariant**, that is a **constitutional
amendment requiring the owner's explicit approval** (CONSTITUTION Art. XII) — never a
silent implementation decision. Stop and ask.

**Definition of Done gains one line:** the §2 evidence still passes and the fingerprint
diff is empty (or the delta is explained and expected).

---

## 5. Manual verification set — OWNER must check on a real device

These cannot be verified in the build/automation environment (software-WebGL sandbox,
no camera, no real service-worker install). **No release is accepted until every box is
ticked on a real phone.**

**Airplane-mode job completion**
- [ ] Install the field PWA (Add to Home Screen), open it online, tap "Sync today's jobs".
- [ ] Enable airplane mode. Complete a job: checklist, photo, signature, Complete.
- [ ] Force-close the app, reopen (still airplane) — the completed job and "N to sync"
      are still there; nothing lost.
- [ ] Disable airplane mode — "N to sync" drops to 0; the office sees the completion.

**PDF report rendering**
- [ ] On a completed job, tap "Generate report (PDF)".
- [ ] The PDF opens with the Mumtaz Pest Control logo, brand red, job/customer/site,
      checklist, signature, and a correctly-shaped **Arabic** section.

**Map tiles**
- [ ] On the admin console (real Chrome), open a customer → "Add a site" — the Google map
      renders tiles; clicking drops a pin; "Find on map" resolves an address.

**Photo capture + upload to R2**
- [ ] Capture a photo in the field app; confirm it compresses (WebP) and appears as a
      thumbnail offline.
- [ ] After reconnect, confirm the photo uploads and is retrievable (R2 public URL /
      `job_photos` row).

---

*Baseline v1 is frozen. Any change that alters §2 evidence or §3 invariants is reviewed
against this document before merge.*
