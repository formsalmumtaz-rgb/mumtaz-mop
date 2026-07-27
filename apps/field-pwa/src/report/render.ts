// Renders the ReportModel into a 2-page A4 PDF that preserves the Al Mumtaz
// "Service Completion Report" visual DNA (maroon + gold, serif title, numbered
// section headers, gold certification strip, guarantee footer) while presenting
// the content as a READ-ONLY report: no checkboxes, auto-filled label→value,
// empty fields/sections omitted.
//
// Fully offline: jsPDF, the cached logo, canvas-rendered trend chart, the QR
// code, and canvas-shaped Arabic all work with zero network.

import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import {
  COMPANY,
  DEFAULT_BOILERPLATE,
  type ChemicalRow,
  type ReportModel,
  type TrendPoint,
} from "./model";

// ---- Palette (from the letterhead) --------------------------------------
const MAROON = "#A31E22";
const MAROON_DK = "#7E1519";
const GOLD = "#9A7B33";
const GOLD_LT = "#C7B084";
const INK = "#1A1A1A";
const LABEL = "#8C8C8C";
const HAIR = "#E4E1DC";

// ---- Page geometry (A4, points) -----------------------------------------
const PW = 595.28;
const PH = 841.89;
const M = 36; // margin
const CW = PW - M * 2; // content width

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = src;
  });
}

const has = (v: unknown): v is string | number =>
  v !== undefined && v !== null && String(v).trim() !== "";

// jsPDF's built-in fonts render most WinAnsi punctuation (em/en dash, curly
// quotes, bullet) correctly, but a few glyphs outside that set — notably arrows —
// corrupt the entire text run. Map just those; leave everything else intact.
const san = (s: string): string =>
  s
    .replace(/→/g, "->")
    .replace(/←/g, "<-")
    .replace(/↑/g, " up")
    .replace(/↓/g, " down");

interface Field {
  label: string;
  value?: string | number;
}
const present = (fields: Field[]) =>
  fields.filter((f) => has(f.value)).map((f) => ({ label: f.label, value: String(f.value) }));

class ReportDoc {
  doc: jsPDF;
  y = M;

  constructor() {
    this.doc = new jsPDF({ unit: "pt", format: "a4", compress: true });
  }

  // --- primitives ---------------------------------------------------------
  private label(text: string, x: number, y: number) {
    const d = this.doc;
    d.setFont("helvetica", "bold");
    d.setFontSize(6);
    d.setTextColor(LABEL);
    d.setCharSpace(0.4);
    d.text(text.toUpperCase(), x, y);
    d.setCharSpace(0);
  }
  private value(text: string, x: number, y: number, maxW: number, size = 9): number {
    const d = this.doc;
    d.setFont("helvetica", "normal");
    d.setFontSize(size);
    d.setTextColor(INK);
    const lines = d.splitTextToSize(san(text), maxW);
    d.text(lines, x, y);
    return lines.length * (size + 2);
  }

  private hairline(y: number, x0 = M, x1 = PW - M, color = HAIR) {
    const d = this.doc;
    d.setDrawColor(color);
    d.setLineWidth(0.5);
    d.line(x0, y, x1, y);
  }

  // Numbered maroon section header (small-caps, letter-spaced) + gold underline.
  private sectionHeader(n: number, title: string) {
    const d = this.doc;
    if (this.y > PH - 90) this.pageBreakGuard();
    this.y += 6;
    const s = 13; // badge size
    d.setFillColor(MAROON);
    d.roundedRect(M, this.y - s + 2, s, s, 1.5, 1.5, "F");
    d.setFont("helvetica", "bold");
    d.setFontSize(7.5);
    d.setTextColor("#FFFFFF");
    d.text(String(n), M + s / 2, this.y + 1, { align: "center" });
    d.setTextColor(MAROON);
    d.setFontSize(9.5);
    d.setCharSpace(0.8);
    d.text(title.toUpperCase(), M + s + 8, this.y);
    d.setCharSpace(0);
    this.y += 5;
    this.hairline(this.y, M, PW - M, GOLD_LT);
    this.y += 14;
  }

