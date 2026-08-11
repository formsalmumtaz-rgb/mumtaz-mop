import { jsPDF } from "jspdf";

// Office-copy Service Completion Report (ops-console). Division-aware: the header
// logo + name come from the resolved document brand (Art. XVIII data, not code),
// so a pest-control report carries the Pest Control mark, cleaning the Cleaning
// Crew mark, and so on. Pure function (no DB, no DOM) — the route resolves the
// brand and loads assets, then calls this; a script can reuse it for samples.

const MAROON = "#A31E22";
const NAVY = "#1C2540";
const INK = "#1A1A1A";
const LABEL = "#8C8C8C";
const HAIR = "#E4E1DC";

const PW = 595.28; // A4 pt
const PH = 841.89;
const M = 42;
const CW = PW - M * 2;

export interface Asset { dataUrl: string; w: number; h: number }
export interface DocOrg {
  legal_name: string;
  group_line: string | null;
  established: string | null;
  trade_licence: string | null;
  offices: { city: string; line1: string | null; line2: string | null }[];
}
export interface ServiceReportPdfData {
  reportNumber: string;
  date: string;
  customer: string;
  performer: string;
  jobRef: string;
  divisionName: string;      // service line name, e.g. "Pest Control"
  notes: string;
  brand: { name: string; label: string | null; tagline: string | null; accent: string; showTollFree: boolean };
  org: DocOrg;               // group legal block for the footer (mig 052)
  logo: Asset | null;        // resolved division logo
  tollFree: Asset | null;    // documents only, never in the UI
}

// Minimal PNG dimension reader (IHDR width/height, big-endian) for aspect ratio.
export function pngSize(buf: Uint8Array): { w: number; h: number } {
  const w = (buf[16] << 24) | (buf[17] << 16) | (buf[18] << 8) | buf[19];
  const h = (buf[20] << 24) | (buf[21] << 16) | (buf[22] << 8) | buf[23];
  return { w: w || 1, h: h || 1 };
}

export function renderServiceReportPdf(d: ServiceReportPdfData): Uint8Array {
  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });
  const accent = d.brand.accent || MAROON; // division skin (mig 052); falls back to Mumtaz red
  let y = M;

  // ── Header: division logo + name + label ───────────────────────────────
  if (d.logo) {
    const targetH = 40;
    const w = (d.logo.w / d.logo.h) * targetH;
    doc.addImage(d.logo.dataUrl, "PNG", M, y, Math.min(w, 220), targetH, undefined, "FAST");
  } else {
    doc.setFont("times", "bold"); doc.setFontSize(22); doc.setTextColor(accent);
    doc.text(d.brand.name, M, y + 26);
  }
  if (d.brand.label) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(accent); doc.setCharSpace(1.2);
    doc.text(d.brand.label.toUpperCase(), M, y + 50); doc.setCharSpace(0);
  }
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(LABEL);
  doc.text(d.brand.name.toUpperCase(), PW - M, y + 12, { align: "right" });
  if (d.brand.tagline) doc.text(d.brand.tagline, PW - M, y + 24, { align: "right" });
  y += 60;
  // Accent rule + hairline under it (matches the reference letterhead).
  doc.setDrawColor(accent); doc.setLineWidth(2); doc.line(M, y, PW - M, y);
  doc.setDrawColor(HAIR); doc.setLineWidth(0.5); doc.line(M, y + 3, PW - M, y + 3);
  y += 22;

  // ── Title bar ──────────────────────────────────────────────────────────
  doc.setFillColor(accent); doc.rect(M, y, CW, 30, "F");
  doc.setFont("times", "bold"); doc.setFontSize(14); doc.setTextColor("#FFFFFF");
  doc.text("SERVICE COMPLETION REPORT", M + 12, y + 20);
  doc.setFont("helvetica", "bold"); doc.setFontSize(10);
  doc.text(d.reportNumber, PW - M - 12, y + 20, { align: "right" });
  y += 48;

  // ── Meta grid ──────────────────────────────────────────────────────────
  const rows: [string, string][] = [
    ["Customer", d.customer], ["Division", d.divisionName],
    ["Performed by", d.performer], ["Date", d.date],
    ["Job reference", d.jobRef], ["Report number", d.reportNumber],
  ];
  const colW = CW / 2;
  const cell = (label: string, value: string, x: number, yy: number) => {
    doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); doc.setTextColor(LABEL); doc.setCharSpace(0.4);
    doc.text(label.toUpperCase(), x, yy);
    doc.setCharSpace(0);
    doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(INK);
    doc.text(value || "—", x, yy + 14);
  };
  for (let i = 0; i < rows.length; i += 2) {
    cell(rows[i][0], rows[i][1], M, y);
    if (rows[i + 1]) cell(rows[i + 1][0], rows[i + 1][1], M + colW, y);
    y += 34;
  }

  // ── Notes ──────────────────────────────────────────────────────────────
  y += 6;
  doc.setDrawColor(HAIR); doc.setLineWidth(0.5); doc.line(M, y, PW - M, y); y += 18;
  doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(NAVY); doc.setCharSpace(0.4);
  doc.text("SERVICE NOTES", M, y); doc.setCharSpace(0); y += 16;
  doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(INK);
  const lines = doc.splitTextToSize(d.notes || "—", CW);
  doc.text(lines, M, y);

  // ── Footer: legal entity + trade licence + offices (mig 052) ───────────
  // Every customer-/municipality-facing document must carry the legal entity
  // name and licence. All values are reference data (resolveDocumentBrandOrg),
  // never hardcoded here.
  const offices = d.org.offices.slice(0, 3);
  let fy = PH - M - 62;
  if (d.brand.showTollFree && d.tollFree) {
    const th = 20;
    const tw = (d.tollFree.w / d.tollFree.h) * th;
    doc.addImage(d.tollFree.dataUrl, "PNG", PW - M - Math.min(tw, 120), fy - 16, Math.min(tw, 120), th, undefined, "FAST");
  }
  doc.setDrawColor(HAIR); doc.setLineWidth(0.5); doc.line(M, fy, PW - M, fy); fy += 12;
  doc.setFont("times", "normal"); doc.setFontSize(8.5); doc.setTextColor(accent);
  const legal = [d.org.legal_name, d.org.group_line,
                 d.org.established ? `Est. ${d.org.established}` : null,
                 d.org.trade_licence ? `Trade Licence ${d.org.trade_licence}` : null]
                .filter(Boolean).join("    ·    ");
  doc.text(legal, M, fy); fy += 13;
  const ow = CW / Math.max(offices.length, 1);
  offices.forEach((o, i) => {
    const x = M + i * ow;
    doc.setFont("helvetica", "bold"); doc.setFontSize(6.2); doc.setTextColor(accent); doc.setCharSpace(0.6);
    doc.text(o.city.toUpperCase(), x, fy); doc.setCharSpace(0);
    doc.setFont("helvetica", "normal"); doc.setFontSize(6.6); doc.setTextColor(LABEL);
    if (o.line1) doc.text(o.line1, x, fy + 9);
    if (o.line2) doc.text(o.line2, x, fy + 17);
  });

  const out = doc.output("arraybuffer");
  return new Uint8Array(out);
}
