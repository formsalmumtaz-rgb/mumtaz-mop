import type { Pool, PoolClient } from "pg";
import type { Consumer, ParsedEvent } from "./outbox";
import { renderEmailHtml, type EmailCardRow } from "./emailTemplate";

// Customer email architecture (DOCUMENT 9 §D, mig 068).
//
// Split of responsibilities:
//   * CONSUMERS (this file, registered in registry.ts) QUEUE notifications in the
//     same transaction as the event — no network inside a transaction, ever.
//   * runNotificationSweep(pool) — called by the /api/notifications/run cron —
//     queues the time-driven notices (24h-before visit, document expiry) and then
//     DISPATCHES everything queued through the transport.
//   * Transport: provider-agnostic. With EMAIL_API_KEY + EMAIL_FROM set it sends
//     via the Resend HTTP API; without them (BLOCKED A18) it marks rows 'logged' —
//     the full pipeline runs in dev with zero sending. A bounce/failure marks the
//     customer's email_bounced_at (data-quality flag) — never silent.
//   * Templates are deterministic strings assembled from structured data (no AI,
//     Art. IV). Notification-only: no reschedule/cancel links — the notice carries
//     the team lead's name + phone from the technician record.

const pickEmail = async (c: PoolClient, tenantId: string, customerId: string): Promise<string | null> => {
  const { rows } = await c.query(
    `select email from contacts
      where tenant_id = $1 and customer_id = $2 and email is not null and archived_at is null
      order by is_primary desc, created_at asc limit 1`,
    [tenantId, customerId]);
  return rows[0]?.email ?? null;
};

// Vision P2: every queued notification carries the branded HTML body alongside
// the plain text (content log stores BOTH — what was sent is what is frozen).
// `card` renders the CTA-style summary block; paragraphs default to the text body.
async function queue(c: PoolClient, n: {
  tenantId: string; kind: string; customerId?: string | null; branchId?: string | null;
  jobId?: string | null; contractId?: string | null; toEmail: string | null;
  subject: string; body: string; attachmentRef?: string | null;
  serviceLineCode?: string | null; title?: string; card?: { heading?: string; rows: EmailCardRow[] };
  footnote?: string | null;
}): Promise<void> {
  const html = renderEmailHtml({
    serviceLineCode: n.serviceLineCode ?? "pest_control",
    title: n.title ?? n.subject,
    paragraphs: n.body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean),
    card: n.card,
    footnote: n.footnote ?? null,
  });
  await c.query(
    `insert into outbound_notifications
       (tenant_id, kind, customer_id, branch_id, job_id, contract_id, to_email, subject, body_text, body_html, attachment_ref, status)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, case when $7::text is null then 'failed' else 'queued' end)`,
    [n.tenantId, n.kind, n.customerId ?? null, n.branchId ?? null, n.jobId ?? null, n.contractId ?? null,
     n.toEmail, n.subject, n.body, html, n.attachmentRef ?? null]);
}

// The one Resend call — used by the sweep and by manual/test sends. Attachments
// are base64 (Resend format). Exported so scripts exercise the REAL transport.
export async function sendViaProvider(args: {
  to: string; subject: string; text: string; html?: string | null;
  attachments?: { filename: string; content: string }[];
}): Promise<{ ok: boolean; id?: string; error?: string; bounce?: boolean }> {
  const key = process.env.EMAIL_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) return { ok: false, error: "EMAIL_API_KEY/EMAIL_FROM not set" };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from, to: args.to, subject: args.subject, text: args.text,
      ...(args.html ? { html: args.html } : {}),
      ...(args.attachments?.length ? { attachments: args.attachments } : {}),
    }),
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  if (res.ok) return { ok: true, id: body.id };
  return { ok: false, error: body.message ?? `HTTP ${res.status}`, bounce: res.status === 422 || res.status === 400 };
}

// ── Consumers (queue in the event's transaction) ────────────────────────────