  private pageBreakGuard() {
    // Only used defensively; the layout targets exactly two pages.
    this.doc.addPage();
    this.y = M;
  }

  // A responsive label→value grid. Only present fields are passed in; empties
  // never reach here. `cols` cells per row; each cell = micro label + value.
  private grid(fields: Field[], cols = 3) {
    const items = present(fields);
    if (items.length === 0) return;
    const d = this.doc;
    const colW = CW / cols;
    let i = 0;
    while (i < items.length) {
      const rowItems = items.slice(i, i + cols);
      // measure tallest cell in this row
      let rowH = 0;
      const cellHeights = rowItems.map((it) => {
        d.setFont("helvetica", "normal");
        d.setFontSize(9);
        const lines = d.splitTextToSize(it.value, colW - 10);
        const h = 8 + lines.length * 11;
        rowH = Math.max(rowH, h);
        return h;
      });
      void cellHeights;
      rowItems.forEach((it, c) => {
        const x = M + c * colW;
        this.label(it.label, x, this.y);
        this.value(it.value, x, this.y + 11, colW - 10, 9);
      });
      this.y += rowH + 4;
      this.hairline(this.y - 2);
      this.y += 4;
      i += cols;
    }
  }

  // A labelled paragraph block (findings, recommendations, notes).
  private paragraph(label: string, text?: string, accent = GOLD) {
    if (!has(text)) return;
    const d = this.doc;
    d.setFillColor(accent);
    const startY = this.y;
    this.label(label, M + 8, this.y);
    this.y += 12;
    const h = this.value(String(text), M + 8, this.y, CW - 16, 9);
    this.y += h + 8;
    // left accent bar
    d.setFillColor(accent);
    d.rect(M, startY - 8, 2.2, this.y - startY + 2, "F");
    this.y += 4;
  }

  private chips(label: string, items?: string[]) {
    if (!items || items.length === 0) return;
    const d = this.doc;
    this.label(label, M, this.y);
    this.y += 12;
    let x = M;
    const padX = 7,
      h = 15,
      gap = 5;
    d.setFontSize(8);
    d.setFont("helvetica", "normal");
    items.forEach((raw) => {
      const it = san(raw);
      const w = d.getTextWidth(it) + padX * 2;
      if (x + w > PW - M) {
        x = M;
        this.y += h + gap;
      }
      d.setFillColor("#F6F1E9");
      d.setDrawColor(GOLD_LT);
      d.setLineWidth(0.5);
      d.roundedRect(x, this.y - h + 4, w, h, 3, 3, "FD");
      d.setTextColor(MAROON_DK);
      d.text(it, x + padX, this.y + 1);
      x += w + gap;
    });
    this.y += h + 6;
  }

  // ---- header band -------------------------------------------------------
  async header(logo?: HTMLImageElement) {
    const d = this.doc;
    const top = M;
    if (logo) {
      const w = 128;
      d.addImage(logo, "PNG", M, top, w, (logo.height / logo.width) * w);
    }
    // centered title block
    d.setFont("helvetica", "bold");
    d.setFontSize(7.5);
    d.setTextColor(GOLD);
    d.setCharSpace(1.2);
    d.text(COMPANY.tagline, PW / 2, top + 14, { align: "center" });
    d.setCharSpace(0);
    d.setFont("times", "bold");
    d.setFontSize(22);
    d.setTextColor(MAROON);
    d.text(COMPANY.title, PW / 2, top + 38, { align: "center" });
    d.setFont("helvetica", "normal");
    d.setFontSize(6.5);
    d.setTextColor(LABEL);
    d.text(COMPANY.legalName, PW / 2, top + 50, { align: "center" });
    // right contact block
    const rx = PW - M;
    d.setFont("helvetica", "normal");
    d.setFontSize(6.5);
    d.setTextColor(LABEL);
    d.text("TOLL FREE", rx, top + 8, { align: "right" });
    d.setFont("times", "bold");
    d.setFontSize(15);
    d.setTextColor(MAROON);
    d.text(COMPANY.tollFree, rx, top + 24, { align: "right" });
    d.setFont("helvetica", "normal");
    d.setFontSize(6.5);
    d.setTextColor(GOLD);
    d.text(`${COMPANY.email}  |  ${COMPANY.web}`, rx, top + 38, { align: "right" });
    d.setTextColor(LABEL);
    d.text(`${COMPANY.phone}  |  ${COMPANY.poBox}`, rx, top + 48, { align: "right" });

    this.y = top + 66;
    this.hairline(this.y);
    this.y += 12;

    // gold certification strip
    d.setFont("helvetica", "bold");
    d.setFontSize(6);
    d.setTextColor(GOLD);
    d.setCharSpace(0.4);
    d.text(COMPANY.certifications.join("    ·    "), PW / 2, this.y, { align: "center" });
    d.setCharSpace(0);
    this.y += 8;
    this.hairline(this.y);
    this.y += 8;
  }

