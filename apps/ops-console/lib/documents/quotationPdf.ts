import { jsPDF } from "jspdf";
import { pngSize, type Asset } from "./serviceReportPdf";

// Division-aware Quotation PDF (Art. XVIII data, not code): the header logo + name
// come from the resolved document brand for the estimate's division. Pure
// function (no DB, no DOM) — the route resolves the brand + assets; a script can
// reuse it for samples. Mirrors the service-report renderer's visual DNA.
export { pngSize };
export type { Asset };

const MAROON = "#A31E22";
const NAVY = "#1C2540";
const GOLD = "#BF9F60";
const INK = "#1A1A1A";
const LABEL = "#8C8C8C";
const HAIR = "#E4E1DC";

const PW = 595.28;
const PH = 841.89;
const M = 42;
const CW = PW - M * 2;

export interface QuotationPdfData {
  quotationNumber: string;
  date: string;
  validUntil: string;
  customer: string;
  customerTrn: string;
  divisionName: string;
  currency: string;
  lines: { description: string; amount: number }[];
  subtotal: number;
  vatRate: number;
  vat: number;
  total: number;
  brand: { name: string; tagline: string | null; showTollFree: boolean };
  logo: Asset | null;
  tollFree: Asset | null;
}

const money = (n: number, ccy: string) => `${ccy} ${(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function renderQuotationPdf(d: QuotationPdfData): Uint8Array {
  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });
  let y = M;

  // Header: division logo + name
  if (d.logo) {
    const targetH = 40;
    const w = (d.logo.w / d.logo.h) * targetH;
    doc.addImage(d.logo.dataUrl, "PNG", M, y, Math.min(w, 220), targetH, undefined, "FAST");
  } else {
    doc.setFont("times", "bold"); doc.setFontSize(22); doc.setTextColor(MAROON);
    doc.text(d.brand.name, M, y + 26);
  }
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(LABEL);
  doc.text(d.brand.name.toUpperCase(), PW - M, y + 12, { align: "right" });
  if (d.brand.tagline) doc.text(d.brand.tagline, PW - M, y + 24, { align: "right" });
  y += 54;
  doc.setDrawColor(GOLD); doc.setLineWidth(1.5); doc.line(M, y, PW - M, y);
  y += 22;

  // Title bar
  doc.setFillColor(MAROON); doc.rect(M, y, CW, 30, "F");
  doc.setFont("times", "bold"); doc.setFontSize(14); doc.setTextColor("#FFFFFF");
  doc.text("QUOTATION", M + 12, y + 20);
  doc.setFont("helvetica", "bold"); doc.setFontSize(10);
  doc.text(d.quotationNumber, PW - M - 12, y + 20, { align: "right" });
  y += 48;

  // Meta grid
  const rows: [string, string][] = [
    ["Customer", d.customer], ["Division", d.divisionName],
    ["Customer TRN", d.customerTrn], ["Date", d.date],
    ["Valid until", d.validUntil], ["Quotation no.", d.quotationNumber],
  ];
  const colW = CW / 2;
  const cell = (label: string, value: string, x: number, yy: number) => {
    doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); doc.setTextColor(LABEL); doc.setCharSpace(0.4);
    doc.text(label.toUpperCase(), x, yy); doc.setCharSpace(0);
    doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(INK);
    doc.text(value || "—", x, yy + 14);
  };
  for (let i = 0; i < rows.length; i += 2) {
    cell(rows[i][0], rows[i][1], M, y);
    if (rows[i + 1]) cell(rows[i + 1][0], rows[i + 1][1], M + colW, y);
    y += 34;
  }
  y += 4;

  // Line-items table
  const amtX = PW - M;
  doc.setFillColor(NAVY); doc.rect(M, y, CW, 22, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor("#FFFFFF"); doc.setCharSpace(0.3);
  doc.text("DESCRIPTION", M + 10, y + 15);
  doc.text("AMOUNT", amtX - 10, y + 15, { align: "right" });
  doc.setCharSpace(0);
  y += 22;
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(INK);
  const bodyLines = d.lines.length ? d.lines : [{ description: "(no lines)", amount: 0 }];
  for (const l of bodyLines) {
    const desc = doc.splitTextToSize(l.description || "Service", CW - 130);
    const rowH = Math.max(20, desc.length * 12 + 8);
    doc.text(desc, M + 10, y + 14);
    doc.text(money(l.amount, d.currency), amtX - 10, y + 14, { align: "right" });
    doc.setDrawColor(HAIR); doc.setLineWidth(0.5); doc.line(M, y + rowH, PW - M, y + rowH);
    y += rowH;
    if (y > PH - 200) { doc.addPage(); y = M; }
  }
  y += 12;

  // Totals block (right-aligned)
  const tx = PW - M - 200;
  const tot = (label: string, value: string, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(bold ? 12 : 10);
    doc.setTextColor(bold ? MAROON : INK);
    doc.text(label, tx, y);
    doc.text(value, amtX, y, { align: "right" });
    y += bold ? 20 : 16;
  };
  tot("Subtotal", money(d.subtotal, d.currency));
  tot(`VAT (${d.vatRate}%)`, money(d.vat, d.currency));
  doc.setDrawColor(GOLD); doc.setLineWidth(1); doc.line(tx, y - 4, amtX, y - 4); y += 8;
  tot("Total", money(d.total, d.currency), true);

  // Footer
  let fy = PH - M - 44;
  doc.setDrawColor(GOLD); doc.setLineWidth(1); doc.line(M, fy, PW - M, fy); fy += 14;
  doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(LABEL);
  doc.text(`${d.brand.name} · This quotation is valid until ${d.validUntil || "the date stated above"}. Prices in ${d.currency}, VAT as shown.`, M, fy);
  if (d.brand.showTollFree && d.tollFree) {
    const th = 26;
    const tw = (d.tollFree.w / d.tollFree.h) * th;
    doc.addImage(d.tollFree.dataUrl, "PNG", PW - M - Math.min(tw, 150), fy + 6, Math.min(tw, 150), th, undefined, "FAST");
  }

  return new Uint8Array(doc.output("arraybuffer"));
}
