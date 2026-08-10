import { jsPDF } from "jspdf";

// Office-copy Service Completion Report (ops-console). Division-aware: the header
// logo + name come from the resolved document brand (Art. XVIII data, not code),
// so a pest-control report carries the Pest Control mark, cleaning the Cleaning
// Crew mark, and so on. Pure function (no DB, no DOM) — the route resolves the
// brand and loads assets, then calls this; a script can reuse it for samples.

const MAROON = "#A31E22";
const NAVY = "#1C2540";
const GOLD = "#BF9F60";
const INK = "#1A1A1A";
const LABEL = "#8C8C8C";
const HAIR = "#E4E1DC";

const PW = 595.28; // A4 pt
const PH = 841.89;
const M = 42;
const CW = PW - M * 2;

export interface Asset { dataUrl: string; w: number; h: number }
export interface ServiceReportPdfData {
  reportNumber: string;
  date: string;
  customer: string;
  performer: string;
  jobRef: string;
  divisionName: string;      // service line name, e.g. "Pest Control"
  notes: string;
  brand: { name: string; tagline: string | null; showTollFree: boolean };
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
  let y = M;

  // ── Header: division logo + name ───────────────────────────────────────
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

  // ── Title bar ──────────────────────────────────────────────────────────
  doc.setFillColor(MAROON); doc.rect(M, y, CW, 30, "F");
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

  // ── Footer ─────────────────────────────────────────────────────────────
  let fy = PH - M - 44;
  doc.setDrawColor(GOLD); doc.setLineWidth(1); doc.line(M, fy, PW - M, fy); fy += 14;
  doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(LABEL);
  doc.text(`${d.brand.name} · This is a record of service performed. Guarantee void if the service record is misplaced.`, M, fy);
  if (d.brand.showTollFree && d.tollFree) {
    const th = 26;
    const tw = (d.tollFree.w / d.tollFree.h) * th;
    doc.addImage(d.tollFree.dataUrl, "PNG", PW - M - Math.min(tw, 150), fy + 6, Math.min(tw, 150), th, undefined, "FAST");
  }

  const out = doc.output("arraybuffer");
  return new Uint8Array(out);
}
