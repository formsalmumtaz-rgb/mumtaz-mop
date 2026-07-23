# Mumtaz Operations Platform (MOP)

Integrated ERP + Field Service Management for a UAE facility-services group.
Pest control is the first vertical.

**Read `CLAUDE.md` first.** It points to the governing documents:
`CONSTITUTION.md` (binding), `CONTEXT.md`, `EXECUTION.md`, `DECISIONS.md`.

## Repository layout

| Path | Purpose |
|---|---|
| `apps/ops-console` | Office admin console (Next.js 15). |
| `apps/field-pwa` | Offline-first technician app (PWA + Dexie.js). |
| `packages/domain` | Shared types, event schemas, business rules. |
| `packages/db` | Database migrations + transactional outbox. |
| `services/worker` | Outbox drain loop (event dispatch). |
| `seed/` | Cleaned real customer master data (CSV). |

## Setup

Requires Node 20+ and pnpm. Copy `.env.example` to `.env.local` and fill in the
Supabase values (never commit `.env.local`). There is no local Docker database —
development runs against the Supabase staging project directly (see DECISIONS.md §2.A).

Current status: **K0 — environment setup.** No platform code yet.
