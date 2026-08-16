import Anthropic from "@anthropic-ai/sdk";
import { scopedRead } from "@/lib/rls";
import { pool } from "@/lib/db";

// Item 5 — Claude inside MOP (phase 1). Ratified three-layer principle:
// Layer 3 (this file) receives STRUCTURED data prepared by DETERMINISTIC
// queries. It never writes to the database and never executes arbitrary SQL —
// "AI shall never run the business. AI shall only explain the business."
// Admin console only; every question and answer is logged (assistant_log).

const MODEL = process.env.ASSISTANT_MODEL ?? "claude-opus-5";

// ── The prepared-query pack ─────────────────────────────────────────────────
// Fixed, read-only queries through the non-privileged scopedRead role. The
// question text only selects WHICH extra pack to include (customer lookup);
// it is never interpolated into SQL beyond a parameterised ILIKE.
export async function prepareBusinessContext(tenantId: string, question: string): Promise<Record<string, unknown>> {
  const q = (sql: string, params: unknown[] = []) =>
    scopedRead(tenantId, sql, [tenantId, ...params]).then((r) => r.rows).catch((e) => [{ query_error: (e as Error).message }]);

  const [today, attendance, unpaid, upcoming, contracts, stock, exceptions] = await Promise.all([
    q(`select count(*) filter (where scheduled_date = current_date)::int as jobs_today,
              count(*) filter (where scheduled_date = current_date and status = 'completed')::int as completed_today,
              count(*) filter (where scheduled_date = current_date and status in ('failed','cancelled'))::int as failed_today,
              (select coalesce(sum(amount),0)::float8 from receipts where tenant_id = $1 and receipt_date = current_date) as cash_today,
              (select coalesce(sum(total),0)::float8 from invoices where tenant_id = $1 and created_at::date = current_date) as invoiced_today
         from jobs where tenant_id = $1`),
    q(`select coalesce(t.full_name, t.code) as technician,
              exists (select 1 from shift_confirmations sc where sc.technician_id = t.id and sc.shift_date = current_date) as confirmed_today,
              exists (select 1 from preflight_checks pc where pc.technician_id = t.id and pc.check_date = current_date) as preflight_done
         from technicians t where t.tenant_id = $1 and coalesce(t.is_active, true) order by technician`),
    q(`select i.invoice_number, coalesce(cu.trade_name, cu.legal_name) as customer,
              ar.balance::float8, ar.days_overdue::int, ar.aging_bucket
         from invoice_ar ar
         join invoices i on i.id = ar.invoice_id
         join customers cu on cu.id = i.customer_id
        where ar.tenant_id = $1 and ar.balance > 0 and ar.days_overdue > 0
        order by ar.days_overdue desc limit 25`),
    q(`select j.scheduled_date::text, coalesce(cu.trade_name, cu.legal_name) as customer, j.status,
              (select string_agg(coalesce(t.full_name, t.code), ', ') from job_assignments ja
                join technicians t on t.id = ja.technician_id where ja.job_id = j.id) as team
         from jobs j join customers cu on cu.id = j.customer_id
        where j.tenant_id = $1 and j.scheduled_date between current_date and current_date + 7
        order by j.scheduled_date limit 40`),
    q(`select count(*) filter (where lifecycle_status = 'active')::int as active,
              count(*) filter (where lifecycle_status = 'active' and end_date <= current_date + 90)::int as expiring_90d
         from contracts where tenant_id = $1`),
    q(`select it.name as item, sum(oh.qty_base)::float8 as on_hand, u.code as unit
         from batch_stock_on_hand oh join items it on it.id = oh.item_id
         left join units u on u.id = it.base_unit_id
        where oh.tenant_id = $1 group by it.name, u.code order by on_hand asc limit 15`),
    q(`select count(*)::int as held_for_review from outbox_events
        where tenant_id = $1 and needs_review and processed_at is null`),
  ]);

  const ctx: Record<string, unknown> = {
    as_of: new Date().toISOString(),
    today_operations: today[0],
    technician_attendance_today: attendance,
    invoices_unpaid_past_terms: unpaid,
    upcoming_visits_next_7_days: upcoming,
    contracts: contracts[0],
    lowest_stock_items: stock,
    exceptions: exceptions[0],
  };

  // Customer drill-in: if the question plausibly names a customer, attach that
  // customer's recent history (parameterised match — never raw SQL from text).
  const { rows: custMatch } = await scopedRead(tenantId,
    `select id, coalesce(trade_name, legal_name) as name from customers
      where tenant_id = $1 and (trade_name ilike any(select '%' || w || '%' from unnest($2::text[]) w)
         or legal_name ilike any(select '%' || w || '%' from unnest($2::text[]) w))
      limit 3`,
    [tenantId, question.split(/\s+/).filter((w) => w.length >= 4).slice(0, 12)],
  ).catch(() => ({ rows: [] as { id: string; name: string }[] }));
  if (custMatch.length) {
    ctx.matched_customers = await Promise.all(custMatch.map(async (cm) => ({
      name: cm.name,
      recent_visits: await q(
        `select j.scheduled_date::text, j.status,
                j.attributes->>'recommendations' as recommendations
           from jobs j where j.tenant_id = $1 and j.customer_id = $2
          order by j.scheduled_date desc limit 6`, [cm.id]),
      open_invoices: await q(
        `select i.invoice_number, ar.balance::float8, ar.days_overdue::int
           from invoice_ar ar join invoices i on i.id = ar.invoice_id
          where ar.tenant_id = $1 and i.customer_id = $2 and ar.balance > 0 limit 6`, [cm.id]),
    })));
  }
  return ctx;
}

