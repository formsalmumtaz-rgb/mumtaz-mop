import { jsPDF } from "jspdf";
import {
  PW, M, CW, NAVY, INK, HAIR, LABEL, BODY_TOP, BODY_BOTTOM,
  type Asset, type DocOrg, type BrandSkin,
  pngSize, stampAllPages,
} from "./brandChrome";

// Division-aware Quotation PDF. Branding — the division letterhead (logo + label +
// accent) and the legal footer (legal entity + trade licence + offices) — comes
// from the SHARED brandChrome, exactly like the service report and every other
// generated document (Art. XVIII: one branding path, resolved from
// document_branding). This function lays out only the quotation body.
export { pngSize };
export type { Asset, DocOrg };

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
  brand: BrandSkin;          // resolved division skin — brandChrome
  org: DocOrg;               // group legal block for the footer
  logo: Asset | null;
  tollFree: Asset | null;
}

const money = (n: number, ccy: string) => `${ccy} ${(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function renderQuotationPdf(d: QuotationPdfData): Uint8Array {
  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });
  const accent = d.brand.accent;
  let y = BODY_TOP;

  // Title bar
  doc.setFillColor(accent); doc.rect(M, y, CW, 30, "F");
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

  // Line-items table — header repeats on each page; rows break before the footer.
  const amtX = PW - M;
  const tableHead = (yy: number): number => {
    doc.setFillColor(NAVY); doc.rect(M, yy, CW, 22, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor("#FFFFFF"); doc.setCharSpace(0.3);
    doc.text("DESCRIPTION", M + 10, yy + 15);
    doc.text("AMOUNT", amtX - 10, yy + 15, { align: "right" });
    doc.setCharSpace(0);
    return yy + 22;
  };
  const bodyFont = () => { doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(INK); };
  y = tableHead(y);
  bodyFont();
  const bodyLines = d.lines.length ? d.lines : [{ description: "(no lines)", amount: 0 }];
  for (const l of bodyLines) {
    const desc = doc.splitTextToSize(l.description || "Service", CW - 130);
    const rowH = Math.max(20, desc.length * 12 + 8);
    if (y + rowH > BODY_BOTTOM) { doc.addPage(); y = tableHead(BODY_TOP); bodyFont(); }
    doc.text(desc, M + 10, y + 14);
    doc.text(money(l.amount, d.currency), amtX - 10, y + 14, { align: "right" });
    doc.setDrawColor(HAIR); doc.setLineWidth(0.5); doc.line(M, y + rowH, PW - M, y + rowH);
    y += rowH;
  }
  y += 12;

  // Keep the totals block together, off the footer.
  if (y + 72 > BODY_BOTTOM) { doc.addPage(); y = BODY_TOP; }

  // Totals block (right-aligned) — accent for the emphasis + divider.
  const tx = PW - M - 200;
  const tot = (label: string, value: string, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(bold ? 12 : 10);
    doc.setTextColor(bold ? accent : INK);
    doc.text(label, tx, y);
    doc.text(value, amtX, y, { align: "right" });
    y += bold ? 20 : 16;
  };
  tot("Subtotal", money(d.subtotal, d.currency));
  tot(`VAT (${d.vatRate}%)`, money(d.vat, d.currency));
  doc.setDrawColor(accent); doc.setLineWidth(1); doc.line(tx, y - 4, amtX, y - 4); y += 8;
  tot("Total", money(d.total, d.currency), true);

  // Chrome on every page (letterhead + legal footer) — shared brandChrome.
  stampAllPages(doc, d.brand, d.org, d.logo, d.tollFree);

  return new Uint8Array(doc.output("arraybuffer"));
}
