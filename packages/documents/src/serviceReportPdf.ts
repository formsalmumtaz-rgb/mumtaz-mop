import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import { PW, M, CW, type Asset, type DocOrg, type BrandSkin, pngSize } from "./brandChrome";

// ─────────────────────────────────────────────────────────────────────────────
// Vision Part 1: a pixel-faithful clone of docs/reference/AlMumtaz_ServiceReport_v2
// — the real Mumtaz service report. Same wordmark header, toll-free block,
// certification strip, numbered 12-section structure, typography feel and
// two-page layout. The ONLY deviation (agreed): S9 renders scores + visit
// trends instead of the maintenance/cleaning checkbox grids.
//
// GENERATED, not blank: values arrive prepopulated from the system (S1–S3 and
// customer identity from job/contract/customer/assignment; S5–S8 from what the
// technician recorded). Checkbox groups render the template's full vocabulary
// with the recorded entries ticked; text fields with no data render "—" inside
// fixed grids and whole optional sections are omitted when empty.
// ─────────────────────────────────────────────────────────────────────────────
export { pngSize };
export type { Asset, DocOrg };

export interface ServiceReportPdfData {
  reportNumber: string;
  date: string;
  timeIn: string | null;
  timeOut: string | null;
  jobRef: string;
  contractNumber: string | null;
  invoiceNumber: string | null;
  visitSeq: number | null;
  visitTotal: number | null;
  serviceOrderType: string | null;   // scheduled|emergency|follow_up|warranty_visit
  serviceCategory: string | null;    // "Residential (B2C)" | "Commercial (B2B)" | "Industrial"
  contractType: string | null;       // AMC | One-Time | Quarterly | Monthly
  divisionName: string;
  customer: {
    trade_name: string | null; legal_name: string | null; alias: string | null;
    account_number: string | null; trn: string | null; group_name: string | null;
    branch_name: string | null; address: string | null;
    emirate: string | null; po_box: string | null;
    contact_name: string | null; contact_phone: string | null;
    contact_secondary: string | null; email: string | null;
    rep_name: string | null; rep_designation: string | null; rep_contact: string | null;
  };
  supervisor: { name: string; code: string | null; phone: string | null } | null;
  team: { name: string; code: string | null }[];
  premisesType: string | null;
  pestEvidence: string[];        // recorded issue codes/labels
  infestationLevel: string | null;
  areasTreated: string[];        // recorded area codes/labels
  specificAreasDetail: string | null;
  accessRestrictions: string | null;
  treatmentMethod: string | null;
  chemicals: { product: string; active_ingredient: string | null; concentration: string | null; batch_no: string | null; quantity: number; unit: string | null; dilution: string | null; application_method?: string | null; target_pest?: string | null }[];
  ppeUsed: string | null;
  findings: { area: string; issue: string | null; infestation: string | null; hygiene: number | null; structural: number | null; notes: string | null }[];
  recommendations: string | null;
  trend: { visit_label: string; date: string | null; infestation: number | null; hygiene: number | null; structural: number | null }[];
  mostFlaggedIssue: string | null;
  notes: string;
  financials: {
    months_guaranteed: number | null; yearly_contract: boolean | null;
    next_service_due: string | null; amount_excl_vat: number | null;
    vat_amount: number | null; total_incl_vat: number | null;
    amount_received: number | null; payment_method: string | null; balance_due: number | null;
  };
  signatureCustomer: Asset | null;
  signatureCustomerCaptured: boolean;
  signatureTechnician: Asset | null;
  signatureTechnicianCaptured: boolean;
  verifyUrl: string | null;
  brand: BrandSkin;
  org: DocOrg;
  logo: Asset | null;      // unused by the clone (wordmark is drawn) — kept for API parity
  tollFree: Asset | null;  // unused by the clone
}

// Template palette (sampled from AlMumtaz_ServiceReport_v2)
const BURGUNDY = "#8A1E2E";
const INK = "#1C1C1C";
const MUTED = "#8C8781";
const BOX = "#DDD8D2";
const STRIP_BG = "#F5F3F0";
const GOLD_BAR = "#C9A45C";