// contract.activated → annual schedule document notice (with the standing clause)
export const annualScheduleNotifier: Consumer = {
  name: "annual-schedule-notifier",
  eventTypes: ["contract.activated"],
  handle: async (c: PoolClient, ev: ParsedEvent) => {
    if (ev.envelope.event_type !== "contract.activated") return;
    const p = ev.payload as { contract_id: string; customer_id: string };
    const t = ev.envelope.tenant_id;
    const { rows: ct } = await c.query(
      `select ct.contract_number, cu.trade_name, cu.legal_name,
              (select count(*)::int from contract_schedule s where s.contract_id = ct.id) as visits,
              (select min(s.scheduled_date)::text from contract_schedule s where s.contract_id = ct.id) as first,
              (select max(s.scheduled_date)::text from contract_schedule s where s.contract_id = ct.id) as last
         from contracts ct join customers cu on cu.id = ct.customer_id where ct.id = $1`, [p.contract_id]);
    if (!ct[0]) return;
    const email = await pickEmail(c, t, p.customer_id);
    const name = ct[0].trade_name ?? ct[0].legal_name ?? "Customer";
    await queue(c, {
      tenantId: t, kind: "annual_schedule", customerId: p.customer_id, contractId: p.contract_id, toEmail: email,
      subject: `Your annual service schedule — contract ${ct[0].contract_number ?? ""}`.trim(),
      body:
`Dear ${name},

Your service schedule for contract ${ct[0].contract_number ?? ""} has been generated: ${ct[0].visits} visits from ${ct[0].first} to ${ct[0].last}.

This schedule is auto-generated and subject to change; historical on-time adherence is approximately 80%. Any change to a confirmed visit will be communicated to you in advance.

To discuss a visit, please call your assigned team lead (details on each visit notice).

Al Mumtaz Building Cleaning & Pest Control`,
    });
  },
};

// job.completed → (a) service report email for THIS job; (b) ETA notice for the
// technician's NEXT scheduled job today (fired exactly when the previous job ends).
export const jobCompletionNotifier: Consumer = {
  name: "job-completion-notifier",
  eventTypes: ["job.completed"],
  handle: async (c: PoolClient, ev: ParsedEvent) => {
    if (ev.envelope.event_type !== "job.completed") return;
    const p = ev.payload as { job_id: string };
    const t = ev.envelope.tenant_id;
    const { rows: j } = await c.query(
      `select j.id, j.customer_id, j.branch_id, cu.trade_name, cu.legal_name,
              b.name as branch_name, b.address, sl.code as sl_code, st.name as service_type,
              j.scheduled_date::text as sd,
              (select string_agg(coalesce(tt.full_name, tt.code), ', ')
                 from job_assignments ja join technicians tt on tt.id = ja.technician_id
                where ja.job_id = j.id) as team,
              (select sr.id from service_reports sr where sr.job_id = j.id order by sr.created_at desc limit 1) as sr_id
         from jobs j join customers cu on cu.id = j.customer_id
         left join customer_branches b on b.id = j.branch_id
         left join service_lines sl on sl.id = j.service_line_id
         left join service_types st on st.id = j.service_type_id
        where j.id = $1 and j.tenant_id = $2`, [p.job_id, t]);
    if (!j[0]) return;
    const email = await pickEmail(c, t, j[0].customer_id);
    const name = j[0].trade_name ?? j[0].legal_name ?? "Customer";
    const cardRows = [
      { label: "Customer", value: name },
      j[0].branch_name || j[0].address ? { label: "Site", value: [j[0].branch_name, j[0].address].filter(Boolean).join(" — ") } : null,
      j[0].service_type ? { label: "Service", value: j[0].service_type } : null,
      j[0].sd ? { label: "Date", value: j[0].sd } : null,
      j[0].team ? { label: "Team", value: j[0].team } : null,
    ].filter((r): r is { label: string; value: string } => !!r);
    await queue(c, {
      tenantId: t, kind: "service_report", customerId: j[0].customer_id, branchId: j[0].branch_id, jobId: j[0].id,
      toEmail: email,
      subject: "Your service report",
      title: "Your service is complete",
      serviceLineCode: j[0].sl_code,
      card: { heading: "Visit summary", rows: cardRows },
      footnote: "Guarantee void if the service record is misplaced. Complaints within one month of service date.",
      body:
`Dear ${name},

Today's service visit is complete. Your service report is attached${j[0].sr_id ? "" : " and will follow shortly"}.

Thank you,
Al Mumtaz Building Cleaning & Pest Control`,
      attachmentRef: j[0].sr_id ? `/service-reports/${j[0].sr_id}/pdf` : null,
    });

    // ETA notice: the same technician's next scheduled job today
    const { rows: nxt } = await c.query(
      `select j2.id, j2.customer_id, j2.branch_id, cu.trade_name, cu.legal_name,
              to_char(j2.scheduled_start, 'HH24:MI') as st,
              tl.full_name as lead_name, tl.phone as lead_phone
         from job_assignments ja
         join job_assignments ja2 on ja2.technician_id = ja.technician_id and ja2.job_id <> ja.job_id
         join jobs j2 on j2.id = ja2.job_id and j2.tenant_id = $2
              and j2.status in ('scheduled','assigned') and j2.scheduled_date = current_date
         join customers cu on cu.id = j2.customer_id
         left join technicians tl on tl.id = ja.technician_id and tl.is_team_lead
        where ja.job_id = $1
        order by j2.scheduled_start asc nulls last limit 1`, [p.job_id, t]);
    if (nxt[0]) {
      const nEmail = await pickEmail(c, t, nxt[0].customer_id);
      const nName = nxt[0].trade_name ?? nxt[0].legal_name ?? "Customer";
      await queue(c, {
        tenantId: t, kind: "eta_notice", customerId: nxt[0].customer_id, branchId: nxt[0].branch_id, jobId: nxt[0].id,
        toEmail: nEmail,
        subject: "Your service team is on the way",
        body:
`Dear ${nName},

Our team has finished their previous assignment and is heading to you now${nxt[0].st ? ` (scheduled ${nxt[0].st})` : ""}.

${nxt[0].lead_name ? `Team lead: ${nxt[0].lead_name}${nxt[0].lead_phone ? ` — ${nxt[0].lead_phone}` : ""}` : ""}

Al Mumtaz Building Cleaning & Pest Control`,
      });
    }
  },
};

