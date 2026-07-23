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

**Logged:** 23 Jul 2026 · **Owner:** Zaza (project owner) · **Status:** OPEN (mitigated)

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
