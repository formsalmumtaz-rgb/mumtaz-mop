import type { PoolClient } from "pg";
import { jsPDF } from "jspdf";
import { promises as fs } from "node:fs";
import path from "node:path";
import { pngSize, PW, M, CW } from "@mop/documents";

// Item 4 — AMC lifecycle. Two deterministic sweeps:
//  (a) expiry reminders at 90 / 30 / 10 days before contract end (internal),
//  (b) last-service closeout: when the FINAL scheduled visit of an active,
//      un-renewed contract is completed — internal reminder + the customer
//      closeout email with the branded service-summary PDF (the renewal tool).
// Idempotent per (contract, bucket) via subject convention; queue-only here,
// dispatch (with the PDF attached) happens in the normal sweep dispatch.

export async function sweepContractLifecycle(
  c: PoolClient,
  queue: (n: {
    tenantId: string; kind: string; customerId?: string | null; contractId?: string | null;
    toEmail: string | null; subject: string; body: string; serviceLineCode?: string | null;
    title?: string; card?: { heading?: string; rows: { label: string; value: string }[] }; footnote?: string | null;
  }) => Promise<void>,
): Promise<number> {
  let queued = 0;

  // (a) expiry reminders — internal (no recipient email; dashboard/notifications)
  const { rows: expiring } = await c.query(
    `select ct.tenant_id, ct.id, ct.contract_number, ct.end_date::text, cu.trade_name,
            (ct.end_date - current_date) as days_left
       from contracts ct join customers cu on cu.id = ct.customer_id
      where ct.lifecycle_status = 'active' and ct.end_date is not null
        and (ct.end_date - current_date) in (90, 30, 10)`);
  for (const e of expiring) {
    const subject = `AMC expiry in ${e.days_left} days: contract ${e.contract_number ?? e.id}`;
    const { rows: dup } = await c.query(
      `select 1 from outbound_notifications where tenant_id = $1 and kind = 'manual' and subject = $2`,
      [e.tenant_id, subject]);
    if (dup.length) continue;
    await queue({
      tenantId: e.tenant_id, kind: "manual", contractId: e.id, toEmail: null,
      subject,
      body: `Contract ${e.contract_number ?? ""} (${e.trade_name ?? ""}) expires on ${e.end_date} — ${e.days_left} days from today. Start the renewal conversation.`,
    });
    queued++;
  }

  // (b) last-service closeout: final scheduled visit completed, no renewal
  const { rows: closing } = await c.query(
    `select ct.tenant_id, ct.id, ct.contract_number, ct.end_date::text, ct.customer_id,
            cu.trade_name, cu.legal_name, sl.code as sl_code,
            (select email from contacts k where k.customer_id = cu.id and k.email is not null
              order by k.is_primary desc limit 1) as email
       from contracts ct
       join customers cu on cu.id = ct.customer_id
       left join service_lines sl on sl.id = ct.service_line_id
      where ct.lifecycle_status = 'active'
        and exists (select 1 from contract_schedule cs where cs.contract_id = ct.id)
        -- every scheduled visit is done (its job completed)
        and not exists (
          select 1 from contract_schedule cs
           where cs.contract_id = ct.id
             and not exists (select 1 from jobs j
                              where j.contract_schedule_id = cs.id and j.status = 'completed'))
        -- and no renewal exists (a later contract for the same customer)
        and not exists (
          select 1 from contracts nxt
           where nxt.customer_id = ct.customer_id and nxt.id <> ct.id
             and nxt.lifecycle_status in ('draft','active')
             and coalesce(nxt.start_date, nxt.created_at::date) >= coalesce(ct.end_date, current_date))`);
  for (const ct of closing) {
    const name = ct.trade_name ?? ct.legal_name ?? "Customer";
    // internal reminder
    const internalSubject = `LAST SERVICE done: contract ${ct.contract_number ?? ct.id} — not renewed`;
    const { rows: dupInt } = await c.query(
      `select 1 from outbound_notifications where tenant_id = $1 and kind = 'manual' and subject = $2`,
      [ct.tenant_id, internalSubject]);
    if (!dupInt.length) {
      await queue({
        tenantId: ct.tenant_id, kind: "manual", contractId: ct.id, toEmail: null,
        subject: internalSubject,
        body: `The final scheduled visit under contract ${ct.contract_number ?? ""} (${name}) is complete. The contract expires ${ct.end_date ?? "at term"} and has NOT been renewed. The closeout summary email goes to the customer automatically.`,
      });
      queued++;
    }
    // customer closeout email (PDF attached at dispatch)
    const custSubject = `Your service summary — contract ${ct.contract_number ?? ""}`.trim();
    const { rows: dupCust } = await c.query(
      `select 1 from outbound_notifications where tenant_id = $1 and kind = 'contract_closeout' and subject = $2`,
      [ct.tenant_id, custSubject]);
    if (!dupCust.length) {
      await queue({
        tenantId: ct.tenant_id, kind: "contract_closeout", customerId: ct.customer_id, contractId: ct.id,
        toEmail: ct.email, serviceLineCode: ct.sl_code,
        subject: custSubject,
        title: "Thank you for a year of trust",
        body:
`Dear ${name},

Every scheduled visit under contract ${ct.contract_number ?? ""} has now been delivered. The attached summary shows each visit and how your premises' condition developed across the year.

We would be glad to continue protecting your premises — your account manager will contact you about renewal, or call us on 800 688.`,
        footnote: "The attached summary is your service record for the full contract term.",
      });
      queued++;
    }
  }
  return queued;
}