  // compact running header for page 2
  runningHeader(model: ReportModel) {
    const d = this.doc;
    d.setFont("times", "bold");
    d.setFontSize(12);
    d.setTextColor(MAROON);
    d.text(COMPANY.title, M, M + 6);
    d.setFont("helvetica", "normal");
    d.setFontSize(7);
    d.setTextColor(LABEL);
    const bits = [
      model.customer.displayName,
      model.customer.accountNo && `Ref ${model.customer.accountNo}`,
      model.identification.contractNo && `Contract ${model.identification.contractNo}`,
    ].filter(Boolean);
    d.text(san(bits.join("   ·   ")), PW - M, M + 6, { align: "right" });
    this.y = M + 16;
    this.hairline(this.y, M, PW - M, GOLD_LT);
    this.y += 14;
  }

  footer() {
    const d = this.doc;
    const pages = d.getNumberOfPages();
    for (let p = 1; p <= pages; p++) {
      d.setPage(p);
      d.setFont("helvetica", "italic");
      d.setFontSize(5.8);
      d.setTextColor(LABEL);
      d.text(COMPANY.footer, PW / 2, PH - 18, { align: "center" });
      d.setFont("helvetica", "normal");
      d.text(`Page ${p} of ${pages}`, PW - M, PH - 18, { align: "right" });
    }
  }

  // ---- content sections --------------------------------------------------
  sectionIdentification(m: ReportModel) {
    const id = m.identification;
    const fields: Field[] = [
      { label: "Record / Job No.", value: id.jobNo },
      { label: "Contract No.", value: id.contractNo },
      {
        label: "Visit No.",
        value:
          has(id.visitNo) && has(id.visitOf)
            ? `${id.visitNo} of ${id.visitOf}`
            : id.visitNo,
      },
      { label: "Invoice No.", value: id.invoiceNo },
      { label: "Service Date", value: id.serviceDate },
      { label: "Time In", value: id.timeIn },
      { label: "Time Out", value: id.timeOut },
      { label: "Service Order Type", value: id.serviceOrderType },
      { label: "Service Category", value: id.serviceCategory },
      { label: "Contract Type", value: id.contractType },
    ];
    if (present(fields).length === 0) return;
    this.sectionHeader(1, "Job Reference & Identification");
    this.grid(fields, 4);
  }

  sectionCustomer(m: ReportModel) {
    const c = m.customer;
    const nameVal = c.legalNameSecondary
      ? `${c.displayName}\n${c.legalNameSecondary}`
      : c.displayName;
    const fields: Field[] = [
      { label: "Customer / Company Name", value: nameVal },
      { label: "Account No.", value: c.accountNo },
      { label: "TRN / VAT No.", value: c.trn },
      { label: "Chain / Group", value: c.chainGroup },
      { label: "Building / Unit / Floor", value: c.building },
      { label: "Branch", value: c.branchName ?? c.branchId },
      { label: "Site Reference", value: c.siteRef },
      { label: "Street / Community", value: c.street },
      { label: "Area / Locality", value: c.area },
      { label: "Emirate / City", value: c.emirate },
      { label: "PO Box", value: c.poBox },
      { label: "Address", value: c.street || c.area ? undefined : c.addressLine },
      { label: "Contact (Primary)", value: c.contactPrimary },
      { label: "Contact (Secondary / WhatsApp)", value: c.contactSecondary },
      { label: "Email", value: c.email },
      { label: "On-site Representative", value: c.rep?.name },
      { label: "Designation", value: c.rep?.designation },
      { label: "Rep. Contact", value: c.rep?.contact },
    ];
    if (present(fields).length === 0) return;
    this.sectionHeader(2, "Customer Details");
    this.grid(fields, 3);
  }

