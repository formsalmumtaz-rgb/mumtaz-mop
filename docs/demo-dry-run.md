# Golden Thread — demo dry-run script & checklist

Audience: operations manager + senior technicians. Length: ~10 minutes.
The two moments that sell it: **(1)** a contract is activated and tomorrow's work
exists without anyone creating it; **(2)** the phone goes into **airplane mode** and
the technician keeps working.

---

## A. Pre-demo checklist (do this the morning of)

**Environment**
- [ ] `.env.local` complete: Supabase, both Google keys, R2 keys, `OUTBOX_DRAIN_SECRET`.
- [ ] DB reachable; migrations `001`–`013` applied; demo data present:
      `CUST-0001 Calicut Restaurant`, branch pinned, contract **1330/25 active**,
      **24 schedule rows + 2 jobs**, `contract.activated` consumed.
- [ ] Ops console runs on the demo laptop: `pnpm --filter @mop/ops-console dev` → `localhost:3100`.
- [ ] **Map renders** on the laptop's real Chrome (a customer → "Add a site").
- [ ] Field app served on the LAN and installed on the phone:
      `pnpm --filter @mop/field-pwa preview --host` → open `http://<laptop-ip>:3200`
      on the phone → **Add to Home Screen**.
- [ ] On the phone, **online**, tap "Sync today's jobs" → jobs appear.
- [ ] Generate one report on the phone to confirm the **PDF opens** (logo + Arabic).
- [ ] Phone charged; airplane-mode toggle within reach; screen-mirror to the room if possible.

**Discipline (EXECUTION §6)**
- [ ] Real customer data on screen — never "Test Customer 1".
- [ ] Do NOT add features this morning.
- [ ] Pick the ONE broken thing you'll show on purpose (see §D).

---

## B. The 10-minute script

**0:00 — Frame it (30s).** "Today a contract is signed on paper, someone types the
schedule into a spreadsheet, the technician gets a WhatsApp, and the report is
retyped in the office. Watch what happens instead."

**0:30 — Office: the customer (1 min).** Open `localhost:3100` → **Customers** →
Calicut Restaurant. Show the branch with its **GPS pin on the map**, the contract
terms. (If asked, add a site live and drop a pin — the map + address search.)

**1:30 — MOMENT #1: activation → work appears (2 min).** On a *draft* contract press
**Activate ▶**. Immediately the page shows: **24 scheduled visits (Aug 2026 → Jul
2027), 2 jobs created, 1 renewal reminder** — *"nobody typed any of that. The
contract's frequency generated a year of work, and the renewal reminder for 60 days
before it ends."*

**3:30 — Hand the phone to a technician (30s).** They open the job — customer, site,
access notes, GPS all there, pre-synced.

**4:00 — MOMENT #2: AIRPLANE MODE (3 min).** Turn on airplane mode **in the room**.
The technician completes the job with **no signal**: checklist, photo, chemical dose,
**customer signature**, then **generates the PDF report on the phone** — still
offline. The counter shows "N to sync".

**7:00 — Reconnect + safety (1.5 min).** Turn airplane mode off. The queue drains;
"N to sync" goes to 0. Say: *"and if the connection drops halfway through the upload,
it finishes the rest on the next try and never double-posts — every item carries a
unique id."*

**8:30 — Office: the loop closes (1 min).** Back on the laptop: the job is completed,
stock was deducted, an invoice was queued (for per-visit contracts), and the
**dashboard** tile updated — *"entered once by the technician, everywhere else it just
appeared."*

**9:30 — Close.** "That's the spine. It runs with the AI switched off, and it runs
with the network switched off."

---

## C. The line for each moment
- **Moment 1:** *"A year of scheduled work and the renewal reminder, from one click."*
- **Moment 2:** *"The radio is off. He's still working. That's the whole point."*

## D. Show ONE thing that isn't finished (build trust, EXECUTION §6.4)
Pick one and say it plainly:
- **Chemical dose shows "no recipe configured"** — the recipe table is a data task
  (Cowork C2) the owner reviews before it goes live; the calculator is wired and waiting.
- Or: **220 customers aren't imported yet** — that's the K5 import with a dry-run and
  per-row rejects, not a blind load.

## E. Three technician objections + honest answers
1. *"What if I have no signal all day?"* — The app is built for that: it works a full
   day offline and syncs when you're back. Nothing you enter is lost.
2. *"Is this more taps than paper?"* — The job, customer, and site are already there;
   you tap the checklist, take the photo, get the signature. No re-typing an address.
3. *"Who sees my location / photos?"* — GPS and site photos are for the service record
   only; the retention and consent wording is being finalised (owner's legal track).

## F. If you fall behind — cut in this order (EXECUTION §7)
1. Dashboard (describe it). 2. Invoice (show the queued row). 3. Stock deduction.
**Never cut:** the contract fan-out, or airplane mode. Those two *are* the demo.

## G. If something fails live
- Map blank on a device → it needs a real GPU/network; show it on the laptop instead.
- Phone won't sync → it's fine, the work is safe on the device; show the "N to sync"
  counter and move on — that IS the offline guarantee.
- Don't debug live. Narrate what it *will* do and continue.

## H. Do not promise
No dates. Show what exists. This is Sprint Zero, not a finished product.
