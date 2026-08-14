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
//
// P0-4: rebuilt to match the docs/reference Mumtaz quotation sample — an
// introduction paragraph, scope of work in prose, a numbered line table, amount
// in words, terms and conditions, and signatory blocks. Content that isn't
// company boilerplate (customer, lines, totals) comes from the estimate; content
// that IS boilerplate (intro/scope/terms/signatory) is configured per service
// line (mig 079) and simply omitted — never invented — where no source exists.
export { pngSize };
export type { Asset, DocOrg };

export interface QuotationPdfData {
  quotationNumber: string;
  date: string;
  validUntil: string;
  customer: string;
  customerTrn: string;
  customerAddressLines: string[];
  accountNumber: string | null;
  divisionName: string;
  currency: string;
  salutation: string | null;
  introParagraph: string | null;
  scopeItems: string[];
  lines: { description: string; qty: number; rate: number; amount: number }[];
  subtotal: number;
  vatRate: number;
  vat: number;
  total: number;
  terms: string[];
  signatoryName: string | null;
  signatoryTitle: string | null;
  brand: BrandSkin;          // resolved division skin — brandChrome
  org: DocOrg;               // group legal block for the footer
  logo: Asset | null;
  tollFree: Asset | null;
}

const money = (n: number, ccy: string) => `${ccy} ${(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function threeDigitsToWords(n: number): string {
  let s = "";
  if (n >= 100) { s += ONES[Math.floor(n / 100)] + " Hundred"; n %= 100; if (n) s += " "; }
  if (n >= 20) { s += TENS[Math.floor(n / 10)]; if (n % 10) s += "-" + ONES[n % 10]; }
  else if (n > 0) { s += ONES[n]; }
  return s;
}

function integerToWords(n: number): string {
  if (n === 0) return "Zero";
  const groups: [number, string][] = [[1_000_000_000, "Billion"], [1_000_000, "Million"], [1_000, "Thousand"], [1, ""]];
  let rem = n;
  const parts: string[] = [];
  for (const [scale, label] of groups) {
    const chunk = Math.floor(rem / scale);
    if (chunk > 0) { parts.push(threeDigitsToWords(chunk) + (label ? " " + label : "")); rem %= scale; }
  }
  return parts.join(" ");
}

// UAE-standard "amount in words" footer: "Dirhams <whole> and Fils <NN> Only".
export function amountInWords(total: number, currency: string): string {
  const whole = Math.floor(total + 1e-6);
  const fils = Math.round((total - whole) * 100);
  const ccyWords = currency === "AED" ? "Dirhams" : currency;
  let out = `${ccyWords} ${integerToWords(whole)}`;
  if (fils > 0) out += ` and Fils ${integerToWords(fils)}`;
  return out + " Only";
}

export function renderQuotationPdf(d: QuotationPdfData): Uint8Array {
  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });
  const accent = d.brand.accent;
  let y = BODY_TOP;

  const ensureRoom = (need: number) => { if (y + need > BODY_BOTTOM) { doc.addPage(); y = BODY_TOP; } };
  const wrap = (text: string, width: number, fontSize: number, lineHeight: number, x = M) => {
    doc.setFontSize(fontSize);
    const ls = doc.splitTextToSize(text, width) as string[];
    for (const ln of ls) { ensureRoom(lineHeight); doc.text(ln, x, y); y += lineHeight; }
  };
  const heading = (text: string) => {
    ensureRoom(24);
    doc.setFont("times", "bold"); doc.setFontSize(11); doc.setTextColor(accent);
    doc.text(text.toUpperCase(), M, y);
    doc.setDrawColor(HAIR); doc.setLineWidth(0.5); doc.line(M, y + 4, PW - M, y + 4);
    y += 18;
  };

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
    ["Customer TRN", d.customerTrn || "—"], ["Date", d.date],
    ["Valid until", d.validUntil], ["Account no.", d.accountNumber ?? "—"],
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
  if (d.customerAddressLines.length) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(INK);
    doc.text(d.customerAddressLines.join(", "), M, y);
    y += 16;
  }
  y += 6;

  // Salutation + introduction
  if (d.salutation) { doc.setFont("helvetica", "normal"); doc.setTextColor(INK); wrap(d.salutation, CW, 10, 14); y += 4; }
  if (d.introParagraph) { wrap(d.introParagraph, CW, 10, 14); y += 8; }

  // Scope of work — omitted entirely if no source content configured for this division.
  if (d.scopeItems.length) {
    heading("Scope of Work");
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(INK);
    for (const item of d.scopeItems) {
      ensureRoom(14);
      doc.setTextColor(accent); doc.text("•", M, y); doc.setTextColor(INK);
      const ls = doc.splitTextToSize(item, CW - 14) as string[];
      ls.forEach((ln, i) => { if (i > 0) ensureRoom(13); doc.text(ln, M + 12, y); if (i < ls.length - 1) y += 13; });
      y += 14;
    }
    y += 4;
  }

  // Line-items table — S/N, Description, Qty, Rate, Amount. Header repeats on
  // each page; rows break before the footer.
  ensureRoom(30);
  const snX = M + 6, descX = M + 32, qtyX = PW - M - 150, rateX = PW - M - 95, amtX = PW - M;
  const tableHead = (yy: number): number => {
    doc.setFillColor(NAVY); doc.rect(M, yy, CW, 22, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor("#FFFFFF"); doc.setCharSpace(0.3);
    doc.text("S/N", snX, yy + 15);
    doc.text("DESCRIPTION", descX, yy + 15);
    doc.text("QTY", qtyX, yy + 15, { align: "right" });
    doc.text(`RATE (${d.currency})`, rateX, yy + 15, { align: "right" });
    doc.text("AMOUNT", amtX - 10, yy + 15, { align: "right" });
    doc.setCharSpace(0);
    return yy + 22;
  };
  const bodyFont = () => { doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(INK); };
  y = tableHead(y);
  bodyFont();
  const bodyLines = d.lines.length ? d.lines : [{ description: "(no lines)", qty: 0, rate: 0, amount: 0 }];
  bodyLines.forEach((l, i) => {
    const desc = doc.splitTextToSize(l.description || "Service", descX - snX - 4 > 0 ? qtyX - descX - 8 : CW - 130);
    const rowH = Math.max(20, desc.length * 12 + 8);
    if (y + rowH > BODY_BOTTOM) { doc.addPage(); y = tableHead(BODY_TOP); bodyFont(); }
    doc.text(String(i + 1), snX, y + 14);
    doc.text(desc, descX, y + 14);
    doc.text(String(l.qty ?? 1), qtyX, y + 14, { align: "right" });
    doc.text(money(l.rate ?? l.amount, "").trim(), rateX, y + 14, { align: "right" });
    doc.text(money(l.amount, d.currency), amtX - 10, y + 14, { align: "right" });
    doc.setDrawColor(HAIR); doc.setLineWidth(0.5); doc.line(M, y + rowH, PW - M, y + rowH);
    y += rowH;
  });
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

  // Amount in words
  ensureRoom(16);
  doc.setFont("helvetica", "italic"); doc.setFontSize(8.5); doc.setTextColor(LABEL);
  doc.text(`Amount in words: ${amountInWords(d.total, d.currency)}`, M, y);
  y += 22;

  // Terms and conditions — omitted if none configured for this division.
  if (d.terms.length) {
    heading("Terms and Conditions");
    doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(INK);
    d.terms.forEach((term, i) => {
      ensureRoom(14);
      doc.setTextColor(accent); doc.text(`${i + 1}.`, M, y); doc.setTextColor(INK);
      const ls = doc.splitTextToSize(term, CW - 18) as string[];
      ls.forEach((ln, j) => { if (j > 0) ensureRoom(13); doc.text(ln, M + 16, y); if (j < ls.length - 1) y += 13; });
      y += 14;
    });
    y += 10;
  }

  // Signature blocks — company signatory vs client acceptance.
  ensureRoom(90);
  const sigColW = CW / 2 - 12;
  const sig = (x: number, forLabel: string, name: string | null, role: string | null) => {
    doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(accent); doc.setCharSpace(0.6);
    doc.text(forLabel.toUpperCase(), x, y); doc.setCharSpace(0);
    doc.setDrawColor(HAIR); doc.setLineWidth(0.6);
    doc.rect(x, y + 8, sigColW, 42);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(INK);
    doc.text("Date: _______________", x, y + 66);
    if (name) { doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.text(name, x, y + 80); }
    if (role) { doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(LABEL); doc.text(role, x, y + 91); }
  };
  sig(M, `For ${d.org.legal_name}`, d.signatoryName, d.signatoryTitle);
  sig(M + CW / 2 + 12, "Accepted for and on behalf of the Client", d.customer, "Authorised Signatory");
  y += 100;

  // Chrome on every page (letterhead + legal footer) — shared brandChrome.
  stampAllPages(doc, d.brand, d.org, d.logo, d.tollFree);

  return new Uint8Array(doc.output("arraybuffer"));
}
