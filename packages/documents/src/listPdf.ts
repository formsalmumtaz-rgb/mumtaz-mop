import { jsPDF } from "jspdf";
import type { Asset } from "./brandChrome";

// One landscape table renderer for every console list export ("print this
// list"). Deliberately plain: the value is the data, not decoration. Columns
// carry an optional width weight; anything with no weight shares the remainder.
export interface ListPdfColumn { header: string; key: string; weight?: number; align?: "left" | "right" }

export interface ListPdfData {
  title: string;
  subtitle?: string | null;      // the active filters, stated in words
  columns: ListPdfColumn[];
  rows: Record<string, unknown>[];
  generatedAt: string;
  logo?: Asset | null;
  accent?: string;
  legalLine: string;
}

const PW = 841.89;   // A4 landscape
const PH = 595.28;
const M = 32;
const CW = PW - M * 2;

export function renderListPdf(d: ListPdfData): ArrayBuffer {
  const accent = d.accent ?? "#8A1E2E";
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape", compress: true });

  const totalWeight = d.columns.reduce((s, c) => s + (c.weight ?? 1), 0);
  const widths = d.columns.map((c) => ((c.weight ?? 1) / totalWeight) * CW);
  const xs: number[] = [];
  let acc = M;
  for (const w of widths) { xs.push(acc); acc += w; }

  const header = () => {
    let y = 40;
    if (d.logo) {
      const h = 26;
      const w = Math.min((d.logo.w / d.logo.h) * h, 130);
      doc.addImage(d.logo.dataUrl, "PNG", M, y - 18, w, h, undefined, "FAST");
    }
    doc.setFont("times", "bold"); doc.setFontSize(15); doc.setTextColor(accent);
    doc.text(d.title, PW - M, y, { align: "right" });
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor("#6B6B6B");
    doc.text(d.subtitle ? `${d.subtitle}  ·  generated ${d.generatedAt}` : `generated ${d.generatedAt}`,
      PW - M, y + 12, { align: "right" });
    y += 24;
    doc.setDrawColor(accent); doc.setLineWidth(1.2); doc.line(M, y, PW - M, y);
    y += 14;
    // column headings
    doc.setFillColor("#1C2540"); doc.rect(M, y, CW, 16, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor("#FFFFFF");
    d.columns.forEach((c, i) => {
      const x = c.align === "right" ? xs[i] + widths[i] - 4 : xs[i] + 4;
      doc.text(c.header.toUpperCase(), x, y + 11, { align: c.align === "right" ? "right" : "left" });
    });
    return y + 16;
  };

  let y = header();
  doc.setFont("helvetica", "normal"); doc.setFontSize(7.6); doc.setTextColor("#1C1C1C");

  for (const row of d.rows) {
    if (y > PH - 52) {
      doc.addPage("a4", "landscape");
      y = header();
      doc.setFont("helvetica", "normal"); doc.setFontSize(7.6); doc.setTextColor("#1C1C1C");
    }
    d.columns.forEach((c, i) => {
      const raw = row[c.key];
      const text = raw === null || raw === undefined || raw === "" ? "N/A" : String(raw);
      const fitted = (doc.splitTextToSize(text, widths[i] - 8) as string[])[0] ?? "";
      const x = c.align === "right" ? xs[i] + widths[i] - 4 : xs[i] + 4;
      doc.text(fitted, x, y + 10, { align: c.align === "right" ? "right" : "left" });
    });
    doc.setDrawColor("#E4E1DC"); doc.setLineWidth(0.4); doc.line(M, y + 14, PW - M, y + 14);
    y += 15;
  }

  if (d.rows.length === 0) {
    doc.setTextColor("#8C8781");
    doc.text("No rows match these filters.", M + 4, y + 12);
  }

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont("times", "normal"); doc.setFontSize(7); doc.setTextColor(accent);
    doc.text(d.legalLine, M, PH - 18);
    doc.setTextColor("#8C8781");
    doc.text(`${d.rows.length} row(s)  ·  page ${p} of ${pages}`, PW - M, PH - 18, { align: "right" });
  }

  return doc.output("arraybuffer");
}
