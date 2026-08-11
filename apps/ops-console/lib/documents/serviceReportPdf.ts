import { jsPDF } from "jspdf";
import {
  PW, M, CW, NAVY, INK, LABEL, HAIR,
  type Asset, type DocOrg, type BrandSkin,
  pngSize, drawLetterhead, drawLegalFooter,
} from "./brandChrome";

// Office-copy Service Completion Report (ops-console). Branding — the division
// letterhead (logo + label + accent) and the legal footer (legal entity + trade
// licence + offices) — comes from the shared brandChrome, so this document is
// branded identically to every other generated document (Art. XVIII: one path,
// resolved from document_branding). This function lays out only the report body.
export { pngSize };
export type { Asset, DocOrg };

export interface ServiceReportPdfData {
  reportNumber: string;
  date: string;
  customer: string;
  performer: string;
  jobRef: string;
  divisionName: string;      // service line name, e.g. "Pest Control"
  notes: string;
  brand: BrandSkin;          // resolved division skin (logo/label/accent) — brandChrome
  org: DocOrg;               // group legal block for the footer
  logo: Asset | null;        // resolved division logo
  tollFree: Asset | null;    // documents only, never in the UI
}

export function renderServiceReportPdf(d: ServiceReportPdfData): Uint8Array {
  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });
  const accent = d.brand.accent;
  let y = drawLetterhead(doc, d.brand, d.logo);

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

  // ── Legal footer (shared brandChrome) ──────────────────────────────────
  drawLegalFooter(doc, d.brand, d.org, d.tollFree);

  return new Uint8Array(doc.output("arraybuffer"));
}
