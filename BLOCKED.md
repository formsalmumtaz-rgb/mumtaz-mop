# BLOCKED — items needing the owner (technician app T1–T6 autonomous run)

Autonomous build of the technician app. This file lists everything that needs
you: what, why, exactly what to do, and which phase it blocks. Work continued
around each item; nothing stalled.

Legend: 🔴 blocks a phase from completing · 🟡 works now via an ASSUMED default,
confirm/replace when you can · 🟢 device-only verification you run at the end.

---

## 🟡 A1 — Clock-drift thresholds (T1, device time)
**What:** how far off a phone clock may be before an event is flagged
`time_suspect`. Seeded ASSUMED: **future skew > 5 min**, **behind > 3 days**.
**Why:** Art. VII §4 requires flagging implausible device time; the exact window
is an operational tolerance, not a law.
**Do:** confirm or adjust the two numbers (currently constants in
`services/worker/src/ingest.ts`; will move to settings if you want them editable
without a deploy — tell me).
**Blocks:** nothing — flagging works now.

## 🟡 A2 — Supabase service-role key (T1, hard token revocation)
**What:** `SUPABASE_SERVICE_ROLE_KEY` in the ops-console environment.
**Why:** deactivating a login (`is_active=false`) already makes every
`/api/field/*` call reject that actor at sync — functional revocation, no key
needed. Revoking the actual Supabase **refresh token** (so a still-online device
can't mint a new access token) needs the admin API, which needs the service-role
key.
**Do:** add `SUPABASE_SERVICE_ROLE_KEY` to Vercel + `.env.local` (Supabase →
Project Settings → API → service_role secret). Until then, revocation relies on
the `is_active` gate (effective at next sync) rather than immediate token kill.
**Blocks:** the "immediate" part of revocation only; the review-queue + lockout
path works now.

## ✅ A3 — Field PWA Supabase env vars (T1 client) — CLEARED
**Cleared:** the owner set `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` in
`apps/field-pwa/.env`; both are present and non-empty (verified 12 Aug 2026).
The field app can now reach sign-in. Historical detail retained below.
**What:** `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for the field app build.
**Why:** the PWA now has a real login (T1). Without these it renders "sign-in
isn't configured" and cannot authenticate. They are the public URL + anon key
(same values already used by the ops-console `NEXT_PUBLIC_*`), safe to embed.
**Do:** set both in the field-pwa build environment (Vercel project / `.env`). — done.
**Blocks:** nothing — cleared. (Was: the technician couldn't sign in until set.)

## 🟡 A5 — Treatment recipes are ASSUMED starter values (T2)
**What:** the dosing/dilution/coverage on the two seeded pest-control recipes
(mig 057: "Residual Spray — General" 50 ml/10 L, ~200 m²; "Gel Bait — General"
~9 g/100 m²).
**Why:** the field app needs a treatment reference offline; real dosing is your
domain knowledge (and firms up in the costing phase).
**Do:** confirm/replace the dose, dilution and coverage per recipe. All rows are
`is_assumed=true` and editable. NOTE: a rich recipe editor UI isn't built yet —
today they're edited via SQL/settings; a recipe admin screen is a later increment
(logged so it isn't forgotten). Also: jobs only carry a recipe when the scheduler
attaches one (`jobs.recipe_version_id`); un-attached jobs sync `recipe: null` and
the field app allows manual chemical entry.
**Blocks:** nothing — sync returns the recipe when present, null otherwise.

## 🟡 A6 — Pre-flight PPE + equipment lists are ASSUMED (T3)
**What:** the seeded PPE list (gloves, mask, goggles, coverall, boots) and
equipment list (sprayer, bait gun, torch, ladder, first-aid) — mig 058,
`preflight_checklist_items`, `is_assumed=true`, editable.
**Do:** confirm/replace the items the technician must tick at start of shift.
**Blocks:** nothing — the pre-flight screen reads whatever is configured.

## ✅ A7 — Pre-flight fuel now posts to the fuel ledger (T3) — DONE (mig 063)
**Cleared:** `vehicle_fuel_purchases` gained `client_uuid` + `preflight_check_id` +
`source` and a partial UNIQUE index on `preflight_check_id` (mig 063). `upsertPreflight`
now posts one fuel purchase per pre-flight when a vehicle + positive litres are present
(`ON CONFLICT (preflight_check_id) DO NOTHING` — re-sync-safe, table stays append-only).
Proven: `packages/db/tests/preflight_fuel_idempotent.sql` (double-post → 1 row; two
pre-flights → 2 rows). Fuel now feeds `vehicle_cost_per_km`.
**Residual (minor):** a same-day fuel *correction* on the pre-flight updates the
pre-flight but not the already-posted purchase (append-only) — a correction would be a
manual reversing fuel entry. Acceptable; noted.
**Unverified:** the on-device offline→sync path itself (as with all field-app paths).

## 🟡 A8 — Inspection option lists are ASSUMED (T4)
**What:** the button-driven post-inspection lists (mig 059, `inspection_options`,
`is_assumed=true`): areas (kitchen, pantry, dining, wash, exterior), issue types
(cockroach, rodent, ant, fly, hygiene, structural), infestation levels
(none/low/medium/high).
**Do:** confirm/replace per your operation; the form is driven entirely off these.
**Blocks:** nothing — the form renders whatever is configured.

## 🟠 A9 — Field expense category + receipt-photo link (T5) — PARTIAL (schema done, UI remains)
**Done this session:**
- (b) receipt link — **`expense_receipts` table added (mig 064)** linking an expense claim
  to its receipt photo (`job_photos`), RLS-isolated. The durable schema is ready.
- (a) category — the **backend already records `category_id`**: `expense.recorded` carries
  it and `services/worker/src/fieldfinance.ts` inserts it into `expenses.category_id`. No
  backend gap; the field claim just doesn't *send* a category yet.
**Remains (field-app UI — disposable, device-verified, per Two-Speed Rule):**
1. sync `expense_categories` to the device and add a category picker to the expense form
   (so it sends `category_id`);
2. let the technician tag the receipt photo to the claim (write an `expense_receipts`
   row on sync).
**Do:** confirm you want the field-app picker + receipt-tagging built; it's a field-PWA
change I can only *build*, not verify — you verify on a phone.
**Blocks:** nothing — cash posts a receipt, expense posts a submitted claim; categorising
and photo-linking are refinements.

## 🟠 A10 — On-device report: brandChrome + division logo (T6, PARTIAL — needs device verify)
**What:** the field app's on-device service-report PDF (`apps/field-pwa/src/report/`)
still uses its own hardcoded pest-control identity + red/gold accents
(`model.ts` `COMPANY`, `render.ts` `MAROON`/`GOLD`), not `@mop/documents`
brandChrome or the per-division logo/accent from reference data.
**Why not done autonomously:** that renderer is ~660 lines and was verified on a
real phone in K3 (airplane-mode PDF rendering). Rewiring its accent/logo/footer
to brandChrome + syncing per-division logo images for offline use is a change I
**cannot re-verify without a device**, and shipping a blind rewrite of a
device-verified artifact risks regressing it. Deliberately left for a device-in-
hand pass rather than done blind.
**Plan when you're ready (I'll do it with you verifying):** (1) sync the division
brand block (name, accent, legal block, logo_key) + bundle the 4 division logos in
`field-pwa/public/brand` (service-worker precached); (2) thread the division accent
+ logo through `render.ts`; (3) draw the letterhead/legal footer via
`@mop/documents` so it matches the console's documents; (4) you render a pest AND
a cleaning report on a phone to confirm.
**Blocks:** nothing operationally — the existing report renders correctly (pest
branding). This is the branding-unification refinement.

## 🟡 A4 — Asymmetric JWT signing keys for offline signature validation (T1)
**What:** enable **asymmetric** JWT signing keys (a JWKS) on the Supabase project.
**Why:** §11.5 wants the device to validate the access token's SIGNATURE offline
against a cached JWKS. Supabase's default HS256 tokens have no public key, so the
client can only validate `exp` offline and relies on the server to verify the
signature at sync (still safe — the server is the authority). With asymmetric
keys, the client also verifies the signature offline (defense-in-depth); the code
already does this when a JWKS is present.
**Do:** Supabase → Auth → JWT keys → migrate to asymmetric signing keys (when you
choose). No code change needed.
**Blocks:** nothing — exp validation + server re-auth work now.

---

## 🔴 A11 — No GitHub write credentials / `gh` CLI on this machine (blocks push, PR, merge)
**What:** this machine (copied from another Mac) has **no Git write credential** for
`github.com` and **no `gh` CLI**. `git fetch`/`git pull` work (read), but
`git push` fails with `could not read Username for 'https://github.com'`, and there
is no `gh` to open or merge PRs.
**Why it matters:** the standing workflow is *branch → push → PR → merge → verify
main green* (HANDOVER §8). With no push and no `gh`, I can build, test, prove and
**commit locally**, but I **cannot push, cannot open a PR, cannot merge, and cannot
update `main` on GitHub.** All autonomous work this session is committed to the
local branch **`autonomous/2026-08-12`** (one commit per task, full Proof-of-Work in
each message) and is waiting to be pushed.
**Do (either path):**
1. Install GitHub CLI and authenticate: it will store a write credential in the macOS
   keychain and let me push+PR+merge. In a terminal:
   `brew install gh` (installs Homebrew first if needed — needs your Mac password),
   then `gh auth login` (choose GitHub.com → HTTPS → login with a browser).
   **OR**
2. Create a GitHub **Personal Access Token** (repo scope) and let git store it:
   run `git push` once and paste your GitHub username + the token when prompted; the
   keychain remembers it thereafter.
Then tell me, and I'll push `autonomous/2026-08-12`, open a PR per task (or one PR),
and merge after main goes green.
**Blocks:** the push/PR/merge/verify-main-green half of **every** task below. The
engineering itself is done and committed locally; only the publish step waits on you.

## 🔴 A12 — Production 500 (digest 6663152226): Supabase env vars missing on Vercel
**What:** the deployed ops-console returns HTTP 500 ("Application error", digest
`6663152226`) on every signed-in page. **Diagnosed and reproduced locally this
session:** with `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` absent,
`middleware.ts` threw *"Your project's URL and Key are required to create a Supabase
client!"* → 500 on `/`, while `/login` stayed 200. That is exactly this digest.
**Code half — DONE this session:** `middleware.ts` now fails **closed and legibly** —
a missing var returns a plain **503** naming the missing variable instead of an opaque
500 crash. Verified: vars absent → 503 with message; vars present → normal 307 redirect
to `/login`. This makes the misconfiguration self-explaining but does **not** make the
site work — the app genuinely needs the keys.
**Do (the real fix — only you can, I have no Vercel access):** in **Vercel → the
ops-console project → Settings → Environment Variables**, confirm both
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` exist **and are enabled
for the _Production_ environment** (not only Preview/Development). The values are the
same public URL + anon key already in `apps/ops-console/.env.local`. Then **redeploy**
Production. After redeploy, opening the site should show `/login`, not the 500.
**If it still 500s after that:** open Vercel → the deployment → **Runtime Logs**, find
the line for digest `6663152226`, and paste it to me — with the middleware guard in
place the message will now name what's wrong.
**Blocks:** the deployed office console is unusable until the Production env vars are
set and redeployed. Local build runs clean.

## 🟡 A13 — Costing engine: ASSUMED inputs to confirm (mig 060–062)
**What:** the costing engine is built and computing real numbers, but a handful of
inputs are seeded **ASSUMED** (flagged in every engine result under `assumptions`,
and editable from settings without a deploy — Art. X §4). Confirm each real value:
| Setting / row | Seeded ASSUMED value | Why assumed |
|---|---|---|
| `item: Pro Surfactant` landed cost | **0.05 AED/ml (50 AED/L)** | price was unknown — **placeholder**, replace with the real purchase price |
| `cost.target_margin_default` | 0.35 (35%) | your real target margin was not given |
| `cost.treatment_hours_per_visit` | 1.0 h | on-site time estimate |
| `cost.travel_speed_kmh` | 32 km/h | turns distance into paid travel hours (gives ~2 h paid for a 16 km job, matching your example) |
| `cost.default_job_one_way_km` | 16 km | used when a site has no measured route distance |
| `treatment.gel_visits_per_year` | 6 of 24 | annual spray/gel mix |
| `consumption:spray` per-m² | Blitz 0.25 ml/m², Surfactant 0.05 ml/m² | derived from "50 ml covers a medium restaurant", assuming that restaurant = **200 m²** (the recipe's coverage). Confirm the real medium-restaurant area. |
| `consumption:gel` per-m² | 0.09 g/m² | derived from "9 g covers a ~100 m² 2BHK" |
| `cost.overhead_rate_per_labour_hour` | 15% of labour | the 15% is assumed |
**Confirmed as real (no action):** labour rate 10.62 AED/hr (from the 1,869/mo basis),
vehicle 0.698 AED/km (fuel 3.49 ÷ 5 km/L), Blitz 0.10/ml, Gel 1.3333/g, 24 visits/yr
(municipality), pricing refs 250 ad-hoc / 100 AMC.
**Do:** tell me the real numbers (especially the **Pro Surfactant price** and your
**target margin**) and I'll set them — or edit them yourself in Cost setup once that
screen exposes these keys. Until then every costed figure is correctly flagged assumed.
**Blocks:** nothing operationally — the engine runs and flags. Only the *accuracy* of
margin/dosing figures depends on these; do not quote them to a customer as final yet.

## 🟡 A14 — Pricing discrepancy surfaced: ad-hoc 250 vs AMC 100 for the same service
**What:** the engine costs a medium restaurant (200 m², 24 visits/yr) at **1,365 AED/yr
direct cost, ≈57/visit**. At the ad-hoc rate (250/visit) that is a **77% margin**; at the
AMC rate (100/visit = contract 1330/25's 2,400 ÷ 24) it is **43%**. Both are profitable,
but the **ad-hoc price is 2.5× the AMC price for identical work**.
**Do:** decide whether the AMC per-visit rate is a deliberate annual-commitment discount
or underpriced. Both reference rates are seeded and editable.
**Blocks:** nothing — informational, surfaced so it isn't invisible.

---

## Real-device checklist (🟢 — you run these; I cannot)
Airplane mode, camera/WebP capture, on-device PDF rendering, GPS and Maps
deep-links, and full offline-day + reconnect sync are **unverified** until you
test them on a real phone, however green the build is.

### T1 — offline auth (landed; verify on device)
- [ ] With A3 set, sign in online once; kill the app, reopen offline → still
      signed in (session cached), jobs list loads from cache.
- [ ] Work offline past the access-token lifetime (~1h) → NOT logged out.
- [ ] Reconnect → queued events upload; server attributes them to the login
      actor (check the audit log / a completed job's actor).
- [ ] Admin deactivates the technician's login (Settings → Users) while the
      device is offline; device reconnects → it flushes queued work, then locks
      and shows the "revoked" screen; those events appear on the dashboard's
      "Field events held for review" and can be approved/rejected.
- [ ] Set the phone clock wildly wrong, complete a job offline, sync → the event
      shows a "clock suspect" flag in review (not silently accepted).

### T3 — pre-flight (landed; verify on device)
- [ ] Open Pre-flight online → PPE + equipment checklist loads; tick items,
      enter vehicle/odometer/fuel, Save → "Saved & synced".
- [ ] Do the same offline → "Saved"; reconnect → it syncs (one record per day;
      re-saving the same day updates, not duplicates).

### T6 — honest sync indicator (landed; verify on device)
- [ ] The top bar shows Online/Offline and either "All synced" / "N to sync";
      the strip below breaks it down (events / media / pre-flight) with the last
      sync time, and says work will send automatically when back online.
- [ ] (Report brandChrome/division-logo unification is A10 — not yet done.)

### T5 — cash + expense (landed; verify on device)
- [ ] In a job, enter cash collected → Collect (offline) → reconnect → a cash
      receipt appears against the customer.
- [ ] Enter an expense + "what for" → Log → reconnect → a submitted expense
      claim appears in "Expense claims to approve" on the dashboard; re-sync
      does not double-book (client_uuid).

### T4 — job flow + inspection (landed; verify on device)
- [ ] In a job, tap "Navigate ↗" → Google Maps opens directions to the site pin.
- [ ] Job carries its treatment recipe (dose calculates from area).
- [ ] Post-inspection: pick area/issue/infestation + hygiene/structural scores,
      "Add area" for several areas, complete the job → after sync the
      inspection rows appear (append-only) linked to the job; re-sync doesn't
      duplicate.