  sectionTeam(m: ReportModel) {
    const t = m.team;
    const techs = (t.technicians ?? []).map((x) =>
      x.badge ? `${x.name} (${x.badge})` : x.name,
    );
    const fields: Field[] = [
      { label: "Supervisor", value: t.supervisor?.name },
      { label: "Supervisor Badge", value: t.supervisor?.badge },
      { label: "Team Size", value: t.teamSize },
    ];
    if (present(fields).length === 0 && techs.length === 0) return;
    this.sectionHeader(3, "Service Team");
    this.grid(fields, 3);
    this.chips("Technicians", techs.length ? techs : undefined);
  }

  sectionPremisesAndFindings(m: ReportModel) {
    const f = m.findings;
    if (!has(m.premisesType) && !f.pestsObserved?.length && !f.noPestActivity &&
        !has(f.infestationLevel) && !has(f.hygieneScore) && !has(f.structuralScore)) {
      return;
    }
    this.sectionHeader(4, "Premises, Pest Activity & Condition");
    this.grid(
      [
        { label: "Premises Type", value: m.premisesType },
        { label: "Infestation Level", value: f.infestationLevel },
        {
          label: "Hygiene Score",
          value: has(f.hygieneScore) ? `${f.hygieneScore} / 5` : undefined,
        },
        {
          label: "Structural Score",
          value: has(f.structuralScore) ? `${f.structuralScore} / 5` : undefined,
        },
      ],
      4,
    );
    if (f.noPestActivity) {
      this.chips("Pest Activity", ["No pest activity observed"]);
    } else {
      this.chips("Pest Activity Observed", f.pestsObserved);
    }
    if (m.scalesAssumed && (has(f.hygieneScore) || has(f.structuralScore) || has(f.infestationLevel))) {
      this.assumedFlag("Hygiene / structural / infestation scales are ASSUMED defaults, pending confirmation.");
    }
  }

  sectionTreatment(m: ReportModel) {
    const t = m.treatment;
    const hasChem = (t.chemicals ?? []).some((c) => hasChemRow(c));
    if (!t.areas?.length && !has(t.specificAreas) && !has(t.accessRestrictions) &&
        !t.methods?.length && !hasChem) {
      return;
    }
    this.sectionHeader(5, "Treatment Areas & Chemicals");
    this.chips("Treatment Areas", t.areas);
    this.grid(
      [
        { label: "Specific Areas Treated", value: t.specificAreas },
        { label: "Access Restrictions", value: t.accessRestrictions },
      ],
      2,
    );
    this.chips("Treatment Method", t.methods);
    if (hasChem) this.chemicalsTable(t.chemicals!);
    this.grid(
      [
        { label: "PPE Used", value: t.ppe },
        { label: "Storage / Disposal", value: t.storageDisposal },
        { label: "Re-entry / Safety", value: t.reentry },
      ],
      3,
    );
  }

