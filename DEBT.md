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
