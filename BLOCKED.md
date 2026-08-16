# BLOCKED — items needing the owner

## ▶ THE LIVE SYSTEM RIGHT NOW (run 7, 17 Aug)

**Field app:** https://vegas-attractive-copying-republic.trycloudflare.com
**Console:** https://pixel-depends-lives-absolute.trycloudflare.com
**Both serve commit `018e3af`** — the field sign-in screen prints `build 018e3af`
and the console sidebar footer prints the same. Check that hash before judging
anything; earlier links are dead (a tunnel dies with this machine's session).

---

## YOUR TASKS — in order, with exact steps

### 1. Enable the assistant (2 minutes) — unlocks four features
"Ask the business", quotation-scope drafting, report commentary and
draft-to-estimate are all built and waiting on one key.
1. console.anthropic.com → sign in → **API keys** → Create key.
2. Copy it (starts `sk-ant-`).
3. Open `apps/ops-console/.env.local`, find `# ANTHROPIC_API_KEY=sk-ant-...`,
   delete the `#`, paste your key.
4. Add the same variable in Vercel → Settings → Environment Variables.
5. Console → **Admin → Ask the business**. Ask "How many technicians
   attended today?" Then open **Reports → Report preview & send** — a
   *Commentary* block now appears above the email.

Without the key everything still works; the AI parts just stay hidden.

### 2. Maps key (5 minutes) — map previews + address autocomplete
1. console.cloud.google.com → APIs & Services → Credentials → your browser key.
2. Under "API restrictions" enable **Maps JavaScript API** and **Places API**.
3. Add `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY=<key>` to
   `apps/ops-console/.env.local` **and** Vercel.

### 3. Service-role key (2 minutes) — office invites + instant revocation
supabase.com → project → Settings → API → copy **service_role** → add
`SUPABASE_SERVICE_ROLE_KEY=<secret>` to `.env.local` and Vercel.

### 4. Phone re-test (10 minutes)
1. Delete the old home-screen icon. Safari → Settings → Apps → Safari →
   Advanced → Website Data → delete every "trycloudflare" entry.
2. Open the FIELD URL. The sign-in screen must read **build 018e3af**.
3. Walk it: confirm-day banner → jobs load → **swipe a job card right** (it
   should say "Swipe to start", turn green at "Release to start", and the job
   goes to In progress) → Pre-flight (team lead) → Add expense → Log fuel →
   run a job → CHECK.

### 5. Answers I still need (reply in chat)
- One address whose map pin lands wrong, for the geocoding fix.
- Cleaning + FM quotation wording: reuse the pest terms, or give me yours?
- **A19:** 76 imported customers + 176 contracts are still HELD in staging —
  open **Admin → Import customers**, click into the batch, and either press
  approve or tell me the corrections.
- **A20:** Dubai / Abu Dhabi municipality attestation rules.
- Recipes / PPE / inspection lists (A5/A6/A8) are still ASSUMED seeds.

### 6. Real-device checklist (release gate — end of this file)
Airplane-mode completion, PDF on the phone, photo capture, map tiles. Only you
can run these; the release is not accepted until they are ticked
(ARCHITECTURE-BASELINE.md).

---

## Run 7 — what shipped, and how to check it

| Instruction | Status | Where to look |
|---|---|---|
| Calendar month view + drag-drop reschedule | DONE | Schedule → Month; drag a job to another day |
| Customer told when a visit moves | DONE | the move queues a "your visit has moved" email (was/now dates + team lead's number) |
| Excel + PDF export on every major list | DONE | Excel/PDF buttons on Customers, Contracts, Jobs, Invoices, Expenses |
| Filters everywhere | DONE | emirate/type, status, and date-range filters on those lists; the export obeys them |
| Bulk customer import UI | DONE | Admin → Import customers (template → upload → report → approve) |
| Weekly + yearly report packs | DONE | queued Mondays 07:00 and 1 January, Dubai time |
| Report preview before filing | DONE | Reports → Report preview & send (all four cadences + "Send this now") |
| Swipe gestures in the field app | DONE | swipe a scheduled job card right |
| Agreement generator rebuilt | DONE | any contract → Agreement (.docx): bilingual clauses, correct entity per emirate |
| Assistant phases 2–4 | DONE (needs the key) | report commentary + "Create a draft estimate from this" |

**Defects found and fixed while verifying:** the console could not start from a
clean checkout (root `.env.local` was never loaded by Next); **every branded
email's logo redirected to the login page** and rendered broken in inboxes;
the Vercel build was failing on a lockfile I had left uncommitted; a nameless
import row silently matched a live customer instead of being rejected; a masked
SQL error blanked the agreement's emirate; a stale service worker could leave
the field app on a **blank screen** (updates are now self-healing).

**Known flake, not a regression:** two worker tests (`fieldfinance`,
`inventory`) intermittently fail with a Supabase pooler connection timeout
inside `drainOnce`. Each passes on re-run, and the same failure reproduces on
the pre-run-7 commit, so nothing in this run caused it. It needs a proper look
when the staging database is quiet — staging now carries 81 tenants and 2,100+
events from months of test runs, and the seeding hooks are getting slow.

**Still not built:** per-line draft-to-estimate (prices need a pricing model
per line), narration inside the scheduled emails (deliberately excluded — it
would put a model call on a scheduled path), and the older backlog below.

---

## Ledger (historic — technician app T1–T6 autonomous run onward)

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

## ✅ A9 — Field expense capture — RESOLVED 16 Aug (Add Expense button: photo required, approver picker, receipt→R2 link, standalone or job-bound)
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
**Update (this session): a flag-gated PARALLEL PATH is now built, so you can compare on a
phone before switching — the verified renderer is untouched.**
- `apps/field-pwa/src/report/sharedChrome.ts` renders the report via the shared
  `@mop/documents` brandChrome (letterhead + legal footer + accent). Gated behind
  `VITE_REPORT_SHARED_CHROME="1"` in `pdf.ts`; **default OFF** → the device-verified
  `render.ts` runs byte-for-byte as before. Field-pwa `tsc + vite build` pass.
- **To compare on a phone:** build the field app with `VITE_REPORT_SHARED_CHROME=1`, open a
  completed job → Generate report, and compare against a normal build. You verify; I can't.
- **Deliberately still STAGED (do NOT switch the default yet):** (1) it renders the **pest**
  division only — true per-division needs the division brand block in the field **sync
  payload** + the division logos precached in `field-pwa/public/brand`; (2) the shared body
  is **thinner** than the verified report (no QR, trend chart, signatures grid, photos,
  chemicals table) — it proves the chrome, not the full body. Switching fully is the
  device-in-hand follow-up below.
**What (original):** the field app's on-device service-report PDF (`apps/field-pwa/src/report/`)
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

## ✅ A11 — Push/PR/merge — CLEARED
**Cleared 12 Aug 2026.** The owner re-authenticated gh with a write-capable token
(the fine-grained PAT lacked Contents:write; a browser `gh auth login` grants `repo`).
Branch `autonomous/2026-08-12` was pushed and merged to `main` as **PR #69** (squash,
`7f8984b`). Post-merge verification on `main`: migration files 060–064 match the applied
SQL exactly, `invariants.sql` + `rls_isolation.sql` PASS, worker suite **25/25**. Main green.
**(original entry, for history:)**
## 🔴 (was) No GitHub write credentials / `gh` CLI on this machine (blocks push, PR, merge)
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

## ✅ A12 — Production 500 (digest 6663152226) — RESOLVED (env vars now present on Production)
**Resolved 12 Aug 2026, verified against the live site** (`mumtaz-mop-ops-console.vercel.app`):
the production `/` now **redirects cleanly to `/login`** (no 500, no digest), the deployed
client bundle **contains** `NEXT_PUBLIC_SUPABASE_URL` + a valid anon key (project ref
`xpkniuhcjysisfbfiqhn`, not expired), and the Supabase auth endpoint responds normally. The
digest `6663152226` **was** the middleware missing-vars crash (reproduced exactly); it is gone
now that the vars are effective for the Production build. If it ever recurs it is a deployment
**scope** issue (a var enabled for Preview/Development but not Production) or a stale build —
enable the var for the needed environment and **redeploy**. The `middleware.ts` 503 hardening
(merged in PR #69) makes any recurrence self-explaining. **This is NOT the login problem — see A15.**
**(original diagnosis, for history:)**
**What:** the deployed ops-console returned HTTP 500 ("Application error", digest
`6663152226`) on signed-in pages. **Reproduced locally:** with
`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` absent,
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

## ✅ A15 — Login does not proceed after sign-in — CLEARED (fixed + verified on production)
**Cleared 13 Aug 2026.** Root cause: the `@supabase/ssr` race where the login form's
client-side `router.push("/") + router.refresh()` ran the middleware before the freshly-set
session cookies committed, so `getUser()` saw no session and bounced back to `/login`. Fix
(PR #71, `LoginForm.tsx`): a full-page `window.location.assign(next)` after a successful
sign-in, so the cookies are sent on the next request; open-redirect-guarded `?next=`. **Owner
confirmed login works on production.** Original evidence retained below.
**What (evidence, 12 Aug 2026):** the deployed sign-in **works** — `auth.users` shows 2
confirmed accounts, both with recent successful sign-ins (one at 18:53 today), and a probe of
the auth endpoint returns a normal `400 invalid_credentials` for bad creds. So credentials are
accepted and Supabase issues a session; the failure is **after** auth: the app does not advance
to the authenticated page. **Not the same root cause as A12** — A12 was a missing server var
(now resolved); this is post-auth session propagation. The authenticated home (`/`,
`getTenantId` + `scopedRead`) reads robustly and is unlikely to 500, which points at the session
cookie not reaching the middleware on the post-login navigation (`LoginForm.tsx` does
`router.push("/") + router.refresh()`).
**Do (decisive test — needs YOUR login, which I can't use):** sign in with DevTools open and note:
1. **Network → `token?grant_type=password`** → expect **200** (sign-in succeeds).
2. Then the browser either (a) **bounces back to `/login`**, (b) shows a **500 / Application
   error** on `/`, or (c) hangs. Note which.
3. **Application → Cookies** for the site: is `sb-xpkniuhcjysisfbfiqhn-auth-token` (and
   `…-auth-token.0/.1` chunks) present after sign-in? Missing ⇒ the browser client isn't
   persisting the session to cookies; present-but-bounced ⇒ the middleware isn't reading it.
4. **Console** → any red error (e.g. a cookie/CORS message).
**Likely fix (pending which of a/b/c):** if it's the cookie bounce, replace the client-side
`router.push("/")` after sign-in with a **full-page navigation** (`window.location.assign(next)`),
which guarantees the freshly-set session cookies are sent on the next request. I'll implement +
deploy once you report the observed behaviour from step 2.
**Blocks:** office staff can't get past the login screen. High priority.

## 🟡 A16 — Owner-input ledger from the workflow specification (DOCUMENT 8, Part N)
**What:** the One-Guided-Pipeline spec (ROADMAP-AMENDMENT §6, filed 13 Aug 2026) lists
what only you can supply. Consolidated here; most already have their own entry:
| Input | Where tracked |
|---|---|
| Pro Surfactant real price (ASSUMED 0.05/ml) | **A13** |
| Target margin (ASSUMED 35%) | **A13** |
| Treatment recipes / consumption / areas | **A5, A13** |
| GL account codes, pricing models, service categories | **A13** / DECISIONS §7.4 |
| PPE + equipment lists · inspection options | **A6, A8** |
| Clock-drift thresholds | **A1** |
| Ad-hoc 250 vs AMC 100 pricing decision | **A14** |
| **Structured migration data for existing customers** | NEW — you prepare it; a placeholder Excel template (exact sheets, headers, one example row, notes column) is a deliverable of the migration track when it builds |
| **Public QR page: technician full name?** | NEW — PDPL flag (ROADMAP §6.5): full name on a physically-public sticker page is personal data; recommendation is technician code + masked name ("Muh*** Ali"). **Full names will not be implemented without your explicit confirmation.** |
**Blocks:** nothing today — the spec is filed, not building. These become blocking as
their tiers are picked up in EXECUTION.md.
**Update 13 Aug (QR name):** owner decided — technician **code + masked name**; full
names will NOT be implemented. Decision recorded in ROADMAP §6.5; row above closed.

## 🟡 A17 — Customer groups: how does a group get billed? (ASSUMED default seeded)
**What:** Sultan Al Arab = 6 independent customers under one `customer_group`. When
group features build (statements, consolidated AR — ROADMAP §7.2), the billing shape
needs your call: (a) ONE invoice covering all sites, (b) separate invoice per site
(today's behaviour), or (c) separate invoices + a monthly summary statement for the
group. **Seeded ASSUMED: (c) — invoice-per-site plus a group summary statement** (no
re-keying, no change to the per-site invoice chain; the statement is a projection).
**Do:** confirm (c) or pick (a)/(b). Editable without a deploy once the setting lands
with the group features.
**Blocks:** nothing yet — group reporting reads either way; only the *statement/
consolidation shape* waits on this.

## ✅ A18 — Email provider — LIVE (delivery proven 13 Aug 2026)
**Cleared:** owner provisioned Resend (domain mumtazgroup.ae verified) and pasted the
key into `.env.local` (root + ops-console synced). Live proof through the REAL pipeline
(queued row → runNotificationSweep → Resend): provider id `c72a4c4c…`,
**`last_event: "delivered"`** to sahad@almumtaz.ae — delivered, not merely queued.
All notifications are now live (the transport goes live automatically when the key is
present). **Remaining: add EMAIL_API_KEY + EMAIL_FROM to Vercel (Production scope) for
deployed sending; DEBT D9 (full-access key → sending-only before go-live).**
**(original entry:)**
## 🔴 (was) Email provider + API key (blocks real sending; everything else built around it)
**What:** the outbound email channel (ROADMAP §7.4) is provider-agnostic; in
development it LOGS what it would send (append-only delivery log) instead of
sending. Real delivery needs a transactional email provider account + API key +
a verified sending domain — only you can create these.
**Do (recommended: Resend — simple, generous free tier; SES/Postmark also fine):**
1. Create the account, verify the sending domain (e.g. almumtaz.ae — needs the DNS
   records they show you added at your domain host).
2. Create an API key and give it to me (or put it in Vercel env as EMAIL_API_KEY +
   EMAIL_FROM, e.g. "Mumtaz Operations <ops@almumtaz.ae>").
**Blocks:** actual delivery of every §7.4 notification (24h notice, ETA, annual
schedule, schedule-change, service report email). The templates, triggers, log,
re-send and flags all work now in log-only mode and light up when the key lands.

## 🟡 A19 — Customer import: 76 customers + 176 contracts HELD for your decision
**Done (13 Aug, per Art. VII §5):** the /merge master data is IN — staging → validation
→ dry-run → commit. **Imported: 508 customers (codes CUST-0093…CUST-0600, system-
assigned — file codes kept only as source_ref), 393 branches, 355 contacts, and 42
contracts as DRAFT + ASSUMED** (never auto-activated — you review, then activate).
Idempotency proven: a re-run marks all 508 "already imported", zero duplicates.
**HELD — needs you (full row detail in `merge /import-dry-run-report.md` and the
staging tables, batch 59d96951…):**
| Cohort | Count | What you decide |
|---|---|---|
| Shared-TRN groups (decision sheet) | 41 customers | same entity or separate customers? |
| Duplicate groups (decision sheet) | 27 customers | merge or keep separate |
| Malformed TRN | 8 customers | correct the TRN (e-invoicing field — never imported dirty) |
| Contracts needing a customer match | 71 | pick the right customer |
| Contracts with unparseable dates | 55 | supply real start/end dates |
| Contracts at MEDIUM match confidence | 21 | confirm the fuzzy match |
| Contracts on held customers / flagged dup / amount / date-order issues | ~29 | per-row |
**Do:** work through the held cohorts with me in a session — each decision is a one-line
update, then a re-run imports the newly-clean rows (safe: idempotent by source_ref).
**Blocks:** nothing — the clean majority is live. Held rows simply aren't in yet.

## 🔴 A20 — Municipality requirements: Dubai + Abu Dhabi equivalents, and the unified contract
**What:** Sharjah's medical-facility requirements are filed and modelled (ROADMAP §8,
mig 073). The compliance engine deliberately returns NOTHING for combinations it has no
source for (e.g. Abu Dhabi medical) — it will not guess a municipality rule.
**Do (only you can supply these):**
1. The **Dubai Municipality** and **Abu Dhabi (Tadweer/ADAFSA)** equivalents of the
   Sharjah medical document — frequencies per premises category + pest, contract
   clauses, treatment-window rules. PDFs like the Sharjah one are perfect.
2. The **unified contract** the Sharjah document references, so the clause wording can
   be confirmed against it (the 11 seeded clauses are English renderings, ASSUMED).
3. Per-category **chemical approvals**: which products are approved for medical
   facilities (EDE registration numbers + MSDS refs per item — columns are ready).
**Blocks:** frequency/clauses for non-Sharjah medical work and the legal wording
confirmation. Sharjah medical + Sharjah/Dubai F&B are live now.

## 🟡 A21 — Two five-minute fixes only you can do
**(a) Google Places autocomplete** (refresh item 3): the fast-entry customer form
wants Places suggestions. In Google Cloud Console → APIs & Services → Library →
enable **Places API (New)**; then APIs & Services → Credentials → your browser key →
API restrictions → add **Places API (New)** alongside Maps JavaScript API. Tell me
when done and I wire the autocomplete (graceful text field until then).
**(b) Stale local production DB credential**: `apps/ops-console/.env.production.local`
holds a DATABASE_URL that FAILS authentication (almost certainly the pre-11-Aug
password, DEBT D2) — running a local production build against it tripped Supabase's
connection circuit breaker tonight. Vercel is unaffected (own env vars). Fix: paste
the current DATABASE_URL from `.env.local` into `.env.production.local` (or delete
that line — it is only used for local production runs).

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