  private chemicalsTable(rows: ChemicalRow[]) {
    const d = this.doc;
    const cols: { key: keyof ChemicalRow; label: string; w: number }[] = [];
    const maybe = (key: keyof ChemicalRow, label: string, w: number) => {
      if (rows.some((r) => has(r[key]))) cols.push({ key, label, w });
    };
    maybe("product", "Product", 0);
    maybe("activeIngredient", "Active Ingredient", 0);
    maybe("concentration", "Conc.", 0);
    maybe("dosage", "Dosage", 0);
    maybe("batchNo", "Batch", 0);
    maybe("dilution", "Dilution", 0);
    maybe("method", "Method", 0);
    maybe("targetPest", "Target Pest", 0);
    if (cols.length === 0) return;
    // distribute widths (product/active get more)
    const weights = cols.map((c) =>
      c.key === "product" || c.key === "activeIngredient" ? 2 : 1,
    );
    const wsum = weights.reduce((a, b) => a + b, 0);
    cols.forEach((c, i) => (c.w = (weights[i] / wsum) * CW));

    this.y += 2;
    // header
    d.setFillColor("#F6F1E9");
    d.rect(M, this.y - 9, CW, 14, "F");
    d.setFont("helvetica", "bold");
    d.setFontSize(6);
    d.setTextColor(MAROON);
    let x = M;
    cols.forEach((c) => {
      d.text(c.label.toUpperCase(), x + 3, this.y);
      x += c.w;
    });
    this.y += 8;
    // rows
    d.setFont("helvetica", "normal");
    d.setFontSize(8);
    d.setTextColor(INK);
    rows.filter(hasChemRow).forEach((r) => {
      let rowH = 12;
      const cells = cols.map((c) => {
        const lines = d.splitTextToSize(san(String(r[c.key] ?? "")), c.w - 6);
        rowH = Math.max(rowH, lines.length * 10 + 4);
        return lines;
      });
      x = M;
      cols.forEach((c, i) => {
        d.text(cells[i], x + 3, this.y + 2);
        x += c.w;
      });
      this.y += rowH;
      this.hairline(this.y - 4);
    });
    this.y += 6;
  }

  photos(m: ReportModel) {
    if (!m.photos?.length) return;
    this.label("Photos", M, this.y);
    this.y += 8;
    const d = this.doc;
    const size = 76,
      gap = 8;
    let x = M;
    m.photos.slice(0, 6).forEach((p) => {
      if (x + size > PW - M) {
        x = M;
        this.y += size + gap;
      }
      try {
        d.addImage(p.dataUrl, "JPEG", x, this.y, size, size);
        d.setDrawColor(HAIR);
        d.rect(x, this.y, size, size);
      } catch {
        /* photo optional */
      }
      x += size + gap;
    });
    this.y += size + 10;
  }

  private assumedFlag(text: string) {
    const d = this.doc;
    d.setFont("helvetica", "italic");
    d.setFontSize(6.5);
    d.setTextColor(GOLD);
    d.text(`ⓘ ${text}`, M, this.y);
    this.y += 12;
  }

  // ---- Page 2 ------------------------------------------------------------
  async sectionTrend(m: ReportModel) {
    this.sectionHeader(6, "Trend Analysis");
    const d = this.doc;
    const hist = m.trend.history ?? [];
    if (hist.length < 3) {
      // Never draw an empty chart (spec).
      d.setFillColor("#FAF8F5");
      d.setDrawColor(GOLD_LT);
      d.setLineWidth(0.5);
      d.roundedRect(M, this.y - 6, CW, 40, 3, 3, "FD");
      d.setFont("helvetica", "normal");
      d.setFontSize(9);
      d.setTextColor(MAROON_DK);
      d.text(
        "Baseline assessment — trend data available from visit 3.",
        PW / 2,
        this.y + 16,
        { align: "center" },
      );
      this.y += 46;
      return;
    }
    // chart on the left, summary on the right
    const chartW = CW * 0.62,
      chartH = 120;
    const chart = trendChart(hist, chartW, chartH);
    d.addImage(chart, "PNG", M, this.y, chartW, chartH);
    const sx = M + chartW + 16;
    // summary fields (manually, to sit beside the chart)
    let sy = this.y + 6;
    const put = (label: string, value?: string) => {
      if (!has(value)) return;
      this.label(label, sx, sy);
      d.setFont("helvetica", "normal");
      d.setFontSize(9);
      d.setTextColor(INK);
      d.text(san(String(value)), sx, sy + 11);
      sy += 26;
    };
    put("Infestation Trend", m.trend.infestationTrend);
    put("Hygiene Trend", m.trend.hygieneTrend);
    put("Most Flagged Issue", m.trend.mostFlaggedIssue);
    if (m.trend.overallStatus) {
      // status badge
      const color =
        m.trend.overallStatus === "Improving"
          ? "#2E7D32"
          : m.trend.overallStatus === "Deteriorating"
            ? MAROON
            : GOLD;
      this.label("Overall Status", sx, sy);
      d.setFillColor(color);
      d.roundedRect(sx, sy + 3, 84, 15, 3, 3, "F");
      d.setTextColor("#FFFFFF");
      d.setFont("helvetica", "bold");
      d.setFontSize(8);
      d.text(m.trend.overallStatus.toUpperCase(), sx + 42, sy + 13, { align: "center" });
      sy += 26;
    }
    this.y = Math.max(this.y + chartH, sy) + 8;
    // legend
    d.setFont("helvetica", "normal");
    d.setFontSize(6.5);
    d.setTextColor(LABEL);
    d.text("● Infestation   ● Hygiene   ● Structural", M, this.y);
    this.y += 12;
  }