// Template vocabularies (SOURCED — the printed checkbox lists ARE the form)
const ORDER_TYPES: [string, string][] = [["scheduled", "Scheduled"], ["emergency", "Emergency"], ["follow_up", "Follow-up"], ["warranty_visit", "Warranty Visit"]];
const CATEGORIES = ["Residential (B2C)", "Commercial (B2B)", "Industrial"];
const CONTRACT_TYPES = ["AMC", "One-Time", "Quarterly", "Monthly"];
const PREMISES: string[] = ["Restaurant / Café", "Hotel / Hospitality", "Supermarket / Retail", "Warehouse / Factory", "Villa / Apartment", "Office / Commercial", "Hospital / Clinic", "School / Education", "Labour Camp", "Ship / Vessel / Rig", "Construction Site", "Mosque / Community", "Mall / Retail Complex"];
const PESTS: [string, string][] = [
  ["cockroach", "Cockroach"], ["bed_bug", "Bed Bug"], ["rodent", "Rat / Rodent"], ["mosquito", "Mosquito"],
  ["ant", "Ant"], ["fly", "Fly"], ["flea", "Flea"], ["termite", "Termite"],
  ["scorpion", "Scorpion"], ["stored_product_pest", "Stored Product Pest"],
  ["bird_pigeon", "Bird / Pigeon"], ["lizard_gecko", "Lizard / Gecko"],
  ["no_activity", "No Pest Activity Observed"],
];
const LEVELS: [string, string][] = [["low", "Low"], ["medium", "Medium"], ["high", "High"], ["critical", "Critical"]];
const AREAS: [string, string][] = [
  ["kitchen", "Kitchen"], ["dining_area", "Dining Area"], ["store_room", "Store Room"], ["bathroom_toilet", "Bathroom / Toilet"],
  ["bedroom", "Bedroom"], ["living_room", "Living Room"], ["corridor_lobby", "Corridor / Lobby"],
  ["basement_parking", "Basement / Parking"], ["roof_terrace", "Roof / Terrace"], ["garden_perimeter", "Garden / Perimeter"],
  ["ac_ducts", "AC Ducts"], ["drainage_sewage", "Drainage / Sewage"], ["ceiling_void", "Ceiling Void"],
  ["wall_cavities", "Wall Cavities"], ["entire_premises", "Entire Premises"],
];
const METHODS: [string, string][] = [
  ["gel_treatment", "Gel Treatment"], ["spray_treatment", "Spray Treatment"], ["residual_spray", "Residual Spray"],
  ["fogging_ulv", "Fogging / ULV"], ["termite_treatment", "Termite Treatment"],
  ["rat_poison_bait_station", "Rat Poison / Bait Station"], ["monitoring_only", "Monitoring Only"],
];
// legacy inspection codes that overlap the template vocabulary
const CODE_ALIASES: Record<string, string> = { dining: "dining_area", wash: "drainage_sewage" };

const BOILERPLATE = {
  post: "Vacate premises for min. 2–5 hrs after spray/fogging. Keep children & pets away. Open windows after re-entry.",
  municipality: "This service complies with Dubai & Sharjah Municipality regulations and approved chemical usage guidelines.",
  guarantee: "Guarantee is void if this record is misplaced or tampered with. Complaint must be raised within one month.",
  acknowledgement: "I / We, the client, confirm that the above-described pest control services have been carried out satisfactorily on the premises stated, and that all information provided herein is accurate and complete to the best of my knowledge. ",
  complaint: "IF ANY COMPLAINT, PLEASE CALL WITHIN ONE MONTH OF SERVICE DATE.",
  footer: "NOTE: GUARANTEE VOID IF SERVICE RECORD IS MISPLACED | Al Mumtaz Bldg Clean & Pest Control · Al Estiqlal Street, Al Manakh, Sharjah, UAE",
};

// Display hygiene (defect sweep item 5): a filled form says "N/A" where a
// human would write it — never an em-dash placeholder.
const dash = (v: string | null | undefined) => (v && v.trim() !== "" ? v : "N/A");