// job.rescheduled → tell the customer their visit moved. Emitted by the console
// only when the DAY changed on still-future work; if the customer has no
// contactable email the notification is queued unaddressed (visible in the
// console) rather than silently dropped.
export const scheduleChangeNotifier: Consumer = {
  name: "schedule-change-notifier",
  eventTypes: ["job.rescheduled"],
  handle: async (c: PoolClient, ev: ParsedEvent) => {
    if (ev.envelope.event_type !== "job.rescheduled") return;
    const p = ev.payload as { job_id: string; from_date?: string | null; to_date: string; start_time?: string | null };
    const t = ev.envelope.tenant_id;
    const { rows: j } = await c.query(
      `select j.id, j.customer_id, j.branch_id, cu.trade_name, cu.legal_name,
              b.name as branch_name, b.address, sl.code as sl_code, st.name as service_type,
              (select string_agg(coalesce(tt.full_name, tt.code), ', ')
                 from job_assignments ja join technicians tt on tt.id = ja.technician_id
                where ja.job_id = j.id) as team,
              (select tl.phone from job_assignments ja join technicians tl on tl.id = ja.technician_id
                where ja.job_id = j.id and tl.is_team_lead limit 1) as lead_phone
         from jobs j join customers cu on cu.id = j.customer_id
         left join customer_branches b on b.id = j.branch_id
         left join service_lines sl on sl.id = j.service_line_id
         left join service_types st on st.id = j.service_type_id
        where j.id = $1 and j.tenant_id = $2`, [p.job_id, t]);
    if (!j[0]) return;
    const email = await pickEmail(c, t, j[0].customer_id);
    const name = j[0].trade_name ?? j[0].legal_name ?? "Customer";
    await queue(c, {
      tenantId: t, kind: "schedule_change", customerId: j[0].customer_id, branchId: j[0].branch_id, jobId: j[0].id,
      toEmail: email, serviceLineCode: j[0].sl_code,
      subject: `Your service visit has moved to ${p.to_date}`,
      title: "Your visit has been rescheduled",
      card: {
        heading: "Updated visit",
        rows: [
          { label: "Customer", value: name },
          ...(j[0].branch_name || j[0].address ? [{ label: "Site", value: [j[0].branch_name, j[0].address].filter(Boolean).join(" — ") }] : []),
          ...(j[0].service_type ? [{ label: "Service", value: j[0].service_type }] : []),
          ...(p.from_date ? [{ label: "Was", value: p.from_date }] : []),
          { label: "Now", value: `${p.to_date}${p.start_time ? ` at ${p.start_time}` : ""}` },
          ...(j[0].team ? [{ label: "Team", value: j[0].team }] : []),
        ],
      },
      body:
`Dear ${name},

Your scheduled service visit has been moved${p.from_date ? ` from ${p.from_date}` : ""} to ${p.to_date}${p.start_time ? ` at ${p.start_time}` : ""}.

If this date does not suit you, please call us on 800 688${j[0].lead_phone ? ` or your team lead on ${j[0].lead_phone}` : ""} and we will arrange an alternative.

Al Mumtaz Building Cleaning & Pest Control`,
    });
  },
};