  sectionObservations(m: ReportModel) {
    if (!has(m.observations) && !has(m.recommendations) && !has(m.carriedForward)) return;
    this.sectionHeader(7, "Observations, Findings & Recommendations");
    this.paragraph("Findings & Hygiene Observations", m.observations, GOLD);
    this.paragraph("Recommended Corrective Actions", m.recommendations, MAROON);
    this.paragraph("Carried Forward From Previous Visit", m.carriedForward, GOLD);
  }

  sectionRegulatory(m: ReportModel) {
    const bp = { ...DEFAULT_BOILERPLATE, ...m.boilerplate };
    this.sectionHeader(8, "Regulatory & Compliance");
    this.paragraph("Regulatory Notes", m.regulatoryNotes, MAROON);
    this.paragraph("Post-Treatment Instructions", bp.postTreatment, GOLD);
    this.paragraph("Municipality Compliance", bp.municipality, GOLD);
    this.paragraph("Guarantee Clause", bp.guarantee, MAROON);
  }

  async sectionSignatures(m: ReportModel) {
    this.sectionHeader(9, "Confirmation & Signatures");
    const d = this.doc;
    d.setFont("helvetica", "normal");
    d.setFontSize(7.5);
    d.setTextColor(INK);
    const intro = d.splitTextToSize(
      "I / We, the client, confirm that the above-described pest control services have been carried out satisfactorily on the premises stated. If any complaint, please call within one month of service date.",
      CW,
    );
    d.text(intro, M, this.y);
    this.y += intro.length * 10 + 10;

    const cellW = CW / 4;
    const cellH = 70;
    const boxes: { label: string; sig?: string; name?: string; qr?: string }[] = [
      {
        label: "Client / Rep. Name",
        name: m.signatures.customer?.name,
      },
      {
        label: "Client Signature & Date",
        sig: m.signatures.customer?.dataUrl,
      },
      {
        label: "Technician / Supervisor",
        sig: m.signatures.technician?.dataUrl ?? m.signatures.supervisor?.dataUrl,
        name: m.signatures.technician?.name ?? m.signatures.supervisor?.name,
      },
      {
        label: "Company Stamp / QR",
        qr: m.meta.verifyUrl ? await qrDataUrl(m.meta.verifyUrl) : undefined,
      },
    ];
    boxes.forEach((b, i) => {
      const x = M + i * cellW;
      d.setDrawColor(HAIR);
      d.setLineWidth(0.5);
      d.rect(x, this.y, cellW - 8, cellH);
      this.label(b.label, x + 6, this.y + 12);
      if (b.sig) {
        try {
          d.addImage(b.sig, "PNG", x + 6, this.y + 18, cellW - 20, 34);
        } catch {
          /* optional */
        }
      }
      if (b.qr) {
        try {
          d.addImage(b.qr, "PNG", x + cellW - 8 - 48, this.y + 16, 44, 44);
        } catch {
          /* optional */
        }
      }
      if (b.name) {
        d.setFont("helvetica", "normal");
        d.setFontSize(8);
        d.setTextColor(INK);
        d.text(san(b.name), x + 6, this.y + cellH - 8);
      }
    });
    this.y += cellH + 8;
  }

