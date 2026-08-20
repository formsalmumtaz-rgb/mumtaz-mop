# PILOT — running a real day on the platform

Written for the owner. Build **`5393636`**. Nothing here is theory: every command
was run on this machine before it was written down.

---

## 1. Starting it

```bash
brew install cloudflared     # once, only if you have never installed it
./scripts/pilot.sh
```

It prints two HTTPS URLs and the build hash. **Keep that window open all day** —
closing it kills both URLs.

### Why this is not `phone-test.sh`

`phone-test.sh` deliberately tunnels only the field app and keeps the console on
your Mac, from when the console had no login. `pilot.sh` tunnels both.

Since D6 was closed (20 Aug 2026) the login is no longer something a script has
to remember to turn on. `AUTH_REQUIRED` defaults to `true` everywhere; the
opt-out works only on a machine with `MOP_ENV=development`, and anywhere else the
server **refuses to start** rather than serve without a login. `pilot.sh` still
sets the flag explicitly, but it is now belt and braces rather than the only
thing standing between the console and the open internet.

**The URLs are not written to disk.** Every log that could contain one goes to a
0700 temp directory that the exit trap truncates and deletes, so closing the
window is enough — there is nothing left to find afterwards. Do not redirect the
script's own output to a file; that would put the URLs back on disk.

Verified before writing this:

| | |
|---|---|
| `/`, `/customers`, `/hr` without a login | **307 → /login** |
| `/login` | 200 |
| `/api/field/*` without a token | **401 JSON** (not a login redirect, so the technician app still works) |

### Your one-time phone cache clear

You have had a stale cache report a false "nothing changed" before. Do this once
per phone, the first time you open build `5393636`:

1. Delete the old Mumtaz icon from the home screen (long-press → Remove).
2. **iPhone:** Settings → Safari → Advanced → Website Data → search "trycloudflare"
   → swipe-delete. **Android:** Chrome → ⋮ → Settings → Site settings → Storage →
   find the URL → Clear.
3. Open the new URL, hard-reload once (iPhone: hold reload → *Request Desktop* then
   back; Android: ⋮ → reload).
4. **Check the footer says `build 5393636`.** If it does not, the cache is still
   stale — repeat step 2.
5. Add to Home Screen, then open it from the icon.

After this first clear, updates are self-healing: the service worker drops old
caches, activates immediately and takes over the tab (`cleanupOutdatedCaches`,
`skipWaiting`, `clientsClaim`).

---

## 2. The five-point proof list

These are the things that **cannot** be verified anywhere but a real phone. The
release is not accepted until all five pass. Taken from
`ARCHITECTURE-BASELINE.md` §5, which is current — I re-read it today.

**1 · Airplane-mode job completion** *(the one that matters most)*
- Open online, tap "Sync today's jobs". Turn on airplane mode.
- Complete a job: checklist, photo, signature, Complete.
- Force-close the app. Reopen, still in airplane mode → the completion and the
  "N to sync" counter are still there.
- Turn airplane mode off → "N to sync" drops to 0 and the office sees it.

**2 · PDF report on the phone**
- On a completed job, "Generate report (PDF)". It opens with the Mumtaz logo,
  brand red, job/customer/site, checklist, signature, and **correctly-shaped
  Arabic**.

**3 · Photo capture and upload**
- Take a photo in the field app. It compresses to WebP and shows as a thumbnail
  **while still offline**. After reconnect it uploads and is retrievable.

**4 · Map tiles and pin capture**
- Console → a customer → "Add a site". The Google map renders tiles, clicking
  drops a pin, "Find on map" resolves an address.

**5 · The technician's day, end to end** *(new — not in the frozen baseline)*
- Sign in → **I'm here** → tick all five uniform items → fuel band → **TIME IN**
- Work a job → **TIME OUT** → the screen shows hours and the day's KPIs
- Supervisor: **Close the day** → odometer, fuel, incidents → **I confirm this is true**
- Console `/hr` shows the hours; console `/schedule/approvals` shows the day.

---

## 3. What I need from you before two technicians can work a real day

Ordered by what blocks what.

### 3.1 — Real staff records *(blocks everything)*
There are 11 technician rows and **ten are placeholders** — "Technician 02",
"Technician 03". Only "ashiq" is a real name. I need, for the two pilot people:

