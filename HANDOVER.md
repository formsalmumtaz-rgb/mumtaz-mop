# HANDOVER.md

**For a fresh Claude Code session with repo + database access but no prior chat
history.** Read `CLAUDE.md`, `CONSTITUTION.md`, `DECISIONS.md`, and
`ARCHITECTURE-BASELINE.md` first — they are binding. This file is a factual
status snapshot written 12 Aug 2026. `[FACT]` = verifiable in the repo or the
database right now. `[ESTIMATE]` = author's judgment. Verify anything before you
rely on it; some `[FACT]`s (test results, applied migrations) are point-in-time
and you should re-run to confirm.

---

## 1. WHERE WE ARE

- `[FACT]` main is at commit `aec075a` (the commit *before* this file). The
  technician-app work landed as PRs **#53–#67**, all merged to main.
- `[FACT]` Migration files run `001` → `059`. Migrations `051`–`059` were applied
  to the shared Supabase project `xpkniuhcjysisfbfiqhn` during this work. Confirm
  with the Supabase `list_migrations` tool — a cold session must not assume.
- `[FACT]` **Technician app T1–T6 is built and merged:**
  - **T1** (#59 server, #60 client): offline auth. Device+server time provenance
    on every field event (`outbox_events.device_time` / `server_received_at` /
    `time_suspect`, mig 054); Bearer re-authorization on `/api/field/*`
    (`lib/field-auth.ts` `resolveFieldRequest`); token revocation → events held
    `needs_review` not discarded (drain skips them, mig 055/056); `/field-review`
    admin screen + dashboard tile. PWA: Supabase login, Bearer sync, revoke lock
    (`apps/field-pwa/src/auth.ts`).
  - **T2** (#62): extracted `@mop/documents` (brandChrome + serviceReportPdf +
    quotationPdf); `/api/field/sync` returns the job's frozen recipe; mig 057
    seeds ASSUMED recipes.
  - **T3** (#63): pre-flight (mig 058 `preflight_checks` + `preflight_checklist_items`);
    `/api/field/preflight`; PWA PreflightScreen.
  - **T4** (#64): post-inspection (mig 059 append-only `job_inspections` +
    `inspection_options`); `job.inspected` event + worker `inspection-recorder`
    consumer; PWA button-driven form + Google Maps deep-link.
  - **T5** (#65): field cash + expense; worker `cash-collector` / `expense-recorder`
    consumers; PWA "Cash & expenses" card.
  - **T6** (#66): honest sync indicator. **The other half of T6 — rewiring the
    on-device report to brandChrome + division logo — is NOT done** (see BLOCKED
    A10).
- `[FACT]` **Filed but NOT built:** `ROADMAP-AMENDMENT.md` (727 lines). Its §0
  states everything in it beyond migrations `001`–`023` is *filed, not built*.
  Two owner requests from this era were also **not built**: the **costing &
  estimation real-configuration** ("Prompt 3": real technician cost, material
  landed-cost, consumption rules, treatment cycle, travel-in-labour) and the
  **RBS / monitoring-points module** ("Prompt 4"). Do not treat either as
  delivered.

---

## 2. WHAT IS PROVEN vs UNVERIFIED

### Proven (automated, against the live DB)
- `[FACT]` **Worker suite** `npm run test:worker` — 10 files
  (`exactly_once`, `fanout`, `inventory` FEFO, `billing`, `recurring_billing`,
  `costing`, `interrupted_sync`, `field_provenance`, `inspection`, `fieldfinance`),
  **19 tests, last run GREEN 12 Aug 2026**. Needs the root `.env.local`
  `DATABASE_URL`. Re-run to confirm — it is intermittently flaky on the shared
  Supabase pooler under concurrency (a clean re-run passes; not a code failure).
- `[FACT]` **`packages/db/tests/invariants.sql`** (append-only, debits=credits,
  version immutability) — last run GREEN 12 Aug 2026.
- `[FACT]` **`packages/db/tests/rls_isolation.sql`** — 20 tenant-isolation checks
  + the no-policy-gap structural guard — last run GREEN 12 Aug 2026. (Runner:
  execute the file via a `pg` client with the session-pooler `DATABASE_URL`.)
- `[FACT]` `scripts/rls-gate.mjs` (no bare `pool.query` in request paths) and
  `next build` (ops-console) + `tsc --noEmit && vite build` (field-pwa) — green.

### Build-verified ONLY (compiles; behaviour not executed)
- `[FACT]` Every **field PWA screen** (login, jobs, job detail, pre-flight,
  inspection, cash/expense, sync indicator) — TypeScript + vite build only.
- `[FACT]` The **agreement `.docx`** generator (#58) — output validated as a real
  OOXML zip (header/footer/media present), but **never opened in Word** by the
  author.

### NEVER exercised — on a real device or in a browser
- `[FACT/ESTIMATE]` The **entire field PWA runtime**: sign-in, session
  persistence across app-kill, **airplane-mode offline day**, camera capture +
  WebP compression, **on-device PDF rendering**, GPS + Google Maps deep-link,
  the **revoke-while-offline → lockout** path, and the full
  offline-then-reconnect sync cycle. All built, none run on a phone.
- `[FACT]` The **ops-console UI in a browser** — the author only ran `next build`
  and `curl`ed status codes (e.g. `/login` → 200). No page was rendered or
  clicked. Visual/interaction correctness is unverified.
- `[FACT]` The **service-report / quotation / agreement PDFs** were rendered
  headless to PNG by the author for the branding work, but **not** viewed by a
  human in their final form, and never printed.

---

## 3. OPEN ERRORS

### Production 500 on Vercel (digest `6663152226`) — OPEN
- `[FACT]` The owner reports the deployed ops-console returning "Application
  error: a server-side exception has occurred" with digest `6663152226`
  (earlier a `-dlrl5w84z-` preview URL showed digest `666315226`).
- `[FACT]` The author **could not read the Vercel logs** — no Vercel CLI or API
  token in the environment, no Vercel MCP. This was **not** diagnosed from logs.
- `[FACT]` The **same code runs clean locally**: `apps/ops-console` dev server
  serves `/login` → 200 with no server exception in its log.
- `[ESTIMATE]` Therefore it is almost certainly **environment/deployment**, not a
  code bug — most likely `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  missing on that deployment (the console middleware creates a Supabase client at
  runtime and 500s without them). This is the exact class of the earlier
  `MIDDLEWARE_INVOCATION_FAILED: Your project's URL and Key are required`.
- **Diagnosis to try first, in order:** (1) open the **production** URL (no
  deployment hash) and confirm both `NEXT_PUBLIC_SUPABASE_*` are enabled for
  **Production**, then redeploy; (2) get the real stack trace from Vercel →
  deployment → **Runtime Logs** (the line by that digest) — paste it, it's a
  seconds-long fix; (3) reproduce locally with `cd apps/ops-console && pnpm build
  && pnpm start` under the production env to surface the un-hashed error.

### Half-wired / known-incomplete
- `[FACT]` **Technician test login is not finished** (see §6). The technician
  record + today's jobs exist, but the Supabase auth user and its `app_users`
  link were never created — so the field app cannot yet sign in as that
  technician.
- `[FACT]` A7: pre-flight odometer/fuel are captured but **not posted** to
  `vehicle_fuel_purchases`. A9: field expense posts with `category_id = null` and
  no dedicated receipt-photo link. A10: on-device report is not brandChrome/
  division-aware.
- `[FACT]` Costing "Prompt 3" and RBS "Prompt 4" not built (see §1).

---

## 4. BLOCKED.md CONTENTS

Full detail is in `BLOCKED.md`. Summary (status as of 12 Aug 2026):

| ID | What | Blocks | Owner action to clear |
|---|---|---|---|
| A1 | Clock-drift thresholds ASSUMED (future >5min / behind >3d; `services/worker/src/ingest.ts`) | nothing (flag works) | confirm/adjust the two numbers |
| A2 | `SUPABASE_SERVICE_ROLE_KEY` for *immediate* token kill. **NOTE: the key IS present in `.env.local`; the admin sign-out wiring is not built** | immediate revocation only (`is_active` gate works now) | wire admin sign-out if wanted |
| A3 | Field PWA `VITE_SUPABASE_*` — **CLEARED** (owner set them; `apps/field-pwa/.env` exists). BLOCKED.md header still says 🔴 — stale, update it | — | done |
| A4 | Asymmetric JWT signing keys for offline signature validation | nothing (exp + server re-auth work) | Supabase → migrate to asymmetric keys (optional) |
| A5 | Treatment recipes ASSUMED (dose/dilution/coverage) | **misleading dosing** until set | confirm recipe values |
| A6 | Pre-flight PPE/equipment lists ASSUMED | cosmetic | confirm the lists |
| A7 | Pre-flight fuel→`vehicle_fuel_purchases` not wired (that table has no `client_uuid`) | fuel-cost linkage | decide + I add `client_uuid` and post once |
| A8 | Inspection option lists ASSUMED | cosmetic | confirm areas/issues/levels |
| A9 | Field expense category + receipt-photo link | refinement | sync categories + add a picker if wanted |
| A10 | On-device report not brandChrome/division-logo (PARTIAL) | branding consistency | do it WITH device verification |

---

## 5. ASSUMED DATA (awaiting owner confirmation)

`[FACT]` counts for the Mumtaz tenant (12 Aug 2026):

| Table | ASSUMED / total | Misleading output until confirmed? |
|---|---|---|
| `accounts` (chart of accounts / GL) | **18 / 18** | **YES** — every financial report posts to placeholder accounts |
| `pricing_models` | **17 / 26** | **YES** — estimates/quotations can misprice |
| `service_categories` | **18 / 18** | **YES** — category cost/price assumptions are placeholders |
| `treatment_recipes` + `_versions` | **2 / 2** each | **YES** — chemical dose/dilution/coverage are placeholders |
| `document_branding` (accents) | 2 / 4 | No — cosmetic (cleaning/FM accent hex) |
| `preflight_checklist_items` | 10 / 10 | No — cosmetic list |
| `inspection_options` | 15 / 15 | No — cosmetic list |

`[FACT]` Also ASSUMED / placeholder, not in the table above:
- **Labour cost rate** — a placeholder (DECISIONS §7: `1700 ÷ 176`, *not* real
  employment cost). `employee_cost_components` is **empty (0 rows)** for Mumtaz.
  **Any job-cost or profit number is placeholder** until "Prompt 3" is built.
- **Clock-drift thresholds** (A1) — technical tolerance, not a business rule.

`[ESTIMATE]` **Do not present any cost, price, margin, GL, or chemical-dose figure
as real** until A5 + the costing config + the GL/pricing/category ASSUMED rows are
confirmed. The operational field flow (jobs, checklist, photos, inspection,
pre-flight) does not depend on these and is safe to demo.

---

## 6. THE DEVICE CHECKLIST (real phone) + setup

### Setup required (the author did this once; it does not survive the session)
- `[FACT]` **Two local dev servers + a tunnel:** ops-console on **:3100**
  (`cd apps/ops-console && pnpm dev`), field-pwa on **:3200**
  (`cd apps/field-pwa && pnpm dev`), and a Cloudflare tunnel over **:3200 only**
  (`cloudflared tunnel --url http://localhost:3200`). Service workers need HTTPS,
  which the tunnel provides. The vite dev proxy forwards **only `/api/field`** to
  :3100 (#67) — so the tunnel exposes the field app + secured field endpoints,
  **not** the admin console or cron endpoints. Do not widen it.
- `[FACT]` **field-pwa env** (`apps/field-pwa/.env`, gitignored): `VITE_SUPABASE_URL`
  + `VITE_SUPABASE_ANON_KEY`. **ops-console** must have `NEXT_PUBLIC_SUPABASE_*`
  in its `.env.local` or Bearer validation 401s.
- `[FACT]` **Technician + jobs are seeded but the login is NOT finished:**
  - Technician `tech_test` ("Field Test Technician"), id `505055b3-4562-4081-9c7f-098f16558149`, `user_id = NULL`.
  - **2 jobs scheduled today** at *Calicut Restaurant / Aljada Branch* (has GPS),
    spray recipe attached, assigned to that technician.
  - **TO FINISH:** the owner creates a Supabase **auth user** (proposed email
    `field.tech@almumtaz.ae`, they set the password, "Auto Confirm User" on).
    Then a session must: read `auth.users` for that email → create
    `app_users(id = that uuid, tenant, technician role)` → set
    `technicians.user_id = that uuid`. Only then do the 2 jobs sync to the app.
    **The author cannot create the auth account (prohibited) — the owner must.**

### T1–T6 checklist (full copy in `BLOCKED.md`)
- **T1** sign in online once; kill+reopen offline → still signed in, jobs cached;
  work past the ~1h access-token expiry → not logged out; reconnect → queued
  events upload attributed to the login actor; **admin deactivates the login
  while the device is offline → on reconnect the device flushes, then locks and
  shows "revoked", and those events appear in the dashboard "Field events held
  for review"**; set the phone clock wildly wrong → the event is flagged "clock
  suspect", not silently accepted.
- **T3** open Pre-flight online → PPE/equipment load; enter vehicle/odometer/fuel;
  Save → "Saved & synced"; repeat offline → "Saved"; reconnect → one record/day.
- **T4** "Navigate ↗" opens Google Maps to the pin; the job shows its recipe;
  post-inspection (area/issue/infestation + hygiene/structural buttons, multiple
  areas) → complete → after sync the append-only inspection rows appear; re-sync
  does not duplicate.
- **T5** cash collected offline → reconnect → a cash receipt against the customer;
  expense + "what for" → a submitted claim on the dashboard; re-sync no double.
- **T6** the bar shows Online/Offline + "All synced"/"N to sync" with a breakdown
  (events/media/pre-flight) + last-sync time.

---

## 7. WHAT SHOULD HAPPEN NEXT (in order)

1. **Diagnose the production 500** (§3). It makes the deployed console unusable;
   likely a one-line env fix. Get the runtime log or reproduce with
   `pnpm build && pnpm start`. *Reason: the owner is trying to operate; a dead
   console blocks everything office-side.*
2. **Finish the technician login and run the T1–T6 device checklist** (§6).
   *Reason: the entire field app is built but unproven on a phone — this is the
   single biggest unverified surface and the last thing blocking a real operating
   day.*
3. **Confirm the ASSUMED data that produces misleading output** (§5: recipes, GL
   accounts, pricing models, service categories, labour rate). *Reason: any
   financial/dosing output is placeholder until then — do not let it be trusted.*
4. **Build the costing & estimation real-configuration ("Prompt 3")** and then
   **RBS/monitoring points ("Prompt 4")** — both filed, not built. *Reason:
   profit-per-contract and physical-asset tracking are core to the operation.*
5. **A10** (on-device report brandChrome + division logo), A7, A9 — refinements,
   do with device verification.

---

## 8. HOW THE OWNER WORKS (binding)

- `[FACT]` **The owner is not a developer.** Explain in plain terms; give exact,
  clickable steps; never assume CLI fluency.
- `[FACT]` **Proof-of-Work is mandatory** (CLAUDE.md "Proof-of-Work Protocol",
  Constitution Art. X §5). Every completion claim must include, in the same
  message: `git diff --stat`, passing build/test output, the commit hash, and
  confirmation of push. A claim without all four is treated as *not done*.
- `[FACT]` **Touching a structural invariant is a constitutional amendment** — it
  **stops and waits for the owner**, it is never done-and-continued. Precedent:
  `DECISIONS §11.7` (mig 056 outbox-whitelist refinement, owner-ratified). The
  frozen invariants are in `ARCHITECTURE-BASELINE.md`.
- `[FACT]` **Never invent a business rule.** If a rule is unknown, seed it
  `ASSUMED`, make it editable without a deploy, flag it visibly in the UI, and log
  it (BLOCKED.md). Never present an assumption as fact.
- `[FACT]` Work on a branch, PR, and merge; verify main green after each. The
  owner merges (or has granted merge) via `gh pr merge`. Do not push to `main`
  directly.