  // preview/sample watermark
  sampleMark() {
    const d = this.doc;
    const pages = d.getNumberOfPages();
    for (let p = 1; p <= pages; p++) {
      d.setPage(p);
      d.saveGraphicsState();
      // @ts-expect-error setGState exists at runtime
      d.setGState(new d.GState({ opacity: 0.06 }));
      d.setFont("times", "bold");
      d.setFontSize(120);
      d.setTextColor(MAROON);
      d.text("SAMPLE", PW / 2, PH / 2, { align: "center", angle: 32 });
      d.restoreGraphicsState();
    }
  }
}

function hasChemRow(c: ChemicalRow): boolean {
  return Object.values(c).some((v) => has(v));
}

// Offline QR code as a PNG data URL.
async function qrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, { margin: 1, width: 160, color: { dark: "#1A1A1A", light: "#FFFFFF" } });
}

// Offline trend chart drawn on a canvas → PNG data URL.
function trendChart(history: TrendPoint[], w: number, h: number): string {
  const scale = 3;
  const canvas = document.createElement("canvas");
  canvas.width = w * scale;
  canvas.height = h * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, w, h);
  const padL = 22,
    padR = 8,
    padT = 10,
    padB = 18;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  // y axis 0..5 (covers infestation 0-4 and scores 1-5)
  const yMax = 5;
  const yFor = (v: number) => padT + plotH - (v / yMax) * plotH;
  const xFor = (i: number) =>
    padL + (history.length === 1 ? plotW / 2 : (i / (history.length - 1)) * plotW);
  // gridlines
  ctx.strokeStyle = "#EEE9E1";
  ctx.lineWidth = 0.5;
  ctx.fillStyle = "#B0AAA0";
  ctx.font = "7px system-ui, sans-serif";
  for (let g = 0; g <= yMax; g++) {
    const y = yFor(g);
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(w - padR, y);
    ctx.stroke();
    ctx.fillText(String(g), 6, y + 2);
  }
  // x labels
  ctx.fillStyle = "#8C8C8C";
  history.forEach((p, i) => {
    ctx.fillText(p.visitLabel, xFor(i) - 6, h - 6);
  });
  const series: { key: keyof TrendPoint; color: string }[] = [
    { key: "infestation", color: "#A31E22" },
    { key: "hygiene", color: "#2E7D32" },
    { key: "structural", color: "#9A7B33" },
  ];
  series.forEach((s) => {
    const pts = history
      .map((p, i) => ({ i, v: p[s.key] as number | undefined }))
      .filter((p) => typeof p.v === "number");
    if (pts.length === 0) return;
    ctx.strokeStyle = s.color;
    ctx.fillStyle = s.color;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    pts.forEach((p, k) => {
      const x = xFor(p.i),
        y = yFor(p.v as number);
      if (k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    pts.forEach((p) => {
      ctx.beginPath();
      ctx.arc(xFor(p.i), yFor(p.v as number), 2.2, 0, Math.PI * 2);
      ctx.fill();
    });
  });
  return canvas.toDataURL("image/png");
}

export async function renderReport(
  model: ReportModel,
  opts?: { logoUrl?: string },
): Promise<Blob> {
  const r = new ReportDoc();
  let logo: HTMLImageElement | undefined;
  if (opts?.logoUrl) {
    try {
      logo = await loadImage(opts.logoUrl);
    } catch {
      /* logo optional */
    }
  }
  // Page 1
  await r.header(logo);
  r.sectionIdentification(model);
  r.sectionCustomer(model);
  r.sectionTeam(model);
  r.sectionPremisesAndFindings(model);
  r.sectionTreatment(model);
  r.photos(model);
  // Page 2
  r.doc.addPage();
  r.y = M;
  r.runningHeader(model);
  await r.sectionTrend(model);
  r.sectionObservations(model);
  r.sectionRegulatory(model);
  await r.sectionSignatures(model);

  r.footer();
  if (model.meta.sampleWatermark) r.sampleMark();
  return r.doc.output("blob");
}
