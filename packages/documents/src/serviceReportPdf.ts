import { jsPDF } from "jspdf";
import {
  PW, M, CW, NAVY, INK, LABEL, HAIR, BODY_TOP, BODY_BOTTOM,
  type Asset, type DocOrg, type BrandSkin,
  pngSize, flowLines, stampAllPages,
} from "./brandChrome";

// Office-copy Service Report (ops-console) — the full two-page structure from
// the AlMumtaz_ServiceReport_v2 gap analysis (Part 5, item 21). Branding comes
// from the shared brandChrome (Art. XVIII). STRICTLY OMIT-EMPTY: any field with
// no data is not rendered — a labelled blank never prints.
export { pngSize };
export type { Asset, DocOrg };

export interface ServiceReportPdfData {
  reportNumber: string;
  date: string;
  timeIn: string | null;
  timeOut: string | null;
  jobRef: string;
  contractNumber: string | null;
  visitSeq: number | null;
  visitTotal: number | null;
  divisionName: string;
  customer: {
    trade_name: string | null; legal_name: string | null; alias: string | null;
    account_number: string | null; trn: string | null;
    branch_name: string | null; address: string | null;
    contact_name: string | null; contact_phone: string | null;
  };
  team: { name: string; code: string | null }[];
  premisesType: string | null;
  chemicals: { product: string; batch_no: string | null; quantity: number; unit: string | null; dilution: string | null }[];
  findings: { area: string; issue: string | null; infestation: string | null; hygiene: number | null; structural: number | null; notes: string | null }[];
  trend: { visit_label: string; date: string | null; infestation: number | null; hygiene: number | null; structural: number | null }[];
  mostFlaggedIssue: string | null;
  notes: string;
  signatureCustomer: Asset | null;   // PNG from the device, via R2
  signatureCustomerCaptured: boolean;   // a signature exists even if unrenderable
  signatureTechnician: Asset | null;
  signatureTechnicianCaptured: boolean;
  verifyUrl: string | null;
  brand: BrandSkin;
  org: DocOrg;
  logo: Asset | null;
  tollFree: Asset | null;
}

const BOILERPLATE = {
  postTreatment:
    "Vacate premises for min. 2–5 hrs after spray/fogging. Keep children & pets away. Open windows after re-entry.",
  municipality:
    "This service complies with Dubai & Sharjah Municipality regulations and approved chemical usage guidelines.",
  guarantee:
    "Guarantee is void if this record is misplaced or tampered with. Complaint must be raised within one month.",
};

