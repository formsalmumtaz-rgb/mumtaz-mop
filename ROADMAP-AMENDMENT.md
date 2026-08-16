# ROADMAP AMENDMENT — Claude inside MOP (filed 16 Aug 2026)

Owner's order: begin the LLM integration in the Supreme Admin console.
Governing principle (ratified, Art. IV compatible): **AI shall never run the
business. AI shall only explain the business.**

## Architecture — the three-layer rule

1. **Layer 1 — deterministic core.** Scheduling, routing, dosing, inventory,
   accounting. Rules, formulas, SQL. Zero model calls, ever.
2. **Layer 2 — prepared data.** Fixed, read-only, parameterised queries run
   through the non-privileged RLS role (`scopedRead`) assemble a structured
   data pack. The question text never becomes SQL; it only selects which
   optional pack (e.g. a customer drill-in, matched by parameterised ILIKE)
   is attached.
3. **Layer 3 — explanation.** The Anthropic API receives the pack and the
   question, and answers from the pack. It has no tools, no DB handle, no
   write path. A refusal or missing key degrades to a clear message; the
   business runs identically with the layer deleted (Art. IV test).

## Phase 1 — SHIPPED this run

- `/assistant` page in the ops console, **admin only** (`settings.manage`
  gate at page and API level).
- **Ask the business**: chat over the prepared pack — today's operations,
  attendance, unpaid invoices past terms, next 7 days' visits, contract
  expiry counts, lowest stock, held events, per-customer drill-in.
- **Draft a quotation scope**: for services we have never templated, Claude
  drafts intro / scope-of-work / line-item descriptions (structured output,
  **no numbers allowed**); the office carries them into a normal estimate →
  the engines or manual entry price it → the standard quotation PDF renders
  with our numbering and brand.
- Full audit: `assistant_log` (mig 091) records tenant, user, question,
  answer, model, token counts. RLS-isolated.
- Config: `ANTHROPIC_API_KEY` in `apps/ops-console/.env.local` + Vercel;
  `ASSISTANT_MODEL` optional override (default `claude-opus-5`).

## Later phases (NOT built — logged for the roadmap)

- **Phase 2 — report narration.** The daily/monthly report emails gain a
  short narrative paragraph generated FROM the computed figures (figures stay
  deterministic; narration clearly marked as commentary).
- **Phase 3 — anomaly explanation.** When the rule-based analysis flags an
  exception (stock variance, margin below target, failed jobs), the
  assistant drafts a one-paragraph explanation from the drill-down rows,
  shown in the console next to the flag.
- **Phase 4 — draft-to-record plumbing.** One-click "create estimate from
  draft": the drafted lines land as a draft estimate with prices empty,
  flagged `content_source = 'assistant'`, never auto-issued.
- Cost control: per-tenant monthly token budget in settings; the panel shows
  spend from `assistant_log` token counts.

## Boundaries (constitutional)

- No model call on any per-job or per-technician critical path (Art. V).
- No schema access, no arbitrary SQL, no write path from Layer 3.
- Numbers in customer-facing documents come only from engines or manual
  entry — a drafted document carries no Claude-invented figures.
- Every interaction logged; the log is append-only via RLS grants
  (select/insert only).
