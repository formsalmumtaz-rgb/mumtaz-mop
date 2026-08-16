import type { jsPDF } from "jspdf";

// The single branding implementation shared by every generated document
// (Art. XVIII: one path, not one-per-document). A generator draws its own body;
// the letterhead (division logo + label + accent rule) and the legal footer
// (legal entity + trade licence + offices + toll-free) come from here, driven by
// the resolved document brand + org — so a report, a quotation and an invoice are
// branded identically and a division/logo/accent change is data, never code.

// A4 in points, shared page geometry.
export const PW = 595.28;
export const PH = 841.89;
export const M = 42;
export const CW = PW - M * 2;

// The band available to a document body on EVERY page: below the letterhead and
// above the legal footer. Generators start their body at BODY_TOP, break to a new
// page before crossing BODY_BOTTOM, and the chrome is stamped on every page after
// (stampAllPages) — so the legal entity name appears on every page, not just the
// last. BODY_TOP matches what drawLetterhead() returns.
export const BODY_TOP = 124;
export const BODY_BOTTOM = 705;

// Neutral ink used across documents (accent is per-division and passed in).
export const INK = "#1A1A1A";
export const NAVY = "#1C2540";
export const LABEL = "#8C8C8C";
export const HAIR = "#E4E1DC";
export const FALLBACK_ACCENT = "#A31E22";

export interface Asset { dataUrl: string; w: number; h: number }

// Minimal PNG dimension reader (IHDR width/height, big-endian) for aspect ratio.
export function pngSize(buf: Uint8Array): { w: number; h: number } {
  const w = (buf[16] << 24) | (buf[17] << 16) | (buf[18] << 8) | buf[19];
  const h = (buf[20] << 24) | (buf[21] << 16) | (buf[22] << 8) | buf[23];
  return { w: w || 1, h: h || 1 };
}

// The per-division skin, resolved from document_branding (mig 052/053).
export interface BrandSkin {
  name: string;
  label: string | null;
  showLabel: boolean;      // print the label? (false where the logo already says it)
  tagline: string | null;
  accent: string;          // hex; the division accent
  showTollFree: boolean;
}

// The group legal block, resolved from document_brand_org / _office (mig 052).
export interface DocOrg {
  legal_name: string;
  group_line: string | null;
  established: string | null;
  trade_licence: string | null;
  offices: { city: string; line1: string | null; line2: string | null }[];
}

// Draw the division letterhead at the top of the page. Returns the y at which the
// document body should begin.
export function drawLetterhead(doc: jsPDF, skin: BrandSkin, logo: Asset | null): number {
  const accent = skin.accent || FALLBACK_ACCENT;
  let y = M;

  if (logo) {
    const targetH = 40;
    const w = (logo.w / logo.h) * targetH;
    doc.addImage(logo.dataUrl, "PNG", M, y, Math.min(w, 220), targetH, undefined, "FAST");
  } else {
    doc.setFont("times", "bold"); doc.setFontSize(22); doc.setTextColor(accent);
    doc.text(skin.name, M, y + 26);
  }
  // Label prints only where it adds clarity (mig 053).
  if (skin.label && skin.showLabel) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(accent); doc.setCharSpace(1.2);
    doc.text(skin.label.toUpperCase(), M, y + 50); doc.setCharSpace(0);
  }
  y += 60;
  doc.setDrawColor(accent); doc.setLineWidth(2); doc.line(M, y, PW - M, y);
  doc.setDrawColor(HAIR); doc.setLineWidth(0.5); doc.line(M, y + 3, PW - M, y + 3);
  return y + 22;
}

// Draw the legal footer pinned to the bottom of the current page: legal entity +
// group line + established + trade licence, the offices row, the toll-free, and
// (on multi-page documents) a page indicator.
export function drawLegalFooter(doc: jsPDF, skin: BrandSkin, org: DocOrg, tollFree: Asset | null, pageNo = 1, pageCount = 1): void {
  const accent = skin.accent || FALLBACK_ACCENT;
  const offices = org.offices.slice(0, 3);
  let fy = PH - M - 62;
  if (skin.showTollFree && tollFree) {
    const th = 20;
    const tw = (tollFree.w / tollFree.h) * th;
    doc.addImage(tollFree.dataUrl, "PNG", PW - M - Math.min(tw, 120), fy - 16, Math.min(tw, 120), th, undefined, "FAST");
  }
  doc.setDrawColor(HAIR); doc.setLineWidth(0.5); doc.line(M, fy, PW - M, fy); fy += 12;
  // ONE legal line per document (item 1): entity + licence, small, here only.
  doc.setFont("times", "normal"); doc.setFontSize(8); doc.setTextColor(accent);
  const legal = [org.legal_name, org.trade_licence ? `TL ${org.trade_licence}` : null]
                .filter(Boolean).join(", ");
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
  if (pageCount > 1) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(6.8); doc.setTextColor(LABEL); doc.setCharSpace(0);
    doc.text(`${pageNo} / ${pageCount}`, PW - M, PH - M + 4, { align: "right" });
  }
}

// Stamp the division letterhead + legal footer on EVERY page of a finished
// document. Call this once, after the body is laid out (the body must have
// reserved the top/bottom bands by using BODY_TOP/BODY_BOTTOM). This is what makes
// the legal entity name appear on every page — a compliance requirement on
// multi-page documents (statements, long service reports).
export function stampAllPages(doc: jsPDF, skin: BrandSkin, org: DocOrg, logo: Asset | null, tollFree: Asset | null): void {
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    drawLetterhead(doc, skin, logo);
    drawLegalFooter(doc, skin, org, tollFree, p, pages);
  }
}

// Write pre-wrapped text lines with automatic pagination: when a line would cross
// into the footer band it starts a fresh page at BODY_TOP. Returns the final y.
// The caller stamps chrome afterwards (stampAllPages), so new pages get it too.
export function flowLines(doc: jsPDF, lines: string[], x: number, startY: number, lineHeight: number): number {
  let y = startY;
  for (const ln of lines) {
    if (y > BODY_BOTTOM) { doc.addPage(); y = BODY_TOP; }
    doc.text(ln, x, y);
    y += lineHeight;
  }
  return y;
}
