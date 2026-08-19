# DEBT.md — Documented Technical Debt

**Governed by:** `CONSTITUTION.md` Art. V §1 (the Two-Speed Rule).

> "No technical debt" is amended to **"no *undocumented* technical debt."**
> Every deliberate shortcut is logged here with an **owner** and a **repayment
> trigger**. Undocumented debt is a defect; documented debt is a decision.

Each entry states: what the shortcut is, why it was taken, what it costs us,
who owns repaying it, and the **trigger** — the observable event that means
"repay this now."

---

## D1 — Shared repo folder is also Cowork's working directory

**Logged:** 23 Jul 2026 · **Owner:** Zaza (project owner) · **Status:** OPEN

**The shortcut.** This git repository lives at `~/Mumtaz-MOP-Data/`, which is the
same folder mounted into **Cowork**. Cowork writes data files (cleaned CSVs,
reports, exports) directly into this folder and has **no awareness that it is a
git repository** — no `git` or terminal access, no knowledge of tracked files,
`.gitignore`, or commits. The two tools coordinate only through the owner
manually moving files (per Constitution Art. XVI §1 — "the owner is the
integration point, files are the interface").

**Why we accept it.** The Sprint Zero operating model (Constitution Art. XVI,
DECISIONS.md §6) deliberately uses the filesystem as the hand-off interface
between Cowork and Claude Code. Keeping one shared folder is what makes that
ten-second copy step work without extra tooling. Splitting them now would add
process overhead before we know it's needed.

**What it costs us / how it can bite.**
- Cowork may overwrite a git-tracked file (e.g. a `/seed/*.csv`) with a new
  version, silently changing tracked content under git's feet.
- Cowork may drop new untracked files into the tree, which can be swept into a
  commit by a broad `git add -A`.
- A Cowork write landing between a Claude Code read and commit can produce
  confusing diffs or a dirty working tree mid-task.
- `.gitignore` already excludes the known raw exports
  (`ALL CONTRACTS.xlsx`, root-level duplicate CSVs), which reduces but does not
  eliminate the risk.

**Repayment trigger.** **The first time a Cowork write causes a git conflict**
(a merge/rebase conflict, an unexpectedly clobbered tracked file, or a dirty
working tree that blocks a commit or push).

**Repayment (when triggered).** Separate the surfaces: give Cowork its own
mount (e.g. `~/Mumtaz-Cowork-Inbox/`) outside the repo, and make the owner's
hand-off an explicit copy *into* `/seed`. Optionally add a pre-commit guard that
refuses to stage unexpected top-level files.

---

## D2 — Database password contains URL-reserved characters

**Logged:** 23 Jul 2026 · **Owner:** Zaza (project owner) · **Status:** ✅ RESOLVED (11 Aug 2026)

**Resolution.** The owner rotated the database password to an **alphanumeric**
value (repayment path (b) below) and updated it in both `.env.local` files and
Vercel. No URL-encoding is required anywhere now; a raw paste into a
`postgresql://…` string is safe. Verified: `npm run test:worker` (15/15) and
`rls_isolation.sql` (20 checks) both green against the new credential. The
historical detail below is retained for context only.

**The issue.** The Supabase database password contains characters that are
reserved in a URI (`$ / ? &`). Placed raw into a `postgresql://user:pass@host/db`
connection string, they corrupt parsing (the `/` and `?` truncate the password,
`&` splits query params). The owner has chosen to keep this password as-is
because it is already provisioned across other systems and must not diverge.

**Mitigation in place.** The password is **URL-encoded** wherever it appears in a
connection string (`$`→`%24`, `/`→`%2F`, `?`→`%3F`, `&`→`%26`). `.env.local`
already holds the encoded form; connection verified with a live query.

**Why this is debt, not just a footnote.** Every *new* environment that builds a
connection string — CI secrets, the DigitalOcean worker host, Vercel env vars,
a teammate's machine — must apply the same encoding. Pasting the raw password
will fail in confusing, intermittent ways. Any tooling that itself re-encodes an
already-encoded value will double-encode and also fail.

**Repayment trigger.** A connection failure in **any** environment traced back to
password encoding (or a double-encoding bug). At that point, either (a) document
the encoded string as the canonical secret everywhere, or (b) if the owner ever
rotates the password, rotate it to an alphanumeric value and delete this entry.

---

## D3 — Direct Postgres host is IPv6-only; must use the Supabase pooler

**Logged:** 23 Jul 2026 · **Owner:** Zaza (project owner) · **Status:** OPEN (mitigated)

**The issue.** The Supabase direct host `db.<ref>.supabase.co` publishes only an
IPv6 (AAAA) address. On IPv4-only networks (this dev Mac, and typically CI
runners and many VPS hosts) the OS cannot resolve it — connections fail with
"could not translate host name". This is a Supabase platform default for new
projects, not a misconfiguration.

**Mitigation in place.** All connections use the **IPv4 session pooler**:
`postgresql://postgres.<ref>@aws-1-ap-south-1.pooler.supabase.com:5432/postgres`
(note: the shard is **aws-1**, not aws-0, and the pooler username is
`postgres.<ref>`, not `postgres`). Verified with a live query. The transaction
pooler on `:6543` also works and is the right choice for serverless/edge
(Vercel) runtimes later.

**Repayment trigger.** A new environment failing to reach the database, or a need
for true direct connections (e.g. certain logical-replication or session-pinned
features the pooler restricts). Resolutions: purchase the Supabase IPv4 add-on
for a direct host, or ensure the environment has working IPv6.

---

## D4 — TLS certificate verification disabled on the DB connection

**Logged:** 23 Jul 2026 · **Owner:** Zaza (project owner) · **Status:** OPEN — **MUST fix before production**

**The shortcut.** `services/worker/src/db.ts` connects with
`ssl: { rejectUnauthorized: false }`. Node treats the Supabase pooler's
certificate chain as self-signed and refuses it with `SELF_SIGNED_CERT_IN_CHAIN`;
disabling verification was the fastest way to a working dev connection.

**What it costs us.** With chain verification off, the client will trust *any*
certificate — it encrypts the traffic but does **not** authenticate the server,
so it is vulnerable to a man-in-the-middle. Acceptable against a throwaway dev/
staging database; **unacceptable for production data**, which includes the ledger
and customer PII.

**Repayment trigger.** **Before any production deployment.** This must never ship.

**Repayment.** Bundle the correct CA certificate (Supabase's pooler CA, or the
system trust store if the chain validates there), set
`ssl: { rejectUnauthorized: true, ca: <cert> }`, and confirm the worker and any
app connections still succeed. Add a startup assertion that refuses to run with
verification disabled when `NODE_ENV=production`.

---

## D5 — Duplicate migration numbering (process cause, now resolved)

**Logged:** 23 Jul 2026 · **Owner:** Zaza (project owner) · **Status:** RESOLVED (recorded to prevent recurrence)

**What happened.** The operations migration was submitted via the Supabase MCP
`apply_migration` tool. The tool-call approval was **rejected in the UI, but the
statement had already executed on the server** — `apply_migration` is not
transactional with the client-side approval. Believing it had not applied, the
file was renumbered and a new `005_agreement_schema` was authored, producing two
migrations numbered `005` and a mismatch between the repo files and the recorded
Supabase migration history.

**Why it is debt.** Two migrations sharing a number makes apply-order ambiguous
and breaks the "files == what built the database" guarantee that reproducibility
depends on.

**Prevention (the lesson).**
1. Treat a "rejected" MCP mutation as **possibly applied** — verify ground truth
   with `list_migrations` / `list_tables` before reworking.
2. **Never reuse or renumber a migration number** once it may have been applied.
3. Migration numbers are strictly sequential and immutable once shipped.

**Resolution.** Renumbered to a strict `001`–`010` sequence and proved the set by
applying it to a completely empty database with an identical-schema check
(see the reproducibility rebuild).

---

## D6 — Admin console has no authentication

**Logged:** 24 Jul 2026 · **Owner:** Zaza (project owner) · **Status:** OPEN — **must fix before any non-localhost exposure**

**The shortcut.** `apps/ops-console` runs in a single fixed admin context — it
resolves the seeded Mumtaz tenant directly and has **no login, no user identity,
no access control** at the application layer. Anyone who can reach the app can
read and write all master data. `created_by`/`actor_id` on writes are currently
null because there is no authenticated user.

**Why we accept it (for now).** Sprint Zero explicitly excludes auth beyond a
simple login; the console's Sprint-Zero job is master-data maintenance for the
demo, run only on `localhost`. Building Supabase Auth now would delay the demo
critical path.

**Repayment trigger.** **Before the console is reachable from any network beyond
localhost.** It must never be deployed publicly in this state.

**Repayment.** Wire Supabase Auth (email for office staff), set the tenant and
actor from the authenticated session, switch DB access to the `authenticated`
role so RLS is actively enforced (not merely present), and populate
`created_by`/`actor_id`/`confirmed_by` from the real user.

---

## D7 — Server Google key not IP-restricted (Vercel dynamic egress)

**Logged:** 24 Jul 2026 · **Owner:** Zaza (project owner) · **Status:** OPEN — pre-production

**The gap.** Art. XVII §4 requires server keys to be **IP-restricted**. The server
Geocoding key runs from Vercel serverless functions, which have **no stable
egress IP** on Hobby/Pro — so IP-restriction cannot be applied there yet. Interim
protection: the key is **API-restricted (Geocoding only)**, **server-side only**
(never sent to the browser), and **hard quota-capped** in Google Cloud.

**Repayment trigger.** **Before production deployment.** Give the server key a
stable egress IP to lock to — a Vercel static-IP/egress option, or route Google
calls through a fixed-IP proxy (e.g. a small function on infrastructure with a
static IP) — then add the IP restriction. The API restriction + quota cap remain
either way.

---

## D8 — Field PWA has no login (blocked by the /api/field/* auth fix)

**Logged:** 11 Aug 2026 · **Owner:** Zaza (project owner) · **Status:** OPEN — field app inert until repaid

**The shortcut.** The field PWA (`apps/field-pwa`) authenticates to nothing — it
calls `/api/field/sync|upload|media` with a plain same-origin `fetch` and no
identity. Those routes were themselves unauthenticated (anonymous, privileged
pool, `Access-Control-Allow-Origin: *`), so it worked.

**What changed.** The routes now **require a Supabase session** and scope every
read/write to the technician the session user operates as
(`technicians.user_id`, migration 051), through `scopedRead`/`mop_app` with no
wildcard CORS. The PDPL exposure is closed. **Consequence:** the PWA, having no
login, now gets `401` from all three — it cannot sync until it authenticates.

**Why we accept it (for now).** Closing the tenant-wide anonymous read/write was
urgent and the field app is not yet in real use. A broken-but-secure endpoint
beats a working-but-open one.

**Repayment trigger.** Before the field app is used by a real technician.

**Repayment.** (1) Add a Supabase login to the PWA and send its session with each
request (same-origin cookies, or `Authorization: Bearer` + `credentials:"include"`
plus the origin in `FIELD_APP_ORIGINS` if deployed cross-origin). (2) Provision a
technician login and set `technicians.user_id` for them (no UI for this mapping
yet — currently a manual insert). (3) Re-verify sync returns only that
technician's jobs and upload/media reject other technicians' jobs.

---

## D9 — Resend API key is full-access, not sending-only

**Logged:** 13 Aug 2026 · **Owner:** Zaza (project owner) · **Status:** OPEN — pre-production

**The shortcut.** The Resend API key provisioned for outbound email is a
full-access key rather than a sending-only key — deliberately, to simplify setup
while the channel is being commissioned.

**What it costs us.** A leaked key could read/manage the Resend account (domains,
keys, audiences), not merely send. Exposure is limited to the two git-ignored
`.env.local` files and (later) Vercel env vars.

**Repayment trigger.** **Before production go-live**: replace with a sending-only
key in `.env.local` (root + apps/ops-console) and Vercel, then revoke the
full-access key in the Resend dashboard.

---

## D-TEST1 — The suite's intermittent failures: root cause found and closed (19 Aug 2026)

**Symptom.** `npm run test:worker` returned **23/25** once, with 13 clean runs
either side of it and no code change between them. A suite that fails at random
is worse than no suite, so this was chased to the ground before further work.

**Root cause — proven, not inferred.** A session left **idle in transaction**
holds the `event_consumers` primary-key row it inserted. `drainOnce` claims each
(consumer, event) pair with an `insert … on conflict do nothing` against that
same key, so the claim **blocks** until `statement_timeout` (~2 min on the
pooler). The drain catches the error, rolls back, records the attempt and moves
on — leaving the event **unprocessed**. The test that follows then fails on a
**wrong value**, which reads exactly like a business-logic bug.

Demonstrated directly (session A holds the claim row uncommitted; session B runs
the drain's own claim statement):

```
Session A: holds event_consumers PK ('invoice_on_job_completed', 14f16af7…), NOT committed
Session B: claim BLOCKED then failed after 5.0s
           error: canceling statement due to statement timeout
Event after the blocked drain: processed_at=null, attempts=0
```

**Why it hit that particular run.** `_setup.ts` already cleared orphaned
sessions, but only those idle for more than **2 minutes**. A suite run takes
~65 seconds, so an orphan created shortly before a run survived the entire run.
Measured: at 35 seconds idle, the 2-minute rule declines to terminate it, and
the 30-second rule terminates it.

**Closed by two changes, both of which are also right in production:**

1. `services/worker/src/outbox.ts` — `set local lock_timeout = '2s'` on the claim
   transaction. A contended claim now gives up in two seconds and is retried on
   the next drain, instead of holding a connection for the full statement budget.
   Exactly-once is untouched: a claim that never committed grants nothing.
2. `services/worker/src/outbox.ts` — a contended failure now says so in the log
   ("LOCK CONTENTION, not a logic failure"), so a red suite is diagnosable at a
   glance rather than looking like a broken invariant.
3. `services/worker/test/_setup.ts` — orphan threshold **2 minutes → 30 seconds**,
   so an orphan can no longer outlive a run. Nothing legitimate sits idle in a
   transaction for 30 seconds against this database.

**Evidence.** 10/10 clean before the change (plus 3 earlier), 3/3 clean after.
**No test logic was changed and no assertion was relaxed.**

**Repayment trigger.** If a 23/25-class failure recurs, the drain now names it
in the log. If it recurs *without* a lock message, the cause is different and
this entry no longer applies — reopen it.