// The closeout PDF — visits delivered + trend across the term, real division
// logo, one legal line in the footer.
export async function buildCloseoutPdf(c: PoolClient, tenantId: string, contractId: string): Promise<Buffer | null> {
  const { rows: ctRows } = await c.query(
    `select ct.contract_number, ct.start_date::text, ct.end_date::text,
            cu.trade_name, cu.legal_name, sl.code as sl_code
       from contracts ct join customers cu on cu.id = ct.customer_id
       left join service_lines sl on sl.id = ct.service_line_id
      where ct.id = $1 and ct.tenant_id = $2`, [contractId, tenantId]);
  const ct = ctRows[0];
  if (!ct) return null;
  const { rows: visits } = await c.query(
    `select j.scheduled_date::text as date,
            to_char(coalesce(j.device_started_at, j.started_at), 'HH24:MI') as time_in,
            (select string_agg(coalesce(t.full_name, t.code), ', ')
               from job_assignments ja join technicians t on t.id = ja.technician_id
              where ja.job_id = j.id) as team,
            (select sr.report_number from service_reports sr where sr.job_id = j.id
              order by sr.created_at desc limit 1) as report_no
       from jobs j
      where j.tenant_id = $2 and j.contract_id = $1 and j.status = 'completed'
      order by j.scheduled_date`, [contractId, tenantId]);
  const { rows: trend } = await c.query(
    `select j.scheduled_date::text as date,
            max(case ji.infestation_level when 'none' then 0 when 'low' then 1
                 when 'medium' then 2 when 'high' then 3 else 4 end)::int as infestation,
            round(avg(ji.hygiene_score))::int as hygiene,
            round(avg(ji.structural_score))::int as structural
       from jobs j join job_inspections ji on ji.job_id = j.id
      where j.tenant_id = $2 and j.contract_id = $1 and j.status = 'completed'
      group by j.id, j.scheduled_date order by j.scheduled_date`, [contractId, tenantId]);

  const logoFile: Record<string, string> = {
    pest_control: "mumtaz-pest-control.png", cleaning: "mumtaz-cleaning-crew.png",
    facilities_management: "mumtaz-facilities-management.png",
  };
  let logo: { dataUrl: string; w: number; h: number } | null = null;
  try {
    const buf = await fs.readFile(path.join(process.cwd(), "public", "brand", logoFile[ct.sl_code] ?? "mumtaz-isg.png"));
    const { w, h } = pngSize(buf);
    logo = { dataUrl: `data:image/png;base64,${buf.toString("base64")}`, w, h };
  } catch { /* renders with title only */ }

  const ACCENT = "#8A1E2E";
  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });
  let y = 52;
  if (logo) {
    const h = 42; const w = Math.min((logo.w / logo.h) * h, 170);
    doc.addImage(logo.dataUrl, "PNG", M, y - 22, w, h, undefined, "FAST");
  }
  doc.setFont("times", "bold"); doc.setFontSize(19); doc.setTextColor(ACCENT);
  doc.text("Contract Service Summary", PW - M, y + 4, { align: "right" });
  y += 34;
  doc.setDrawColor(ACCENT); doc.setLineWidth(1.6); doc.line(M, y, PW - M, y); y += 22;

  doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor("#1C1C1C");
  doc.text(`${ct.trade_name ?? ct.legal_name ?? ""}  ·  Contract ${ct.contract_number ?? ""}  ·  ${ct.start_date ?? ""} to ${ct.end_date ?? ""}`, M, y);
  y += 16;
  doc.setFontSize(9.5);
  doc.text(`Every scheduled visit under this contract has been delivered — ${visits.length} visits in total.`, M, y);
  y += 22;

  // visits table
  doc.setFillColor("#1C2540"); doc.rect(M, y, CW, 18, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor("#FFFFFF");
  doc.text("DATE", M + 6, y + 12); doc.text("TIME", M + 90, y + 12);
  doc.text("TEAM", M + 150, y + 12); doc.text("REPORT NO.", PW - M - 90, y + 12);
  y += 18;
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.6); doc.setTextColor("#1C1C1C");
  for (const v of visits.slice(0, 30)) {
    if (y > 700) break;
    doc.text(v.date ?? "", M + 6, y + 11);
    doc.text(v.time_in ?? "N/A", M + 90, y + 11);
    doc.text((v.team ?? "N/A").slice(0, 55), M + 150, y + 11);
    doc.text(v.report_no ?? "N/A", PW - M - 90, y + 11);
    doc.setDrawColor("#E4E1DC"); doc.setLineWidth(0.5); doc.line(M, y + 15, PW - M, y + 15);
    y += 16;
  }
  y += 18;

  // trend bars across the term
  if (trend.length >= 2 && y < 620) {
    doc.setFont("times", "bold"); doc.setFontSize(11); doc.setTextColor(ACCENT);
    doc.text("CONDITION ACROSS THE TERM", M, y); y += 12;
    const chartH = 70, base = y + chartH;
    const groupW = Math.min(46, (CW - 10) / trend.length);
    trend.forEach((t: { infestation: number | null; hygiene: number | null; structural: number | null; date: string }, i: number) => {
      const gx = M + 4 + i * groupW;
      ([[t.infestation, ACCENT], [t.hygiene, "#1C2540"], [t.structural, "#9A9A9A"]] as [number | null, string][]).forEach(([v, color], bi) => {
        if (v == null) return;
        const bh = Math.max(3, (Math.min(v, 5) / 5) * chartH);
        doc.setFillColor(color); doc.rect(gx + bi * 9, base - bh, 7, bh, "F");
      });
      doc.setFont("helvetica", "normal"); doc.setFontSize(5.6); doc.setTextColor("#8C8781");
      doc.text((t.date ?? "").slice(5), gx, base + 8);
    });
    doc.setFontSize(6.4);
    doc.text("infestation (red, lower is better) · hygiene (navy) · structural (grey), 0–5 scale", M + 4, base + 20);
    y = base + 34;
  }

  // ONE legal line
  doc.setFont("times", "normal"); doc.setFontSize(7.5); doc.setTextColor(ACCENT);
  doc.text("Al Mumtaz Bldg Clean & Pest Control, TL 546486  ·  Toll free 800 688  ·  info@almumtaz.ae", M, 812);

  return Buffer.from(doc.output("arraybuffer"));
}