export function renderServiceReportPdf(d: ServiceReportPdfData): Uint8Array {
  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });
  const accent = d.brand.accent;
  let y = BODY_TOP;

  const ensure = (need: number) => { if (y + need > BODY_BOTTOM) { doc.addPage(); y = BODY_TOP; } };
  const heading = (text: string) => {
    ensure(26);
    doc.setFont("times", "bold"); doc.setFontSize(10.5); doc.setTextColor(accent);
    doc.text(text.toUpperCase(), M, y);
    doc.setDrawColor(HAIR); doc.setLineWidth(0.5); doc.line(M, y + 4, PW - M, y + 4);
    y += 17;
  };
  const label = (t: string, x: number, yy: number) => {
    doc.setFont("helvetica", "bold"); doc.setFontSize(6.3); doc.setTextColor(LABEL); doc.setCharSpace(0.4);
    doc.text(t.toUpperCase(), x, yy); doc.setCharSpace(0);
  };
  const value = (t: string, x: number, yy: number, size = 10) => {
    doc.setFont("helvetica", "normal"); doc.setFontSize(size); doc.setTextColor(INK);
    doc.text(t, x, yy);
  };

  // ── Title bar ──────────────────────────────────────────────────────────
  doc.setFillColor(accent); doc.rect(M, y, CW, 30, "F");
  doc.setFont("times", "bold"); doc.setFontSize(14); doc.setTextColor("#FFFFFF");
  doc.text("SERVICE REPORT", M + 12, y + 20);
  doc.setFont("helvetica", "bold"); doc.setFontSize(10);
  doc.text(d.reportNumber, PW - M - 12, y + 20, { align: "right" });
  y += 44;

  // ── Customer identity ──────────────────────────────────────────────────
  const cu = d.customer;
  const nameLine = cu.trade_name ?? cu.legal_name ?? "—";
  const secondary = cu.legal_name && cu.trade_name && cu.legal_name.trim().toLowerCase() !== cu.trade_name.trim().toLowerCase() ? cu.legal_name : null;
  doc.setDrawColor(accent); doc.setLineWidth(2); doc.line(M, y - 4, M, y + 40);
  doc.setFont("times", "bold"); doc.setFontSize(13); doc.setTextColor(INK);
  doc.text(nameLine + (cu.alias ? `  ·  ${cu.alias}` : ""), M + 10, y + 8);
  let idy = y + 21;
  if (secondary) { doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(LABEL); doc.text(secondary, M + 10, idy); idy += 12; }
  const idBits = [
    cu.branch_name, cu.address,
    cu.trn ? `TRN ${cu.trn}` : null,
    cu.contact_name ? `Contact: ${cu.contact_name}${cu.contact_phone ? ` · ${cu.contact_phone}` : ""}` : null,
  ].filter(Boolean).join("   ·   ");
  if (idBits) { doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(INK); doc.text(doc.splitTextToSize(idBits, CW - 130) as string[], M + 10, idy); }
  if (cu.account_number) {
    label("Account no.", PW - M - 90, y + 2);
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(INK);
    doc.text(cu.account_number, PW - M - 90, y + 15);
  }
  y += 52;

  // ── Meta grid (omit-empty cells collapse) ──────────────────────────────
  const meta: [string, string][] = [];
  meta.push(["Date", d.date || "—"]);
  if (d.timeIn || d.timeOut) meta.push(["Time in / out", `${d.timeIn ?? "—"} — ${d.timeOut ?? "—"}`]);
  meta.push(["Job reference", d.jobRef]);
  if (d.contractNumber) meta.push(["Contract no.", d.contractNumber]);
  if (d.visitSeq != null && d.visitTotal) meta.push(["Visit", `${d.visitSeq} of ${d.visitTotal}`]);
  meta.push(["Division", d.divisionName]);
  if (d.premisesType) meta.push(["Premises type", d.premisesType]);
  if (d.team.length) meta.push(["Team", d.team.map((t) => t.code ? `${t.name} (${t.code})` : t.name).join(", ")]);
  const colW = CW / 3;
  meta.forEach((mrow, i) => {
    const x = M + (i % 3) * colW;
    if (i % 3 === 0) { ensure(32); }
    label(mrow[0], x, y);
    const v = doc.splitTextToSize(mrow[1], colW - 12) as string[];
    value(v[0] ?? "—", x, y + 12, 9.5);
    if (i % 3 === 2 || i === meta.length - 1) y += 30;
  });
  y += 4;

  // ── Treatment: chemicals with batch + dosage + dilution ────────────────
  if (d.chemicals.length) {
    heading("Chemicals used");
    const cols = [M, M + 190, M + 300, M + 390];
    doc.setFillColor(NAVY); doc.rect(M, y, CW, 18, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor("#FFFFFF");
    doc.text("PRODUCT", cols[0] + 6, y + 12); doc.text("BATCH", cols[1], y + 12);
    doc.text("QUANTITY", cols[2], y + 12); doc.text("DILUTION", cols[3], y + 12);
    y += 18;
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(INK);
    for (const c of d.chemicals) {
      ensure(16);
      doc.text(c.product, cols[0] + 6, y + 12);
      doc.text(c.batch_no ?? "—", cols[1], y + 12);
      doc.text(`${c.quantity} ${c.unit ?? ""}`.trim(), cols[2], y + 12);
      doc.text(c.dilution ?? "—", cols[3], y + 12);
      doc.setDrawColor(HAIR); doc.setLineWidth(0.5); doc.line(M, y + 16, PW - M, y + 16);
      y += 16;
    }
    y += 10;
  }

  // ── Findings per area ──────────────────────────────────────────────────
  if (d.findings.length) {
    heading("Inspection findings");
    const cols = [M, M + 110, M + 210, M + 310, M + 375, M + 440];
    doc.setFillColor(NAVY); doc.rect(M, y, CW, 18, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor("#FFFFFF");
    ["AREA", "ISSUE", "INFESTATION", "HYGIENE", "STRUCTURAL", "NOTES"].forEach((t, i) => doc.text(t, cols[i] + (i === 0 ? 6 : 0), y + 12));
    y += 18;
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(INK);
    for (const f of d.findings) {
      ensure(16);
      doc.text(f.area, cols[0] + 6, y + 12);
      doc.text(f.issue ?? "—", cols[1], y + 12);
      doc.text(f.infestation ?? "—", cols[2], y + 12);
      doc.text(f.hygiene != null ? `${f.hygiene}/5` : "—", cols[3], y + 12);
      doc.text(f.structural != null ? `${f.structural}/5` : "—", cols[4], y + 12);
      const noteLines = doc.splitTextToSize(f.notes ?? "", CW - (cols[5] - M)) as string[];
      if (noteLines[0]) doc.text(noteLines[0], cols[5], y + 12);
      doc.setDrawColor(HAIR); doc.setLineWidth(0.5); doc.line(M, y + 16, PW - M, y + 16);
      y += 16;
    }
    y += 10;
  }

  // ── Notes ──────────────────────────────────────────────────────────────
  if (d.notes.trim()) {
    heading("Service notes");
    doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(INK);
    const lines = doc.splitTextToSize(d.notes, CW) as string[];
    y = flowLines(doc, lines, M, y + 10, 13) + 8;
  }

  // ── Page 2: trend + regulatory + signatures ────────────────────────────
  doc.addPage(); y = BODY_TOP;

  heading("Visit trend");
  if (d.trend.length >= 2) {
    // grouped bars per visit: infestation (accent), hygiene (navy), structural (grey)
    const groupW = Math.min(110, CW / d.trend.length);
    const barW = 18, chartH = 90, base = y + chartH + 14;
    d.trend.forEach((t, i) => {
      const gx = M + i * groupW + 14;
      const bars: [number | null, string][] = [[t.infestation, accent], [t.hygiene, NAVY], [t.structural, "#9A9A9A"]];
      bars.forEach(([v, color], bi) => {
        if (v == null) return;
        const h = Math.max(4, (Math.min(v, 5) / 5) * chartH);
        doc.setFillColor(color as string);
        doc.rect(gx + bi * (barW + 3), base - h, barW, h, "F");
      });
      doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(LABEL);
      doc.text(t.visit_label + (t.date ? ` · ${t.date.slice(5)}` : ""), gx, base + 12);
    });
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(LABEL);
    doc.text("infestation", M, base + 26); doc.setFillColor(accent); doc.rect(M + 42, base + 20, 8, 8, "F");
    doc.text("hygiene", M + 70, base + 26); doc.setFillColor(NAVY); doc.rect(M + 102, base + 20, 8, 8, "F");
    doc.text("structural", M + 130, base + 26); doc.setFillColor("#9A9A9A"); doc.rect(M + 168, base + 20, 8, 8, "F");
    y = base + 40;
    if (d.mostFlaggedIssue) {
      doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(INK);
      doc.text(`Most-flagged issue across recent visits: ${d.mostFlaggedIssue}`, M, y); y += 18;
    }
  } else {
    doc.setFont("helvetica", "italic"); doc.setFontSize(9.5); doc.setTextColor(LABEL);
    doc.text("Baseline assessment — trends build from the next visits.", M, y + 8); y += 26;
  }

  heading("Regulatory & compliance");
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(INK);
  for (const [lab, text] of [["Post-treatment instructions", BOILERPLATE.postTreatment],
                             ["Municipality compliance", BOILERPLATE.municipality],
                             ["Guarantee", BOILERPLATE.guarantee]] as const) {
    ensure(30);
    doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(NAVY); doc.text(lab, M, y + 10);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(INK);
    const ls = doc.splitTextToSize(text, CW - 170) as string[];
    doc.text(ls, M + 160, y + 10);
    y += Math.max(18, ls.length * 11 + 8);
  }
  y += 8;

  // ── Signatures — RENDERED, with role labels ────────────────────────────
  heading("Confirmation & signatures");
  ensure(100);
  const sigW = (CW - 24) / 3;
  const sigBox = (x: number, lab: string, img: Asset | null, fallback: string | null) => {
    doc.setDrawColor(HAIR); doc.setLineWidth(0.6); doc.rect(x, y, sigW, 62);
    label(lab, x + 6, y + 11);
    if (img) {
      const h = 38; const w = Math.min((img.w / img.h) * h, sigW - 12);
      try { doc.addImage(img.dataUrl, "PNG", x + 6, y + 17, w, h); } catch { /* omit */ }
    } else if (fallback) {
      doc.setFont("helvetica", "italic"); doc.setFontSize(7.5); doc.setTextColor(LABEL);
      doc.text(fallback, x + 6, y + 40);
    }
  };
  sigBox(M, "Customer representative", d.signatureCustomer,
    d.signatureCustomerCaptured && !d.signatureCustomer ? "signed on device — image unavailable" : null);
  sigBox(M + sigW + 12, "Technician / Supervisor", d.signatureTechnician,
    d.signatureTechnicianCaptured && !d.signatureTechnician ? "signed on device — image unavailable" : null);
  // stamp / QR cell
  doc.setDrawColor(HAIR); doc.setLineWidth(0.6); doc.rect(M + (sigW + 12) * 2, y, sigW, 62);
  label("Company stamp / verification", M + (sigW + 12) * 2 + 6, y + 11);
  if (d.verifyUrl) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(LABEL);
    doc.text(doc.splitTextToSize(d.verifyUrl, sigW - 12) as string[], M + (sigW + 12) * 2 + 6, y + 30);
  }
  y += 74;

  // ── Chrome on every page ───────────────────────────────────────────────
  stampAllPages(doc, d.brand, d.org, d.logo, d.tollFree);

  return new Uint8Array(doc.output("arraybuffer"));
}