export function renderServiceReportPdf(d: ServiceReportPdfData): Uint8Array {
  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });
  let y = 0;

  const ls = (s: string, spacing: number) => { doc.setCharSpace(spacing); doc.text(s, 0, 0); doc.setCharSpace(0); }; // unused helper pattern
  void ls;

  const spaced = (text: string, x: number, yy: number, size: number, color: string, opts?: { bold?: boolean; serif?: boolean; align?: "left" | "center" | "right"; spacing?: number }) => {
    doc.setFont(opts?.serif ? "times" : "helvetica", opts?.bold ? "bold" : "normal");
    doc.setFontSize(size); doc.setTextColor(color);
    doc.setCharSpace(opts?.spacing ?? 0);
    doc.text(text, x, yy, { align: opts?.align ?? "left" });
    doc.setCharSpace(0);
  };

  // ── Letterhead (page 1) — REAL brand assets first (defect sweep item 2:
  // never draw text where a brand file exists); the drawn wordmark is only the
  // fallback when no asset was supplied.
  const drawLetterhead = () => {
    y = 56;
    if (d.logo) {
      const targetH = 44;
      const w = Math.min((d.logo.w / d.logo.h) * targetH, 170);
      doc.addImage(d.logo.dataUrl, "PNG", M, y - 24, w, targetH, undefined, "FAST");
    } else {
      doc.setDrawColor(BURGUNDY); doc.setLineWidth(1.4);
      doc.line(M, y - 20, M + 128, y - 20);
      spaced("MUMTAZ", M, y + 4, 27, BURGUNDY, { serif: true, bold: true, spacing: 1.5 });
      doc.setLineWidth(1.4); doc.line(M, y + 11, M + 128, y + 11);
      spaced("PEST CONTROL", M + 8, y + 24, 8, BURGUNDY, { spacing: 2.6 });
    }
    // centre: the title alone — the logo says the division, the footer carries
    // the one legal line (item 1: no repeated brand text).
    spaced("Service Completion Report", PW / 2, y + 2, 19, BURGUNDY, { serif: true, align: "center" });
    // right: toll free (real asset when supplied) + contact block
    if (d.tollFree) {
      const th = 26;
      const tw = Math.min((d.tollFree.w / d.tollFree.h) * th, 90);
      doc.addImage(d.tollFree.dataUrl, "PNG", PW - M - tw, y - 22, tw, th, undefined, "FAST");
    } else {
      spaced("TOLL FREE", PW - M - 30, y - 18, 8, INK, { serif: true, align: "center", spacing: 1.2 });
      spaced("800 688", PW - M - 30, y - 2, 17, INK, { serif: true, align: "center" });
    }
    spaced("info@almumtaz.ae | www.almumtaz.ae", PW - M, y + 12, 5.6, MUTED, { align: "right" });
    spaced("06 565 4466 | PO Box 66575, Sharjah", PW - M, y + 21, 5.6, MUTED, { align: "right" });
    // certification strip
    y += 38;
    doc.setFillColor(STRIP_BG); doc.rect(0, y, PW, 18, "F");
    const certs = ["ISO 9001:2015 CERTIFIED", "ISO 45001 HEALTH & SAFETY", "ISO 45001 ENVIRONMENTAL", "ASCB ACCREDITED", "DUBAI MUNICIPALITY APPROVED", "SHARJAH MUNICIPALITY APPROVED"];
    const cy = y + 12;
    let cx = M - 6;
    const totalW = PW - M * 2 + 12;
    const slot = totalW / certs.length;
    certs.forEach((c, i) => {
      spaced(c, cx + slot / 2, cy, 4.4, MUTED, { align: "center", spacing: 0.35, bold: true });
      if (i < certs.length - 1) { doc.setTextColor(BURGUNDY); doc.setFontSize(5.5); doc.text("|", cx + slot - 1, cy); }
      cx += slot;
    });
    y += 34;
  };

  // ── Building blocks in the template's visual language ────────────────────
  const sectionHeader = (num: number, title: string) => {
    y += 5;
    spaced(String(num), M, y, 8, MUTED);
    spaced(title.toUpperCase(), M + 18, y, 8.6, BURGUNDY, { bold: true, spacing: 1.6 });
    y += 12;
  };

  // A labelled field box (template look): bordered box, tiny burgundy caps
  // label (wrapped when longer than the box), value line below.
  const fieldBox = (x: number, yy: number, w: number, h: number, label: string, value: string) => {
    doc.setDrawColor(BOX); doc.setLineWidth(0.8); doc.rect(x, yy, w, h);
    doc.setFont("helvetica", "bold"); doc.setFontSize(5.2); doc.setTextColor(BURGUNDY); doc.setCharSpace(0.5);
    const labelLines = (doc.splitTextToSize(label.toUpperCase(), w - 10) as string[]).slice(0, 2);
    doc.text(labelLines, x + 6, yy + 9);
    doc.setCharSpace(0);
    const valueY = yy + 9 + labelLines.length * 6 + 6;
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.4); doc.setTextColor(INK);
    const lines = doc.splitTextToSize(value, w - 12) as string[];
    doc.text(lines.slice(0, Math.max(1, Math.floor((h - (valueY - yy) + 6) / 9))), x + 6, valueY);
  };

  const fieldRow = (cells: { label: string; value: string; w: number }[], h = 30) => {
    let x = M;
    for (const c of cells) { fieldBox(x, y, c.w, h, c.label, c.value); x += c.w + 6; }
    y += h + 7;
  };

  const checkboxSized = (x: number, yy: number, checked: boolean, label: string, size: number, labelColor = INK) => {
    doc.setDrawColor(checked ? BURGUNDY : "#B9B3AC"); doc.setLineWidth(0.9);
    doc.rect(x, yy - 6.5, 7.5, 7.5);
    if (checked) {
      doc.setDrawColor(BURGUNDY); doc.setLineWidth(1.3);
      doc.line(x + 1.6, yy - 3, x + 3.2, yy - 1.2);
      doc.line(x + 3.2, yy - 1.2, x + 6.2, yy - 5.4);
    }
    spaced(label, x + 11.5, yy, size, checked ? INK : labelColor);
  };
  const checkbox = (x: number, yy: number, checked: boolean, label: string, labelColor = INK) =>
    checkboxSized(x, yy, checked, label, 7.4, labelColor);

  // ═════════════ PAGE 1 ═════════════
  drawLetterhead();

  // S1 — Job Reference & Identification
  sectionHeader(1, "Job Reference & Identification");
  const w7 = (CW - 6 * 6) / 7;
  fieldRow([
    { label: "Record / Job No.", value: d.jobRef, w: w7 * 1.35 },
    { label: "Contract No.", value: dash(d.contractNumber), w: w7 * 1.15 },
    { label: "Visit No.", value: d.visitSeq != null && d.visitTotal ? `${d.visitSeq} of ${d.visitTotal}` : dash(null), w: w7 * 0.85 },
    { label: "Invoice No. (if applicable)", value: dash(d.invoiceNumber), w: w7 * 1.15 },
    { label: "Service Date", value: dash(d.date), w: w7 },
    { label: "Time In", value: dash(d.timeIn), w: w7 * 0.75 },
    { label: "Time Out", value: dash(d.timeOut), w: w7 * 0.75 },
  ], 32);
  // classification checkboxes: three bordered clusters
  {
    const clusterH = 44;
    const cw1 = CW * 0.38, cw2 = CW * 0.315, cw3 = CW * 0.275;
    let x = M;
    doc.setDrawColor(BOX); doc.setLineWidth(0.8);
    doc.rect(x, y, cw1, clusterH); doc.rect(x + cw1 + 6, y, cw2, clusterH); doc.rect(x + cw1 + cw2 + 12, y, cw3, clusterH);
    spaced("SERVICE ORDER TYPE", x + 6, y + 10, 5.4, BURGUNDY, { bold: true, spacing: 0.7 });
    ORDER_TYPES.forEach(([code, label], i) => {
      const cx2 = x + 6 + (i % 3) * (cw1 / 3);
      const cy2 = y + 24 + Math.floor(i / 3) * 15;
      checkbox(cx2, cy2, d.serviceOrderType === code, label);
    });
    spaced("SERVICE CATEGORY", x + cw1 + 12, y + 10, 5.4, BURGUNDY, { bold: true, spacing: 0.7 });
    CATEGORIES.forEach((label, i) => {
      const cx2 = x + cw1 + 12 + (i % 2) * (cw2 / 2);
      const cy2 = y + 24 + Math.floor(i / 2) * 15;
      checkbox(cx2, cy2, d.serviceCategory === label, label);
    });
    spaced("CONTRACT TYPE", x + cw1 + cw2 + 18, y + 10, 5.4, BURGUNDY, { bold: true, spacing: 0.7 });
    CONTRACT_TYPES.forEach((label, i) => {
      const cx2 = x + cw1 + cw2 + 18 + (i % 3) * (cw3 / 3);
      const cy2 = y + 24 + Math.floor(i / 3) * 15;
      checkbox(cx2, cy2, d.contractType === label, label);
    });
    y += clusterH + 9;
  }

  // S2 — Customer Details
  sectionHeader(2, "Customer Details");
  const cu = d.customer;
  fieldRow([
    { label: "Customer / Company Name", value: dash(cu.trade_name ?? cu.legal_name), w: CW * 0.42 },
    { label: "Account No.", value: dash(cu.account_number), w: CW * 0.15 },
    { label: "TRN / VAT No.", value: dash(cu.trn), w: CW * 0.18 },
    { label: "Chain / Group Name", value: dash(cu.group_name), w: CW * 0.19 },
  ], 28);
  fieldRow([
    { label: "Building Name / Unit No. / Floor", value: dash(cu.address), w: CW * 0.40 },
    { label: "Branch (if chain — specify which branch)", value: dash(cu.branch_name), w: CW * 0.25 },
    { label: "Premises / Site Reference", value: dash(cu.branch_name && cu.address ? `${cu.branch_name}` : null), w: CW * 0.29 },
  ], 28);
  fieldRow([
    { label: "Area / Locality", value: dash(null), w: CW * 0.33 },
    { label: "Emirate / City", value: dash(cu.emirate), w: CW * 0.33 },
    { label: "PO Box", value: dash(cu.po_box), w: CW * 0.28 },
  ], 28);
  fieldRow([
    { label: "Contact No. (Primary)", value: dash(cu.contact_phone), w: CW * 0.30 },
    { label: "Contact No. (Secondary / WhatsApp)", value: dash(cu.contact_secondary), w: CW * 0.30 },
    { label: "Email Address", value: dash(cu.email), w: CW * 0.34 },
  ], 28);
  fieldRow([
    { label: "On-site Representative Name", value: dash(cu.rep_name ?? cu.contact_name), w: CW * 0.30 },
    { label: "Designation / Department", value: dash(cu.rep_designation), w: CW * 0.24 },
    { label: "Rep. Contact No.", value: dash(cu.rep_contact), w: CW * 0.20 },
    { label: "Rep. Signature", value: d.signatureCustomerCaptured ? "(signed — see Section 12)" : "—", w: CW * 0.20 },
  ], 28);

  // S3 — Service Team Details
  sectionHeader(3, "Service Team Details");
  const teamSize = d.team.length + (d.supervisor ? 1 : 0);
  fieldRow([
    { label: "Supervisor Name", value: dash(d.supervisor?.name ?? null), w: CW * 0.30 },
    { label: "Supervisor ID / Badge No.", value: dash(d.supervisor?.code ?? null), w: CW * 0.20 },
    { label: "Supervisor Contact No.", value: dash(d.supervisor?.phone ?? null), w: CW * 0.20 },
    { label: "Team Size", value: teamSize > 0 ? String(teamSize) : "—", w: CW * 0.11 },
    { label: "Supervisor Initials", value: d.supervisor?.name ? d.supervisor.name.split(/\s+/).map((p) => p[0]).join(".").toUpperCase() : "—", w: CW * 0.13 },
  ], 30);
  {
    const t = d.team;
    fieldRow([
      { label: "Technician 1 – Name", value: dash(t[0]?.name ?? null), w: CW * 0.21 },
      { label: "Tech 1 – ID/Badge", value: dash(t[0]?.code ?? null), w: CW * 0.115 },
      { label: "Technician 2 – Name", value: dash(t[1]?.name ?? null), w: CW * 0.21 },
      { label: "Tech 2 – ID/Badge", value: dash(t[1]?.code ?? null), w: CW * 0.115 },
      { label: "Technician 3 – Name", value: dash(t[2]?.name ?? null), w: CW * 0.21 },
      { label: "Tech 3 – ID/Badge", value: dash(t[2]?.code ?? null), w: CW * 0.115 },
    ], 26);
  }

  // S4 + S5 side by side
  const s45Top = y;
  sectionHeader(4, "Premises Type");
  {
    const boxW = CW * 0.47, boxH = 118;
    doc.setDrawColor(BOX); doc.setLineWidth(0.8); doc.rect(M, y, boxW, boxH);
    const isOther = d.premisesType && !PREMISES.includes(d.premisesType);
    PREMISES.forEach((label, i) => {
      const cx2 = M + 8 + (i % 2) * (boxW / 2);
      const cy2 = y + 14 + Math.floor(i / 2) * 15.5;
      checkbox(cx2, cy2, d.premisesType === label, label);
    });
    checkbox(M + 8 + (boxW / 2), y + 14 + 6 * 15.5, !!isOther, isOther ? `Other: ${d.premisesType}` : "Other (specify) ________");
    y += boxH + 8;
  }
  const s4Bottom = y;
  // S5 to the right of S4
  {
    y = s45Top;
    const x0 = M + CW * 0.50;
    spaced("5", x0, y, 8, MUTED);
    spaced("PEST ACTIVITY EVIDENCE NOTED", x0 + 14, y, 8.6, BURGUNDY, { bold: true, spacing: 1.4 });
    y += 12;
    const boxW = CW * 0.50, boxH = 118;
    doc.setDrawColor(BOX); doc.setLineWidth(0.8); doc.rect(x0, y, boxW, boxH);
    const evid = new Set(d.pestEvidence.map((e) => CODE_ALIASES[e] ?? e));
    const known = new Set(PESTS.map(([c]) => c));
    const others = d.pestEvidence.filter((e) => !known.has(CODE_ALIASES[e] ?? e));
    PESTS.forEach(([code, label], i) => {
      const cx2 = x0 + 8 + (i % 2) * (boxW / 2);
      const cy2 = y + 13 + Math.floor(i / 2) * 14.5;
      checkbox(cx2, cy2, evid.has(code), label);
    });
    checkbox(x0 + 8 + boxW / 2, y + 13 + 6 * 14.5, others.length > 0, others.length ? `Other: ${others.join(", ")}` : "Other (specify) ________");
    // infestation level strip
    const ly = y + boxH + 5;
    doc.setDrawColor(BOX); doc.rect(x0, ly, boxW, 26);
    spaced("INFESTATION LEVEL", x0 + 6, ly + 9, 5.4, BURGUNDY, { bold: true, spacing: 0.7 });
    LEVELS.forEach(([code, label], i) => {
      checkbox(x0 + 8 + i * (boxW / 4.4), ly + 20, d.infestationLevel === code || (code === "critical" && d.infestationLevel === "severe"), label);
    });
    y = Math.max(s4Bottom, ly + 26 + 8);
  }

  // S6 — Treatment Areas & Access Points
  sectionHeader(6, "Treatment Areas & Access Points");
  {
    const boxH = 62;
    doc.setDrawColor(BOX); doc.setLineWidth(0.8); doc.rect(M, y, CW, boxH);
    const treated = new Set(d.areasTreated.map((a) => CODE_ALIASES[a] ?? a));
    AREAS.forEach(([code, label], i) => {
      const cx2 = M + 8 + (i % 7) * ((CW - 12) / 7);
      const cy2 = y + 14 + Math.floor(i / 7) * 15.5;
      // narrower columns than the pest box — smaller label size to fit
      doc.setFontSize(6.6);
      checkboxSized(cx2, cy2, treated.has(code), label, 6.6);
    });
    y += boxH + 6;
    const knownAreas = new Set(AREAS.map(([c]) => c));
    const extraAreas = d.areasTreated.filter((a) => !knownAreas.has(CODE_ALIASES[a] ?? a));
    const detail = [d.specificAreasDetail, extraAreas.length ? extraAreas.join(", ") : null].filter(Boolean).join(" · ");
    fieldRow([
      { label: "Specific Areas / Rooms Treated (Detail)", value: dash(detail || null), w: CW * 0.55 },
      { label: "Access Restrictions / Areas Not Treated", value: dash(d.accessRestrictions), w: CW * 0.42 },
    ], 26);
  }

  // S7 header stays on page 1 like the template; content continues page 2
  sectionHeader(7, "Chemical & Treatment Details");

  // ═════════════ PAGE 2 ═════════════
  doc.addPage();
  y = 46;

  // treatment method cluster (burgundy left bar, like the template)
  {
    const boxH = 40;
    doc.setDrawColor(BOX); doc.setLineWidth(0.8); doc.rect(M, y, CW, boxH);
    doc.setFillColor(BURGUNDY); doc.rect(M, y, 2.5, boxH, "F");
    spaced("TREATMENT METHOD:", M + 10, y + 14, 6.4, BURGUNDY, { bold: true, spacing: 0.8 });
    const sel = d.treatmentMethod;
    METHODS.forEach(([code, label], i) => {
      const row = i < 4 ? 0 : 1;
      const col = i < 4 ? i : i - 4;
      const cx2 = M + 105 + col * ((CW - 115) / 4);
      const cy2 = y + 14 + row * 16;
      const isSel = sel === code || sel === label;
      checkboxSized(cx2, cy2, isSel, label, 6.9);
    });
    const isOtherM = sel != null && !METHODS.some(([c, l]) => c === sel || l === sel);
    checkboxSized(M + 105 + 3 * ((CW - 115) / 4), y + 30, !!isOtherM, isOtherM ? `Other: ${sel}` : "Other: __________", 6.9);
    y += boxH + 10;
  }

  // chemical table
  {
    const cols = [M, M + 112, M + 224, M + 260, M + 306, M + 358, M + 404, M + 456];
    const heads = ["CHEMICAL / PRODUCT NAME", "ACTIVE INGREDIENT / FORMULATION", "CONC. (%)", "DOSAGE / QTY USED", "BATCH / LOT NO.", "DILUTION RATIO", "APPLICATION METHOD", "TARGET PEST"];
    doc.setDrawColor(BOX); doc.setLineWidth(0.8);
    doc.rect(M, y, CW, 20);
    heads.forEach((hd, i) => {
      const wCol = (cols[i + 1] ?? PW - M) - cols[i] - 4;
      doc.setFont("helvetica", "bold"); doc.setFontSize(5.2); doc.setTextColor(MUTED); doc.setCharSpace(0.5);
      doc.text(doc.splitTextToSize(hd, wCol) as string[], cols[i] + 3, y + 8);
      doc.setCharSpace(0);
    });
    y += 20;
    const rowsToDraw = Math.max(d.chemicals.length, 3);
    for (let i = 0; i < rowsToDraw; i++) {
      const c = d.chemicals[i];
      doc.setFont("helvetica", "normal"); doc.setFontSize(7.6); doc.setTextColor(INK);
      doc.text(`${i + 1}.`, M + 2, y + 11);
      if (c) {
        doc.text(doc.splitTextToSize(c.product, 108) as string[], M + 12, y + 11);
        doc.text(doc.splitTextToSize(c.active_ingredient ?? "—", 112) as string[], cols[1] + 3, y + 11);
        doc.text(c.concentration ?? "N/A", cols[2] + 3, y + 11);
        doc.text(`${c.quantity} ${c.unit ?? ""}`.trim(), cols[3] + 3, y + 11);
        doc.text(c.batch_no ?? "N/A", cols[4] + 3, y + 11);
        doc.text(c.dilution ?? "N/A", cols[5] + 3, y + 11);
        doc.text(c.application_method ?? "N/A", cols[6] + 3, y + 11);
        doc.text(doc.splitTextToSize(c.target_pest ?? "N/A", 78) as string[], cols[7] + 3, y + 11);
      }
      doc.setDrawColor(BOX); doc.setLineWidth(0.6); doc.line(M, y + 16, PW - M, y + 16);
      y += 17;
    }
    y += 8;
  }
  // PPE / storage / re-entry
  fieldRow([
    { label: "PPE Used by Technician(s)", value: dash(d.ppeUsed), w: CW * 0.30 },
    { label: "Chemical Storage / Disposal Method", value: "As per approved MSDS & municipality guidelines", w: CW * 0.32 },
    { label: "Re-entry Time / Safety Instructions Given", value: BOILERPLATE.post.split(".")[0] + ".", w: CW * 0.34 },
  ], 28);

  // S8 — Observations (gold left bar, like the template)
  sectionHeader(8, "Observations, Findings & Recommendations");
  {
    const obsParts = [
      d.notes.trim() || null,
      ...d.findings.filter((f) => f.notes).map((f) => `${f.area}: ${f.notes}`),
      d.recommendations ? `Recommended: ${d.recommendations}` : null,
    ].filter(Boolean) as string[];
    const text = obsParts.length ? obsParts.join("  ·  ") : "—";
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(INK);
    const lines = doc.splitTextToSize(text, CW - 22) as string[];
    const boxH = Math.max(44, lines.length * 10 + 24);
    doc.setDrawColor(BOX); doc.setLineWidth(0.8); doc.rect(M, y, CW, boxH);
    doc.setFillColor(GOLD_BAR); doc.rect(M, y, 2.5, boxH, "F");
    spaced("POSITIVE / NEGATIVE FINDINGS — HYGIENE OBSERVATIONS — RECOMMENDED CORRECTIVE ACTIONS", M + 10, y + 11, 5.6, BURGUNDY, { bold: true, spacing: 0.6 });
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(INK);
    doc.text(lines, M + 10, y + 24);
    y += boxH + 10;
  }

  // S9 (agreed deviation) + S10 side by side
  const s9Top = y;
  {
    spaced("9", M, y, 8, MUTED);
    spaced("SCORES & VISIT TREND", M + 14, y, 8.6, BURGUNDY, { bold: true, spacing: 1.4 });
    y += 12;
    const boxW = CW * 0.47, boxH = 128;
    doc.setDrawColor(BOX); doc.setLineWidth(0.8); doc.rect(M, y, boxW, boxH);
    const latest = d.trend[d.trend.length - 1];
    spaced(`HYGIENE ${latest?.hygiene != null ? latest.hygiene + "/5" : "—"}    STRUCTURAL ${latest?.structural != null ? latest.structural + "/5" : "—"}    INFESTATION ${dash(d.infestationLevel).toUpperCase()}`,
      M + 8, y + 13, 6.4, INK, { bold: true, spacing: 0.5 });
    if (d.trend.length >= 2) {
      const chartH = 62, base = y + 88;
      const groupW = Math.min(64, (boxW - 20) / d.trend.length);
      d.trend.forEach((t, i) => {
        const gx = M + 12 + i * groupW;
        const bars: [number | null, string][] = [[t.infestation, BURGUNDY], [t.hygiene, "#1C2540"], [t.structural, "#9A9A9A"]];
        bars.forEach(([v, color], bi) => {
          if (v == null) return;
          const bh = Math.max(3, (Math.min(v, 5) / 5) * chartH);
          doc.setFillColor(color as string);
          doc.rect(gx + bi * 12, base - bh, 9, bh, "F");
        });
        spaced(t.visit_label, gx, base + 9, 6, MUTED);
      });
      spaced(`Most flagged: ${dash(d.mostFlaggedIssue)}   ·   Direction: ${trendDirection(d.trend)}`, M + 8, y + boxH - 10, 6.4, INK);
    } else {
      spaced("Baseline assessment — trend data available from visit 3.", M + 8, y + 40, 7.4, MUTED);
    }
    y += boxH + 8;
  }
  const s9Bottom = y;
  {
    y = s9Top;
    const x0 = M + CW * 0.50;
    spaced("10", x0, y, 8, MUTED);
    spaced("REGULATORY & COMPLIANCE NOTES", x0 + 16, y, 8.6, BURGUNDY, { bold: true, spacing: 1.2 });
    y += 12;
    const boxW = CW * 0.50;
    const noteBox = (label: string, text: string) => {
      doc.setFont("helvetica", "normal"); doc.setFontSize(6.8);
      const lines = doc.splitTextToSize(text, boxW - 20) as string[];
      const bh = lines.length * 8.4 + 18;
      doc.setDrawColor(BOX); doc.setLineWidth(0.8); doc.rect(x0, y, boxW, bh);
      doc.setFillColor(BURGUNDY); doc.rect(x0, y, 2.5, bh, "F");
      spaced(label, x0 + 9, y + 10, 5.6, BURGUNDY, { bold: true, spacing: 0.7 });
      doc.setFont("helvetica", "normal"); doc.setFontSize(6.8); doc.setTextColor(INK);
      doc.text(lines, x0 + 9, y + 19);
      y += bh + 6;
    };
    noteBox("POST-TREATMENT INSTRUCTIONS", BOILERPLATE.post);
    noteBox("MUNICIPALITY COMPLIANCE", BOILERPLATE.municipality);
    noteBox("GUARANTEE CLAUSE", BOILERPLATE.guarantee);
    y = Math.max(s9Bottom, y) + 4;
  }

  // S11 — Contract, Guarantee & Financials
  sectionHeader(11, "Contract, Guarantee & Financials");
  {
    const f = d.financials;
    const money = (n: number | null) => (n != null ? n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "N/A");
    const w5 = (CW - 4 * 6) / 5;
    fieldRow([
      { label: "Months Guaranteed", value: f.months_guaranteed != null ? String(f.months_guaranteed) : "N/A", w: w5 },
      { label: "Yearly Contract (Yes / No)", value: f.yearly_contract == null ? "N/A" : f.yearly_contract ? "Yes" : "No", w: w5 },
      { label: "Next Service Due Date", value: dash(f.next_service_due), w: w5 },
      { label: "Invoice No. (Ref.)", value: dash(d.invoiceNumber), w: w5 },
      { label: "Amount Excl. VAT (AED)", value: money(f.amount_excl_vat), w: w5 },
    ], 26);
    fieldRow([
      { label: "VAT Amount (5%)", value: money(f.vat_amount), w: w5 },
      { label: "Total Amount Incl. VAT (AED)", value: money(f.total_incl_vat), w: w5 },
      { label: "Amount Received (AED)", value: money(f.amount_received), w: w5 },
      { label: "Payment Method", value: dash(f.payment_method), w: w5 },
      { label: "Balance Due (AED)", value: money(f.balance_due), w: w5 },
    ], 26);
  }

  // S12 — Confirmation & Signatures
  sectionHeader(12, "Confirmation & Signatures");
  {
    // acknowledgement box with burgundy bar + bold complaint line
    doc.setFont("helvetica", "normal"); doc.setFontSize(7);
    const ack = doc.splitTextToSize(BOILERPLATE.acknowledgement, CW - 22) as string[];
    const bh = ack.length * 8.6 + 18;
    doc.setDrawColor(BOX); doc.setLineWidth(0.8); doc.rect(M, y, CW, bh);
    doc.setFillColor(BURGUNDY); doc.rect(M, y, 2.5, bh, "F");
    doc.setTextColor(INK);
    doc.text(ack, M + 10, y + 12);
    doc.setFont("helvetica", "bold");
    doc.text(BOILERPLATE.complaint, M + 10, y + 12 + (ack.length - 0) * 8.6);
    y += bh + 8;

    const sw = (CW - 3 * 8) / 4;
    const sigCell = (x: number, label: string, hint: string, img: Asset | null, printName?: string | null, unavailable?: boolean) => {
      doc.setDrawColor(BOX); doc.setLineWidth(0.8); doc.rect(x, y, sw, 56);
      spaced(label, x + 5, y + 9, 5.4, BURGUNDY, { bold: true, spacing: 0.5 });
      if (img) {
        const h = 32; const w = Math.min((img.w / img.h) * h, sw - 10);
        try { doc.addImage(img.dataUrl, "PNG", x + 5, y + 14, w, h); } catch { /* omit */ }
      } else if (unavailable) {
        spaced("signed on device — image unavailable", x + 5, y + 34, 5.6, MUTED);
      }
      if (printName) {
        doc.setFont("helvetica", "normal"); doc.setFontSize(7.2); doc.setTextColor(INK);
        doc.text(printName, x + 5, y + 46);
      } else if (!img && !unavailable) {
        spaced(hint, x + 5, y + 50, 5.4, "#B9B3AC");
      }
    };
    sigCell(M, "CLIENT / REP. NAME (PRINT)", "Print Name", null, cu.rep_name ?? cu.contact_name ?? null);
    sigCell(M + sw + 8, "CLIENT SIGNATURE & DATE", "Signature & Date", d.signatureCustomer, null, d.signatureCustomerCaptured && !d.signatureCustomer);
    sigCell(M + (sw + 8) * 2, "SUPERVISOR NAME & SIGNATURE", "Supervisor Sign", d.signatureTechnician, d.supervisor?.name ?? null, d.signatureTechnicianCaptured && !d.signatureTechnician);
    // stamp / QR cell
    {
      const x = M + (sw + 8) * 3;
      doc.setDrawColor(BOX); doc.setLineWidth(0.8); doc.rect(x, y, sw, 56);
      spaced("COMPANY STAMP / QR CODE", x + 5, y + 9, 5.4, BURGUNDY, { bold: true, spacing: 0.5 });
      if (d.verifyUrl) {
        // synchronous data URL is not available; QR pre-rendered by caller via makeQrAsset
      }
      if (d.verifyUrl && qrCache.has(d.verifyUrl)) {
        const qr = qrCache.get(d.verifyUrl)!;
        try { doc.addImage(qr, "PNG", x + sw - 46, y + 12, 40, 40); } catch { /* omit */ }
      }
      doc.setDrawColor(BURGUNDY); doc.setLineWidth(0.8); doc.line(x + 5, y + 44, x + sw - 50, y + 44);
      spaced("Official Stamp", x + 5, y + 51, 5.4, "#B9B3AC");
    }
    y += 66;
  }

  // footer note — exactly the template's line
  spaced(BOILERPLATE.footer, M, 812, 5.6, MUTED);
  spaced("MUMTAZ", PW - M, 812, 10, "#E4DFD9", { serif: true, bold: true, align: "right", spacing: 1 });

  // page indicator (report number on both pages for traceability)
  doc.setPage(1);
  spaced(d.reportNumber, PW - M, 812, 6.4, MUTED, { align: "right" });
  doc.setPage(2);

  return new Uint8Array(doc.output("arraybuffer"));
}

function trendDirection(trend: { infestation: number | null }[]): string {
  const vals = trend.map((t) => t.infestation).filter((v): v is number => v != null);
  if (vals.length < 2) return "—";
  const delta = vals[vals.length - 1] - vals[0];
  return delta < 0 ? "Improving" : delta > 0 ? "Deteriorating" : "Stable";
}

// QR pre-render: jsPDF is synchronous, QR generation is async — callers await
// prepareQr(url) once before renderServiceReportPdf and the renderer reads the
// cache. (Kept tiny and explicit rather than making the whole renderer async.)
const qrCache = new Map<string, string>();
export async function prepareQr(url: string): Promise<void> {
  if (qrCache.has(url)) return;
  try {
    qrCache.set(url, await QRCode.toDataURL(url, { margin: 0, width: 120 }));
  } catch { /* stamp cell renders without QR */ }
}