- full name, phone, employee reference
- which of the two is the **team lead** (only a lead can submit the pre-flight and
  close the day)

### 3.2 — Google addresses, or passwords *(blocks sign-in)*
**One** technician login exists today, and it is the test one. For two real people:

- their Google addresses → I register them with
  `scripts/provision-employee-logins.ts` and only those addresses can sign in, or
- tell me to use email/password instead, which needs the
  **`SUPABASE_SERVICE_ROLE_KEY`** — currently **empty** in `.env.local`
  (BLOCKED task 4). Google is the shorter path.

### 3.3 — Real work to do *(the one people miss)*
**Every contract and job in the system is test data.** There are 46 future-dated
jobs and 11 active contracts and *none of them are real*. Two technicians cannot
work a real day against fiction. So one of:

- **(a)** pick 3–5 real customers from the imported 583, create a real contract for
  each, and activate it — the schedule and jobs generate themselves; or
- **(b)** create ad-hoc jobs directly for real customers, no contract needed.

**(b) is the right choice for a one-day pilot.** It touches less, and it does not
leave a half-real contract behind when you cut over to the fresh tenant.

### 3.4 — Crew and vehicle assignment *(5 minutes, but currently zero)*
There are **0 crew assignments and 0 vehicle assignments**. Console →
**Crews** → drag the two technicians onto a team and the van onto the same team.
It persists day to day; you only do this once.

### 3.5 — Pins for the sites you pick
**339 of 464 sites have a map pin**; 125 do not. Pick pilot customers from the
pinned ones, or accept that the technician captures the pin at the door on the
first visit (which is the designed behaviour, not a failure).

### 3.6 — Optional, does not block
`ANTHROPIC_API_KEY` is absent, so the assistant and report commentary stay hidden.
Everything else works without it.

---

## 4. Go-live cutover — option (d), fresh tenant

Run this **only after the pilot passes**. Roughly half a day, most of it waiting.

**Before you start**
1. Confirm the pilot's five proof points all passed.
2. Have your accountant's answers to BLOCKED §0D (the four corporate-tax numbers).
3. Pick a cutover moment when nobody is mid-job — end of a working day.

**The cutover**
1. **Rebuild from empty into a scratch database and diff it against staging.**
   This is DEBT D-MIG1's repayment trigger and it is not optional: until it has
   been done once, "the migrations rebuild cleanly" is a claim, not a fact. If the
   diff is not clean, **stop** — the whole plan rests on this.
2. Create the production tenant. Run migrations 001→127 in order.
3. Re-import the customer master: `xlsx-to-import-csv.ts` → `stage-master-import.ts`
   → read the validation report → `commit-master-import.ts --expect-clean <n>`.
   Expect **583 customers, 24 groups, 464 sites, 403 contacts**.
4. Re-apply the customer decisions that were made outside the import:
   - house account flag on **11387**
   - blank TRNs on **11197** and **11321**
   - Calicut `CUST-0001` → `11193` does **not** apply — there is no legacy record
     in a fresh tenant.
5. Set the settings that are answers rather than defaults: `org.trn`,
   `org.legal_name`, `org.trade_licence`, `operations.home_base` (25.378096,
   55.461512), `scheduling.near_area_km` = 15, `pricing.emirate_factor` 15%,
   `pricing.blitz_price_per_litre` 85, `tax.*`.
6. Create the real staff, teams and vehicles. Assign crews.
7. Register the Google addresses.
8. Smoke test on the new tenant: raise one invoice, take one payment, run one
   report. Confirm the seller line reads **AL MUMTAZ BLDG CLEAN & PEST CONTROL,
   TRN 100072077900003**.
9. Point `.env.local` and Vercel at the production tenant.
10. Mark the old tenant **read-only** — keep it as the archive, do not delete it.

**What you lose, stated plainly:** the 338 test transactions (worthless), the
reconciliation links on the 16 legacy `CUST-` records (they exist only because of
test data), and the burned `CUST-0001…0600` range (never used in a fresh tenant).
Nothing else.

**What you must not skip:** step 1. Everything else is recoverable; a bad schema
rebuild discovered after the import is not.
