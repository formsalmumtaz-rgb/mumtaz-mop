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

## 🟡 A7 — Pre-flight fuel/odometer not yet posted to fuel ledger (T3)
**What:** pre-flight captures odometer + fuel (litres/AED) in `preflight_checks`,
but does NOT yet insert `vehicle_fuel_purchases`.
**Why:** that table (mig 022) has no `client_uuid`, so posting on every offline
re-sync would duplicate. Safe idempotent posting needs a `client_uuid` column
there first.
**Do:** decide whether pre-flight fuel should feed the fuel/cost ledger; if so I
add `client_uuid` to `vehicle_fuel_purchases` and post once. For now fuel is
recorded on the pre-flight only.
**Blocks:** the fuel→cost linkage only; pre-flight itself works.

## 🟡 A8 — Inspection option lists are ASSUMED (T4)
**What:** the button-driven post-inspection lists (mig 059, `inspection_options`,
`is_assumed=true`): areas (kitchen, pantry, dining, wash, exterior), issue types
(cockroach, rodent, ant, fly, hygiene, structural), infestation levels
(none/low/medium/high).
**Do:** confirm/replace per your operation; the form is driven entirely off these.
**Blocks:** nothing — the form renders whatever is configured.

## 🟡 A9 — Field expense category + receipt-photo link (T5, refinements)
**What:** (a) the field expense form doesn't pick an expense category — the claim
posts with `category_id = null` and the "what for" text; (b) the receipt photo is
attached via the job Photos, not a dedicated expense-receipt link.
**Why:** kept the field flow minimal; categories aren't synced to the device yet
and receipt-media needs a small join table.
**Do:** if you want field expenses categorised, I'll sync `expense_categories`
to the app and add a picker; and add an `expense_receipts` link if the receipt
photo must attach to the specific claim.
**Blocks:** nothing — cash posts a receipt, expense posts a submitted claim
(visible in Expenses to approve on the dashboard).

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