const SYSTEM = `You are the operations assistant inside the Mumtaz Operations Platform, speaking to the business owner.
You are READ-ONLY and EXPLAIN-ONLY: you receive a structured data pack prepared by the platform's own deterministic queries, and you answer questions FROM THAT DATA.
Rules:
- Every number you state must come from the data pack. If the pack doesn't contain what's needed, say exactly what is missing — never estimate or invent figures.
- Currency is AED. Be direct and concise; lead with the answer, then the supporting figures.
- You cannot take actions, change records, or run queries. If asked to change something, say which console screen does it.`;

function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  return new Anthropic();
}

export async function askBusiness(tenantId: string, userId: string | null, question: string): Promise<{ answer: string; error?: string }> {
  const client = getClient();
  if (!client) return { answer: "", error: "ANTHROPIC_API_KEY is not set — add it to apps/ops-console/.env.local (and Vercel) to enable the assistant." };
  const context = await prepareBusinessContext(tenantId, question);
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: SYSTEM,
    messages: [{
      role: "user",
      content: `DATA PACK (deterministic queries, as of now):\n${JSON.stringify(context, null, 1)}\n\nOWNER'S QUESTION: ${question}`,
    }],
  });
  if (response.stop_reason === "refusal") {
    return { answer: "", error: "The model declined this request." };
  }
  const answer = response.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n");
  await pool.query(
    `insert into assistant_log (tenant_id, user_id, kind, question, answer, model, input_tokens, output_tokens)
     values ($1,$2,'ask',$3,$4,$5,$6,$7)`,
    [tenantId, userId, question, answer, MODEL, response.usage.input_tokens, response.usage.output_tokens]);
  return { answer };
}

// ── Ad-hoc quotation drafting ───────────────────────────────────────────────
// Content assistance ONLY: Claude drafts intro / scope / line descriptions for
// a service we have never templated. Pricing stays with the estimate engine or
// manual entry — the draft carries NO numbers.
export interface QuotationDraft { intro: string; scope_of_work: string[]; line_items: { description: string }[] }

export async function draftQuotationContent(tenantId: string, userId: string | null, brief: string): Promise<{ draft?: QuotationDraft; error?: string }> {
  const client = getClient();
  if (!client) return { error: "ANTHROPIC_API_KEY is not set — add it to apps/ops-console/.env.local (and Vercel) to enable the assistant." };
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2500,
    system: `You draft quotation CONTENT for Al Mumtaz (UAE facility services: pest control, cleaning, facilities management).
Given the owner's description of a job scope, produce professional quotation language in the company's plain, formal style.
NEVER include prices, amounts, or quantities — pricing is computed elsewhere. Line items are descriptions only.`,
    messages: [{ role: "user", content: `Draft quotation content for this scope:\n\n${brief}` }],
    output_config: {
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            intro: { type: "string", description: "One-paragraph introduction for the quotation letter" },
            scope_of_work: { type: "array", items: { type: "string" }, description: "Scope of work bullets" },
            line_items: {
              type: "array",
              items: {
                type: "object",
                properties: { description: { type: "string" } },
                required: ["description"], additionalProperties: false,
              },
            },
          },
          required: ["intro", "scope_of_work", "line_items"],
          additionalProperties: false,
        },
      },
    },
  });
  if (response.stop_reason === "refusal") return { error: "The model declined this request." };
  const text = response.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
  let draft: QuotationDraft;
  try {
    draft = JSON.parse(text) as QuotationDraft;
  } catch {
    return { error: "Draft came back malformed — try rephrasing the scope." };
  }
  await pool.query(
    `insert into assistant_log (tenant_id, user_id, kind, question, answer, model, input_tokens, output_tokens)
     values ($1,$2,'draft_quotation',$3,$4,$5,$6,$7)`,
    [tenantId, userId, brief, text, MODEL, response.usage.input_tokens, response.usage.output_tokens]);
  return { draft };
}
