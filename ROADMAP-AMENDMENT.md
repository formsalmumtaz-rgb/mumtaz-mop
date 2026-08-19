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

## Phases 2–4 — SHIPPED (run 7)

- **Phase 2 — report narration.** `/reports/preview` shows a *Commentary*
  block written from the already-computed figures and the rule-flagged
  exceptions, clearly labelled as commentary. It lives in the CONSOLE, not in
  the scheduler: the daily/weekly/yearly emails are assembled and sent with no
  model call anywhere near them. No key, a refusal, or any error → the block
  simply does not render and the report is unchanged (verified: preview
  returns 200 with the full report and zero commentary when no key is set).
- **Phase 3 — anomaly explanation.** The same narration is given the exception
  flags (completion rate, expenses vs revenue, overdue invoices, expiring
  contracts, held events, bounced email) and asked what deserves attention
  first — so the flags arrive explained, not just listed.
- **Phase 4 — draft to estimate.** 'Create a draft estimate from this' on the
  assistant's quotation draft creates a real DRAFT estimate carrying the
  wording in its notes, with **no lines and no prices**, opened straight into
  the estimate screen. The office prices it through the engines as usual —
  nothing Claude wrote can become a number on a customer document.

## Later phases (NOT built — logged for the roadmap)

- **Narration in the emails themselves.** Deliberately NOT done: it would put
  a model call on a scheduled path. If it is ever wanted, it must be
  pre-generated in the console and stored on the notification, never called
  from the sweep.
- **Per-line draft-to-estimate.** Today the drafted wording lands in the
  estimate's notes. Structured lines (description per row, prices empty) need
  a pricing model chosen per line, which is a real decision — worth building
  once the category engine covers the untemplated services.
- Cost control: per-tenant monthly token budget in settings; the panel shows
  spend from `assistant_log` token counts.

## Boundaries (constitutional)

- No model call on any per-job or per-technician critical path (Art. V).
- No schema access, no arbitrary SQL, no write path from Layer 3.
- Numbers in customer-facing documents come only from engines or manual
  entry — a drafted document carries no Claude-invented figures.
- Every interaction logged; the log is append-only via RLS grants
  (select/insert only).

---

# WHATSAPP REMINDERS — FILED, NOT BUILT (19 Aug 2026)

Owner's instruction: file the design, do not build it yet.

## The hard rule

Customer reminders over WhatsApp go through the **official WhatsApp Business
API only** — Meta direct, or a BSP such as Twilio. **Unofficial WhatsApp Web
automation libraries are forbidden under any circumstances** (whatsapp-web.js,
Baileys, Venom and similar). They breach WhatsApp's Terms of Service and the
realistic penalty is the **company's business number being banned** — losing
the channel the business already runs on. No exception, no "just for testing".

## Cost, for the owner's decision

UAE **utility** conversations (appointment reminders qualify) run roughly
**USD 0.02–0.05** each. At ~3,500 visits a year that is about
**AED 400–700 per year**, plus the BSP's platform fee if a BSP is used
(Twilio adds a per-message fee; Meta direct has none). Template messages must
be pre-approved by Meta before they can be sent.

## What was built now so the later work is small

The notification engine is **channel-plural as of migration 096**, not
email-hardcoded:

- `outbound_notifications.channel` ('email' | 'whatsapp' | 'sms', default
  'email') with `channel_ref` for the provider-side id per channel.
- `customers.preferred_channel` — the choice is data, not code.
- Adding WhatsApp becomes a dispatcher branch next to `sendViaProvider`, plus
  Meta-approved templates. No schema change under pressure, and no rewrite of
  the queue, the sweep or the idempotency rules.

## Still to decide when the owner is ready

- Meta direct vs Twilio (cost vs integration effort).
- Which notices move to WhatsApp: 24h visit notice and schedule changes are
  the obvious wins; invoices and reports stay on email (attachments).
- Opt-in capture — WhatsApp requires the customer to have opted in; the
  consent flag belongs on the customer record before the first send.