export const notifyConsumers: Consumer[] = [annualScheduleNotifier, jobCompletionNotifier, scheduleChangeNotifier];

// ── Cron sweep: time-driven queuing + dispatch ──────────────────────────────

export interface SweepResult {
  visitNotices: number;
  expiryNotices: number;
  dispatched: number;
  logged: number;
  bounced: number;
}

export async function runNotificationSweep(pool: Pool): Promise<SweepResult> {
  const c = await pool.connect();
  const out: SweepResult = { visitNotices: 0, expiryNotices: 0, dispatched: 0, logged: 0, bounced: 0 };
  try {
    // (a) 24h-before visit notices — one per job scheduled tomorrow, idempotent
    // (skip if a visit_notice_24h for that job already exists).
    const { rows: due } = await c.query(
      `select j.id, j.tenant_id, j.customer_id, j.branch_id,
              cu.trade_name, cu.legal_name, b.name as branch, b.access_notes,
              to_char(j.scheduled_start, 'HH24:MI') as st,
              (select tl.full_name || coalesce(' — ' || tl.phone, '') from job_assignments ja
                 join technicians tl on tl.id = ja.technician_id and tl.is_team_lead
                where ja.job_id = j.id limit 1) as lead
         from jobs j
         join customers cu on cu.id = j.customer_id
         left join customer_branches b on b.id = j.branch_id
        where j.scheduled_date = current_date + 1
          and j.status in ('scheduled','assigned')
          -- §3.4: the customer is told only once the OFFICE HAS APPROVED the day.
          -- This used to fire the moment the schedule was generated, which meant
          -- customers were promised visits the office had not yet agreed to and
          -- every later adjustment became an apology. Approving the whole day
          -- (shift_id is null) covers every shift in it.
          and exists (select 1 from schedule_approvals a
                       where a.tenant_id = j.tenant_id
                         and a.operating_date = coalesce(j.operating_date, j.scheduled_date)
                         and (a.shift_id is null or a.shift_id = j.shift_id))
          and not exists (select 1 from outbound_notifications n
                           where n.job_id = j.id and n.kind = 'visit_notice_24h')`);
    for (const j of due) {
      const email = await pickEmail(c, j.tenant_id, j.customer_id);
      const name = j.trade_name ?? j.legal_name ?? "Customer";
      await queue(c, {
        tenantId: j.tenant_id, kind: "visit_notice_24h", customerId: j.customer_id, branchId: j.branch_id, jobId: j.id,
        toEmail: email,
        subject: `Service visit tomorrow${j.st ? ` at ${j.st}` : ""}`,
        body:
`Dear ${name},

This is a reminder of your scheduled service visit tomorrow${j.st ? ` at ${j.st}` : ""}${j.branch ? ` at ${j.branch}` : ""}.

${j.access_notes ? `Site access: ${j.access_notes}` : "Please ensure the service areas are accessible (kitchen accessible, surfaces cleared)."}

${j.lead ? `Your team lead: ${j.lead}. To make any change, please call them directly.` : "To make any change, please call your assigned team lead."}

Al Mumtaz Building Cleaning & Pest Control`,
      });
      out.visitNotices++;
    }

    // (b) document expiry reminders per settings expiry.reminder_days — idempotent
    // per (document, interval) via a subject convention.
    const { rows: exp } = await c.query(
      `with cfg as (
         select s.tenant_id, jsonb_array_elements_text(s.value)::int as days
           from settings s where s.key = 'expiry.reminder_days'
       )
       select d.tenant_id, d.kind, d.title, d.customer_id, d.expiry_date::text, cfg.days
         from expiring_documents d
         join cfg on cfg.tenant_id = d.tenant_id
        where d.expiry_date - current_date = cfg.days
          and not exists (select 1 from outbound_notifications n
                           where n.tenant_id = d.tenant_id and n.kind = 'document_expiry'
                             and n.subject = 'Document expiry: ' || d.title || ' (' || cfg.days || 'd)')`);
    for (const d of exp) {
      const email = d.customer_id ? await pickEmail(c, d.tenant_id, d.customer_id) : null;
      await queue(c, {
        tenantId: d.tenant_id, kind: "document_expiry", customerId: d.customer_id, toEmail: email,
        subject: `Document expiry: ${d.title} (${d.days}d)`,
        body: `${d.title} expires on ${d.expiry_date} (${d.days} day(s) from today). Please arrange renewal.`,
      });
      out.expiryNotices++;
    }

    // (b2) attestation reminders (mig 076, condition 1): 14/7/3 days before the
    // deadline, on the day, and every 7 days while overdue. Internal notice —
    // office acts; idempotent per (contract, bucket) via subject convention.
    const { rows: att } = await c.query(
      `select a.tenant_id, a.contract_id, a.contract_number, a.customer, a.attestation_deadline::text as dl,
              a.is_overdue, a.attest_before_treatment,
              (a.attestation_deadline - current_date) as days_left
         from contract_attestation_alerts a
        where a.attestation_status in ('pending','submitted')
          and ( (a.attestation_deadline - current_date) in (14, 7, 3, 0)
                or (a.is_overdue and (current_date - a.attestation_deadline) % 7 = 0) )`);
    for (const a of att) {
      const bucket = a.is_overdue ? `overdue+${Math.abs(a.days_left)}d` : `${a.days_left}d`;
      const subject = `Attestation ${a.is_overdue ? "OVERDUE" : "due"}: contract ${a.contract_number ?? a.contract_id} (${bucket})`;
      const { rows: dup } = await c.query(
        `select 1 from outbound_notifications where tenant_id=$1 and kind='attestation' and subject=$2`,
        [a.tenant_id, subject]);
      if (dup.length) continue;
      await queue(c, {
        tenantId: a.tenant_id, kind: "attestation", contractId: a.contract_id, toEmail: null,
        subject,
        body: `Sharjah Municipality attestation for contract ${a.contract_number ?? ""} (${a.customer ?? ""}) ` +
              (a.attest_before_treatment
                ? `must be completed BEFORE treatment begins (Restrictive contract). Deadline: ${a.dl}.`
                : `is due by ${a.dl} (30 days from signing). `) +
              (a.is_overdue ? " THIS IS OVERDUE — both parties are exposed to violations and legal action (Unified Contract, condition 1)." : ""),
      });
      out.expiryNotices++;
    }

    // (b3) day-close operations report (Vision P4) — idempotent per tenant+date
    try {
      const { queueDailyReports, queuePeriodReports } = await import("./reports");
      out.expiryNotices += await queueDailyReports(c);
      out.expiryNotices += await queuePeriodReports(c);
    } catch (e) {
      console.error("[sweep] daily report queueing failed:", (e as Error).message);
    }

    // (b3b) month-end fuel price reminder (item 3B): on the last day of the
    // month, tell operations to set next month's fuel price. Internal notice,
    // idempotent per month via the subject.
    const { rows: eom } = await c.query(
      `select t.id as tenant_id, to_char(now() at time zone 'Asia/Dubai', 'YYYY-MM') as m
         from tenants t
        where (now() at time zone 'Asia/Dubai')::date
              = (date_trunc('month', now() at time zone 'Asia/Dubai') + interval '1 month - 1 day')::date`);
    for (const t of eom) {
      const subject = `Update fuel price for next month (${t.m})`;
      const { rows: dup } = await c.query(
        `select 1 from outbound_notifications where tenant_id = $1 and kind = 'manual' and subject = $2`,
        [t.tenant_id, subject]);
      if (dup.length) continue;
      await queue(c, {
        tenantId: t.tenant_id, kind: "manual", toEmail: null,
        subject,
        body: `Today is the last day of the month. Set next month's fuel price in Cost setup (cost.fuel_price_per_litre) — all fuel cost calculations use the current month's price.`,
      });
      out.expiryNotices++;
    }

    // (b3c) AMC lifecycle (item 4): expiry reminders + last-service closeout
    try {
      const { sweepContractLifecycle } = await import("./lifecycle");
      out.expiryNotices += await sweepContractLifecycle(c, (n) => queue(c, n));
    } catch (e) {
      console.error("[sweep] contract lifecycle failed:", (e as Error).message);
    }

    // (b4) roll the job horizon: planned schedule rows entering the generation
    // window become jobs (item 4 fix — without this, visits after the
    // activation-time window never materialized).
    try {
      const { materializeDueScheduledJobs } = await import("./consumers");
      await materializeDueScheduledJobs(c);
    } catch (e) {
      console.error("[sweep] job materialization failed:", (e as Error).message);
    }

    // (c) dispatch everything queued — branded HTML preferred, text always
    const { rows: q } = await c.query(
      `select id, tenant_id, kind, customer_id, contract_id, to_email, subject, body_text, body_html from outbound_notifications
        where status = 'queued' order by created_at asc limit 200`);
    const configured = !!process.env.EMAIL_API_KEY && !!process.env.EMAIL_FROM;
    for (const n of q) {
      if (!configured) {
        await c.query(`update outbound_notifications set status='logged', sent_at=now() where id=$1`, [n.id]);
        out.logged++;
        continue;
      }
      try {
        // Item 8: the daily report carries its Excel pack (regenerated at send
        // time from the same deterministic queries — identical numbers).
        let attachments: { filename: string; content: string }[] | undefined;
        if (n.kind === "contract_closeout" && n.contract_id) {
          try {
            const { buildCloseoutPdf } = await import("./lifecycle");
            const pdf = await buildCloseoutPdf(c, n.tenant_id, n.contract_id);
            if (pdf) attachments = [{ filename: "contract-service-summary.pdf", content: pdf.toString("base64") }];
          } catch (e) {
            console.error("[sweep] closeout pdf failed:", (e as Error).message);
          }
        }
        if (n.kind === "daily_report") {
          try {
            const { buildRangeExcel } = await import("./reports");
            // Subjects carry their own window: '— 2026-08-16' (daily),
            // '— 2026-08-10 to 2026-08-16' (weekly), '— 2026-07' (monthly),
            // '— 2026' (yearly). The workbook always matches the email.
            const dates = n.subject.match(/\d{4}-\d{2}-\d{2}/g) ?? [];
            const month = /—\s*(\d{4}-\d{2})\s*$/.exec(n.subject);
            const year = /—\s*(\d{4})\s*$/.exec(n.subject);
            let from: string, to: string;
            if (dates.length >= 2) { from = dates[0]; to = dates[1]; }
            else if (dates.length === 1) { from = to = dates[0]; }
            else if (month) { from = `${month[1]}-01`; to = new Date(Date.UTC(+month[1].slice(0,4), +month[1].slice(5,7), 0)).toISOString().slice(0,10); }
            else if (year) { from = `${year[1]}-01-01`; to = `${year[1]}-12-31`; }
            else { from = to = new Date().toISOString().slice(0, 10); }
            const xlsx = await buildRangeExcel(c, n.tenant_id, from, to);
            attachments = [{ filename: `operations-${from}${from === to ? "" : `_to_${to}`}.xlsx`, content: xlsx.toString("base64") }];
          } catch (e) {
            console.error("[sweep] daily excel failed:", (e as Error).message);
          }
        }
        const r = await sendViaProvider({ to: n.to_email, subject: n.subject, text: n.body_text, html: n.body_html, attachments });
        if (r.ok) {
          await c.query(`update outbound_notifications set status='sent', provider_id=$2, sent_at=now() where id=$1`, [n.id, r.id ?? null]);
          out.dispatched++;
        } else {
          await c.query(`update outbound_notifications set status=$2, error=$3 where id=$1`,
            [n.id, r.bounce ? "bounced" : "failed", r.error ?? "send failed"]);
          if (r.bounce && n.customer_id) {
            await c.query(`update customers set email_bounced_at = now() where id=$1 and tenant_id=$2`, [n.customer_id, n.tenant_id]);
          }
          out.bounced++;
        }
      } catch (e) {
        await c.query(`update outbound_notifications set status='failed', error=$2 where id=$1`, [n.id, (e as Error).message]);
      }
    }
    return out;
  } finally {
    c.release();
  }
}

// Manual re-send: append a NEW row (content log stays immutable) and dispatch on
// the next sweep.
export async function resendNotification(pool: Pool, tenantId: string, id: string): Promise<void> {
  await pool.query(
    `insert into outbound_notifications
       (tenant_id, kind, customer_id, branch_id, job_id, contract_id, to_email, subject, body_text, attachment_ref, resend_of, status)
     select tenant_id, kind, customer_id, branch_id, job_id, contract_id, to_email, subject, body_text, attachment_ref, id, 'queued'
       from outbound_notifications where id = $2 and tenant_id = $1`, [tenantId, id]);
}
