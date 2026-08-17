# CLAUDE.md

Read this first, every session. It is the standing brief for this repository.

## Governing documents

Read these before any non-trivial task. They are the contract for this project.

- `CONSTITUTION.md` — what we build and by what rules. **Binding.**
- `CONTEXT.md` — technology research, cost analysis, event catalogue, data model, roadmap, risks.
- `EXECUTION.md` — the current sprint scope and task assignments.

If a request conflicts with `CONSTITUTION.md`, say so before acting. Do not silently comply.

## Project

Mumtaz Operations Platform (MOP) — integrated ERP + Field Service Management for a UAE facility services group (pest control, cleaning, facilities management). Pest control is the first vertical.

## The rules that matter most day to day

1. **Automation first, AI last.** Scheduling, routing, inventory, chemical dosage, and accounting are deterministic. They get rules, formulas, solvers and SQL — never a model call. If the AI layer were deleted, the business must run normally.
2. **Offline is the default state.** The field app must work for a full working day with zero connectivity. Anything requiring a network round-trip to complete a job is a defect.
3. **Cost must not scale with headcount or job count.** A technician completing a job costs AED 0.00 in inference. Any dependency priced per-user or per-job needs written owner approval.
4. **Data entered once.** Never build a screen that asks for something the system already knows.
5. **Modules never read each other's tables.** Cross-module access is by published function or domain event.
6. **Append-only:** service records, ledger entries, stock movements, cash receipts, audit log. Corrections are reversing entries, never edits or deletes.
7. **Migrations only.** No schema change is ever made by hand in a dashboard. If it isn't in a migration file, it doesn't exist.
8. **Two-Speed Rule.** Schema, events, ledger, audit and security are ten-year grade. UI and workflows are production-quality but explicitly disposable — expect to rewrite the technician screens after real field use. Deliberate shortcuts go in `DEBT.md` with an owner and a repayment trigger. Undocumented debt is a defect.
9. **Maps go through `RouteProvider`, never business logic.** Business logic never calls Google (or any map/route provider) directly — all geocoding, ETA, and route optimisation go through the internal `RouteProvider` interface (Art. XVII). Geocoding is **server-side only**. The scheduler decides *which* jobs; routing only *sequences* them; the platform must still schedule if Google is down.

## Business rules

**Never invent one.** If a rule is unknown, either ask, or seed it as a value marked `ASSUMED`, editable from settings without a deploy, and visibly flagged in the UI. Never present an assumption as a fact.

## Stack

Postgres (PostGIS; Supabase staging doubles as dev, DECISIONS §2.A) · Next.js 15 App Router + Tailwind · PWA field app with Dexie.js/IndexedDB and an explicit outbox queue · transactional outbox event bus in Postgres · Cloudflare R2 for photos · **Google Maps** for display + server-side geocoding, behind a `RouteProvider` interface, VROOM/ORS as fallback (Art. XVII) · MOP background jobs on Vercel Cron + Supabase (no DigitalOcean, DECISIONS §2.C) · jsPDF client-side.

Explicitly rejected: Kafka/RabbitMQ/SQS (Postgres is the bus) · repository-pattern abstraction over Postgres (we build *on* RLS, pg_cron, PostGIS and constraints deliberately) · any provider on the per-job operational critical path.

## Security

Row-Level Security is mandatory and must be **tested with a non-privileged user** as a condition of merge. An untested policy is assumed broken. External parties — customers, auditors, municipality inspectors — get scoped expiring links, never logins.

## Git remote and identity — this repo is account-isolated

This machine hosts a second business on a **different GitHub account**. Nothing
here may authenticate as that account.

- **The only remote is SSH via the `github-mumtaz` host alias:**
  `git@github-mumtaz:formsalmumtaz-rgb/mumtaz-mop.git`
  The alias is what selects the Mumtaz key (`~/.ssh/id_mumtaz`).
- **Never `git@github.com:...`** — a plain github.com URL does not match the
  alias, so SSH falls back to default key discovery and authenticates as the
  **other business's account**. This is the exact crossover the setup prevents.
- **Never the `gh` CLI** for anything that touches this repo (push, PR, auth).
  It carries its own account state, which is a second way to act as the wrong
  identity. Use plain `git` over the alias.
- **Never HTTPS.** HTTPS to github.com falls through to the macOS Keychain
  helper in Xcode's system gitconfig, which is shared across every account on
  this machine.
- Identity is pinned **locally** in `.git/config` (`user.name` / `user.email`),
  not inherited from `~/.gitconfig` — there is deliberately no global identity.

Verify at any time with `git remote -v` and `git ls-remote origin`; the SSH
debug line must read `Offering public key: ~/.ssh/id_mumtaz`.

## Proof-of-Work Protocol — mandatory

Any claim that a task is complete must include, in the same message:

1. `git diff --stat`
2. Build/test output showing a pass
3. The commit hash
4. Confirmation of push

**A completion claim without all four is treated as not done, regardless of how confident it sounds.** This rule exists because it has already been violated on a previous project in this organisation.

## Definition of Done

- [ ] Migration written and applied
- [ ] RLS policy written and tested with a non-privileged user
- [ ] Events emitted are defined in `packages/domain`; consumers idempotent
- [ ] Works offline where required
- [ ] Arabic/RTL correct where customer-facing
- [ ] Error states designed, not just the happy path
- [ ] Proof-of-Work supplied
- [ ] Architecture Baseline still holds (see below)

## Architecture Baseline — standing rule (Baseline v1, frozen 25 Jul 2026)

`ARCHITECTURE-BASELINE.md` is the frozen reference point after K1–K4. Every feature, **Tier 1 onward**, obeys this:

1. **Before writing code:** state which modules are affected and why, and give a **regression test plan** — which baseline evidence (worker tests, `rls_isolation.sql`, `invariants.sql`, `fingerprint.sql` diff, `dry-run.ts`) and which invariants the change touches, and how each is re-proven.
2. **Never weaken or bypass:** offline sync, scheduling integrity, inventory accuracy, payment recording, audit logging — or any structural invariant: exactly-once event processing · `debits=credits` by constraint · append-only on `stock_movements`/`journal_lines`/`service_reports`/`audit_log`/`generated_documents` · RLS tenant isolation tested with a non-privileged role · version immutability on reference data · frozen snapshots on transaction records · byte-identical migration rebuild from empty.
3. **Relaxing an invariant is a constitutional amendment** (Art. XII) needing the owner's explicit approval — never a silent implementation decision. Stop and ask.
4. Some things can only be verified on a **real device** (airplane-mode completion, PDF rendering, map tiles, photo capture+upload) — see the manual verification checklist in `ARCHITECTURE-BASELINE.md`; a release is not accepted until the owner ticks those.

## Working style

Use plan mode before non-trivial work. Challenge poor architectural decisions, including ones written in the governing documents — silence is negligence, not consent. Ask rather than assume. Prefer maintainability over cleverness.
