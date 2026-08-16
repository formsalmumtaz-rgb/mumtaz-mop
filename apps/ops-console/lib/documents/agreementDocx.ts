import "server-only";
import {
  Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell,
  WidthType, BorderStyle, AlignmentType, ShadingType, Header, Footer,
  VerticalAlign, convertMillimetersToTwip,
} from "docx";

// Editable Word (.docx) Service Agreement generator. Adapted from the (now
// archived) brand/mumtaz-quotation-template docx.js, but rewired so ALL branding —
// division logo/label/accent and the legal block — comes from document_branding /
// document_brand_org (Art. XVIII: one source), and the figures come from the
// contract, not recomputed here. DOCX because agreements get negotiated and
// clauses amended in Word (the bilingual Sharjah Municipality schedules live
// there); this produces the branded, populated shell for the team to finish.
//
// docx headers/footers are section-level, so the letterhead + legal footer repeat
// on every page natively.

const INK = "1C1C1C";
const MUTED = "5C5C5C";
const LINE = "D8D3CC";
const SANS = "Calibri";
const SERIF = "Cambria";
const mm = convertMillimetersToTwip;
const CONTENT_W = mm(178);
const NO_B = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const noBorders = { top: NO_B, bottom: NO_B, left: NO_B, right: NO_B, insideHorizontal: NO_B, insideVertical: NO_B };
const thin = (color = LINE, size = 4) => ({ style: BorderStyle.SINGLE, size, color });
const hex = (c: string | null) => String(c || "#A31E22").replace("#", "").toUpperCase();

interface RunOpts { font?: string; size?: number; bold?: boolean; italics?: boolean; color?: string; spacing?: number; caps?: boolean }
const run = (text: string, o: RunOpts = {}) => new TextRun({
  text: String(text), font: o.font || SANS, size: o.size || 19, bold: !!o.bold,
  italics: !!o.italics, color: o.color || INK, characterSpacing: o.spacing, allCaps: !!o.caps,
});
interface ParaOpts { align?: (typeof AlignmentType)[keyof typeof AlignmentType]; before?: number; after?: number; line?: number; border?: unknown }
const para = (runs: TextRun[] | TextRun, o: ParaOpts = {}) => new Paragraph({
  children: Array.isArray(runs) ? runs : [runs],
  alignment: o.align,
  spacing: { before: o.before || 0, after: o.after === undefined ? 100 : o.after, line: o.line || 250 },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  border: o.border as any,
});
interface CellOpts { w?: number; span?: number; fill?: string; borders?: unknown; valign?: unknown; margins?: unknown }
const cell = (children: Paragraph[], o: CellOpts = {}) => new TableCell({
  children,
  width: o.w ? { size: o.w, type: WidthType.DXA } : undefined,
  columnSpan: o.span,
  shading: o.fill ? { type: ShadingType.CLEAR, fill: o.fill, color: "auto" } : undefined,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  borders: (o.borders as any) || noBorders,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  verticalAlign: (o.valign as any) || VerticalAlign.TOP,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  margins: (o.margins as any) || { top: mm(1.6), bottom: mm(1.6), left: mm(2.6), right: mm(2.6) },
});
const heading = (text: string, accent: string) => new Paragraph({
  children: [run(text, { font: SERIF, size: 21, bold: true, color: accent, caps: true, spacing: 12 })],
  spacing: { before: 200, after: 90, line: 250 },
  border: { bottom: thin(LINE, 4) },
});

export interface DocxImage { data: Buffer; w: number; h: number }
export interface AgreementDocxData {
  title: string;               // e.g. "Service Agreement"
  contractNumber: string;
  date: string;
  term: string;                // "01 Jan 2026 — 31 Dec 2026"
  frequency: string;
  serviceLine: string;
  currency: string;
  contractValue: string;
  client: { name: string; addressLines: string[] };
  scope: { serviceType: string; pricingModel: string; qty: string; unitPrice: string }[];
  brand: { name: string; label: string | null; accent: string; showTollFree: boolean };
  org: { legal_name: string; group_line: string | null; established: string | null; trade_licence: string | null; offices: { city: string; line1: string | null; line2: string | null }[] };
  signatory: { name: string; title: string };
  logo: DocxImage | null;
  tollFree: DocxImage | null;
  // Item 7 — the real content, resolved per emirate from settings (mig 092).
  entity: { legal_name_en: string; legal_name_ar: string; trade_licence: string; phone: string } | null;
  entityEmirate: string | null;
  client2: {
    trade_licence: string | null; activity: string | null; contact: string | null; emirate: string | null;
  };
  conditions: { en: string; ar: string }[];
  pests: { en: string; ar: string }[];
  premises: string | null;
  missing: string[];
}

// Arabic runs must be marked right-to-left or Word lays them out as LTR and the
// punctuation lands on the wrong side.
const ar = (text: string, o: RunOpts = {}) => new TextRun({
  text: String(text), font: o.font || SANS, size: o.size || 18, bold: !!o.bold,
  color: o.color || INK, rightToLeft: true,
});

const img = (a: DocxImage, targetWpx: number) =>
  new ImageRun({ type: "png", data: a.data, transformation: { width: targetWpx, height: Math.round((a.h / a.w) * targetWpx) } });

export async function buildAgreementDocx(d: AgreementDocxData): Promise<Buffer> {
  const ACCENT = hex(d.brand.accent);

  // ── Running header: division logo + toll-free + accent rule ────────────
  const header = new Header({
    children: [
      new Table({
        width: { size: CONTENT_W, type: WidthType.DXA },
        columnWidths: [mm(120), mm(58)],
        borders: noBorders,
        rows: [new TableRow({
          children: [
            cell([new Paragraph({ children: d.logo ? [img(d.logo, 150)] : [run(d.brand.name, { font: SERIF, size: 24, bold: true, color: ACCENT })], spacing: { after: 0 } })], { w: mm(120) }),
            cell([new Paragraph({ children: d.brand.showTollFree && d.tollFree ? [img(d.tollFree, 90)] : [run("")], alignment: AlignmentType.RIGHT, spacing: { after: 0 } })], { w: mm(58) }),
          ],
        })],
      }),
      new Paragraph({ children: [run("", { size: 2 })], spacing: { before: 60, after: 0 }, border: { bottom: { style: BorderStyle.SINGLE, size: 18, color: ACCENT } } }),
      new Paragraph({ children: [run("", { size: 2 })], spacing: { before: 20, after: 0 }, border: { bottom: thin(LINE, 4) } }),
    ],
  });

  // ── Running footer: legal entity + trade licence + offices ─────────────
  const legalRuns = [run(d.org.legal_name, { font: SERIF, size: 16, color: ACCENT })];
  const tail = [d.org.group_line, d.org.established ? `Est. ${d.org.established}` : null, d.org.trade_licence ? `Trade Licence ${d.org.trade_licence}` : null].filter(Boolean).join("   |   ");
  if (tail) legalRuns.push(run(`   |   ${tail}`, { size: 14, color: MUTED }));
  const ow = Math.floor(CONTENT_W / Math.max(d.org.offices.length, 1));
  const footer = new Footer({
    children: [
      new Paragraph({ children: [run("", { size: 2 })], spacing: { after: 60 }, border: { bottom: thin(LINE, 4) } }),
      new Paragraph({ children: legalRuns, spacing: { after: 40, line: 220 } }),
      new Table({
        width: { size: CONTENT_W, type: WidthType.DXA },
        columnWidths: d.org.offices.map(() => ow),
        borders: noBorders,
        rows: [new TableRow({
          children: d.org.offices.map((o) => cell([
            new Paragraph({ children: [run(o.city, { size: 13, bold: true, color: ACCENT, caps: true, spacing: 12 })], spacing: { after: 0, line: 220 } }),
            new Paragraph({ children: [run(o.line1 || "", { size: 14, color: MUTED })], spacing: { after: 0, line: 220 } }),
            new Paragraph({ children: [run(o.line2 || "", { size: 14, color: MUTED })], spacing: { after: 0, line: 220 } }),
          ], { w: ow, margins: { top: 0, bottom: 0, left: 0, right: mm(4) } })),
        })],
      }),
    ],
  });

  // ── Meta (ref + date) ──────────────────────────────────────────────────
  const metaCell = (runs: TextRun[], align?: (typeof AlignmentType)[keyof typeof AlignmentType]) =>
    cell([para(runs, { align, after: 0 })], { w: mm(89), margins: { top: 0, bottom: 0, left: 0, right: 0 } });
  const metaTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: [mm(89), mm(89)], borders: noBorders,
    rows: [
      new TableRow({ children: [metaCell([run("Agreement No: ", { bold: true }), run(d.contractNumber)]), metaCell([run("Date: ", { bold: true }), run(d.date)], AlignmentType.RIGHT)] }),
      new TableRow({ children: [metaCell([run("Term: ", { bold: true }), run(d.term)]), metaCell([run("Frequency: ", { bold: true }), run(d.frequency)], AlignmentType.RIGHT)] }),
    ],
  });

  // ── Parties ────────────────────────────────────────────────────────────
  const partiesTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: [mm(89), mm(89)], borders: noBorders,
    rows: [new TableRow({ children: [
      cell([
        new Paragraph({ children: [run("The Service Provider (First Party)", { size: 14, color: MUTED, caps: true, spacing: 20 })], spacing: { after: 30 } }),
        // The signing entity DIFFERS BY EMIRATE (Sharjah 546486 / Dubai 996625).
        // Printing the group name on a municipality-registered contract would be
        // a legal defect, so this comes from settings, resolved by the site.
        new Paragraph({ children: [run(d.entity?.legal_name_en ?? d.org.legal_name, { font: SERIF, size: 21, bold: true })], spacing: { after: 0, line: 250 } }),
        ...(d.entity ? [new Paragraph({ children: [ar(d.entity.legal_name_ar, { size: 16 })], alignment: AlignmentType.RIGHT, bidirectional: true, spacing: { after: 0, line: 240 } })] : []),
        new Paragraph({ children: [run(d.brand.name, { size: 16, color: ACCENT })], spacing: { after: 0, line: 240 } }),
        ...(d.entity ? [new Paragraph({ children: [run(`Trade Licence ${d.entity.trade_licence}  ·  ${d.entity.phone}`, { size: 15, color: MUTED })], spacing: { after: 0, line: 240 } })] : []),
      ], { w: mm(89), borders: { top: NO_B, bottom: NO_B, right: NO_B, left: { style: BorderStyle.SINGLE, size: 18, color: ACCENT } }, margins: { top: 0, bottom: 0, left: mm(4), right: mm(4) } }),
      cell([
        new Paragraph({ children: [run("The Contracted Establishment (Second Party)", { size: 14, color: MUTED, caps: true, spacing: 20 })], spacing: { after: 30 } }),
        new Paragraph({ children: [run(d.client.name, { font: SERIF, size: 21, bold: true })], spacing: { after: 0, line: 250 } }),
        ...d.client.addressLines.map((l) => new Paragraph({ children: [run(l, { size: 16, color: "3A3A3A" })], spacing: { after: 0, line: 240 } })),
        ...([
          d.client2.trade_licence ? `Trade Licence ${d.client2.trade_licence}` : null,
          d.client2.activity ? `Activity: ${d.client2.activity}` : null,
          d.client2.contact ? `Contact: ${d.client2.contact}` : null,
        ].filter(Boolean) as string[]).map((l) => new Paragraph({ children: [run(l, { size: 15, color: MUTED })], spacing: { after: 0, line: 240 } })),
      ], { w: mm(89), borders: { top: NO_B, bottom: NO_B, right: NO_B, left: { style: BorderStyle.SINGLE, size: 18, color: ACCENT } }, margins: { top: 0, bottom: 0, left: mm(4), right: mm(4) } }),
    ] })],
  });

  // ── Scope table ────────────────────────────────────────────────────────
  const COLS = [mm(86), mm(48), mm(18), mm(26)];
  const th = (t: string, a: (typeof AlignmentType)[keyof typeof AlignmentType], i: number) =>
    cell([new Paragraph({ children: [run(t, { size: 15, bold: true, color: "FFFFFF", caps: true, spacing: 12 })], alignment: a, spacing: { after: 0, line: 240 } })], { w: COLS[i], fill: ACCENT, margins: { top: mm(1.4), bottom: mm(1.4), left: mm(2.4), right: mm(2.4) } });
  const scopeHead = new TableRow({ children: [th("Service", AlignmentType.LEFT, 0), th("Pricing basis", AlignmentType.LEFT, 1), th("Qty", AlignmentType.CENTER, 2), th("Unit price", AlignmentType.RIGHT, 3)] });
  const b = { top: thin(LINE, 3), bottom: thin(LINE, 3), left: NO_B, right: NO_B, insideHorizontal: thin(LINE, 3), insideVertical: NO_B };
  const scopeRows = (d.scope.length ? d.scope : [{ serviceType: "(scope to be attached)", pricingModel: "", qty: "", unitPrice: "" }]).map((s) => new TableRow({
    children: [
      cell([new Paragraph({ children: [run(s.serviceType, { size: 18 })], spacing: { after: 0, line: 250 } })], { w: COLS[0], borders: b }),
      cell([new Paragraph({ children: [run(s.pricingModel, { size: 17, color: MUTED })], spacing: { after: 0, line: 250 } })], { w: COLS[1], borders: b }),
      cell([new Paragraph({ children: [run(s.qty, { size: 18 })], alignment: AlignmentType.CENTER, spacing: { after: 0, line: 250 } })], { w: COLS[2], borders: b }),
      cell([new Paragraph({ children: [run(s.unitPrice ? `${d.currency} ${s.unitPrice}` : "—", { size: 18 })], alignment: AlignmentType.RIGHT, spacing: { after: 0, line: 250 } })], { w: COLS[3], borders: b }),
    ],
  }));
  const scopeTable = new Table({ width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: COLS, borders: noBorders, rows: [scopeHead, ...scopeRows] });

  // ── Signatures ─────────────────────────────────────────────────────────
  const sigCell = (heading2: string, name: string, roleLine: string, wid: number) => {
    const rule = "_".repeat(30);
    return cell([
      new Paragraph({ children: [run(heading2, { size: 14, bold: true, color: ACCENT, caps: true, spacing: 16 })], spacing: { after: 220, line: 240 } }),
      new Paragraph({ children: [run("Name: ", { size: 17, color: MUTED }), run(rule, { size: 17, color: "B8B2A9" })], spacing: { after: 120, line: 240 } }),
      new Paragraph({ children: [run("Signature & stamp: ", { size: 17, color: MUTED }), run(rule, { size: 17, color: "B8B2A9" })], spacing: { after: 120, line: 240 } }),
      new Paragraph({ children: [run("Date: ", { size: 17, color: MUTED }), run(rule, { size: 17, color: "B8B2A9" })], spacing: { after: 60, line: 240 } }),
      ...(name ? [new Paragraph({ children: [run(name, { size: 17, bold: true }), run(`  ·  ${roleLine}`, { size: 16, color: MUTED })], spacing: { before: 60, after: 0, line: 240 } })] : []),
    ], { w: wid, margins: { top: 0, bottom: 0, left: 0, right: mm(6) } });
  };
  const sigTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: [mm(89), mm(89)], borders: noBorders,
    rows: [new TableRow({ children: [
      // The signature block names the SIGNING entity for this emirate, not the
      // group — it must match the first party named at the top of the document.
      sigCell(`For ${d.entity?.legal_name_en ?? d.org.legal_name}`, d.signatory.name, d.signatory.title, mm(83)),
      sigCell("Accepted for and on behalf of the Client", "", "Authorised Signatory", mm(83)),
    ] })],
  });

  // ── Targeted pests + Special conditions, English left / Arabic right ────
  // Two columns in one table so each clause sits beside its own translation,
  // exactly as the signed municipality contracts are laid out.
  const bilingualRow = (en: string, arText: string) => new TableRow({
    children: [
      cell([new Paragraph({ children: [run(en, { size: 17 })], spacing: { after: 0, line: 250 } })],
        { w: mm(89), borders: { top: NO_B, bottom: thin(LINE, 3), left: NO_B, right: NO_B }, margins: { top: mm(1.4), bottom: mm(1.4), left: 0, right: mm(3) } }),
      cell([new Paragraph({ children: [ar(arText, { size: 17 })], alignment: AlignmentType.RIGHT, bidirectional: true, spacing: { after: 0, line: 250 } })],
        { w: mm(89), borders: { top: NO_B, bottom: thin(LINE, 3), left: NO_B, right: NO_B }, margins: { top: mm(1.4), bottom: mm(1.4), left: mm(3), right: 0 } }),
    ],
  });
  const bilingualTable = (lines: { en: string; ar: string }[]) => new Table({
    width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: [mm(89), mm(89)], borders: noBorders,
    rows: lines.map((l) => bilingualRow(l.en, l.ar)),
  });

  const pestsBlock: (Paragraph | Table)[] = d.pests.length ? [
    new Paragraph({
      children: [
        run("Targeted pests", { font: SERIF, size: 21, bold: true, color: ACCENT, caps: true, spacing: 12 }),
        run("          "),
        ar("نوع الآفات المستهدفة", { size: 19, bold: true, color: ACCENT }),
      ],
      spacing: { before: 200, after: 90, line: 250 }, border: { bottom: thin(LINE, 4) },
    }),
    bilingualTable(d.pests),
  ] : [];

  const conditionsBlock: (Paragraph | Table)[] = d.conditions.length ? [
    new Paragraph({
      children: [
        run("Special conditions", { font: SERIF, size: 21, bold: true, color: ACCENT, caps: true, spacing: 12 }),
        run("          "),
        ar("شروط خاصة", { size: 19, bold: true, color: ACCENT }),
      ],
      spacing: { before: 200, after: 90, line: 250 }, border: { bottom: thin(LINE, 4) },
    }),
    bilingualTable(d.conditions),
    para(run(d.entityEmirate
      ? `These are the ${d.entityEmirate} conditions on record. Amend in Settings, not in this file, so every future agreement carries the change.`
      : "No emirate-specific conditions could be resolved for this contract.",
      { size: 14, color: MUTED, italics: true }), { before: 60, after: 0 }),
  ] : [];

  const body: (Paragraph | Table)[] = [
    metaTable,
    new Paragraph({ children: [run(d.title, { font: SERIF, size: 32, color: ACCENT, caps: true, spacing: 30 })], alignment: AlignmentType.CENTER, spacing: { before: 220, after: 20, line: 260 } }),
    new Paragraph({ children: [run(`${d.serviceLine}${d.brand.label && d.brand.label !== d.serviceLine ? ` · ${d.brand.label}` : ""}`, { size: 15, color: MUTED, caps: true, spacing: 40 })], alignment: AlignmentType.CENTER, spacing: { after: 180, line: 240 } }),
    partiesTable,
    heading("Scope of services", ACCENT),
    scopeTable,
    para([run("Contract value: ", { bold: true }), run(`${d.currency} ${d.contractValue}`, { bold: true, color: ACCENT }), run(`   (${d.frequency}; term ${d.term})`, { size: 16, color: MUTED })], { before: 140, after: 60 }),
    ...(d.premises ? [para([run("Premises covered: ", { bold: true }), run(d.premises), run("     "), ar("المناطق المشتملة", { size: 16, color: MUTED })], { after: 60 })] : []),
    ...pestsBlock,
    ...conditionsBlock,
    ...(d.missing.length ? [
      heading("Before this agreement is signed", ACCENT),
      ...d.missing.map((m) => para(run(`• ${m}`, { size: 17, color: "B3261E" }), { after: 60 })),
    ] : []),
    para([
      run("Both parties acknowledge the accuracy of the information stated herein.", { size: 17 }),
      run("     "),
      ar("اقر الطرفان بصحة المعلومات الواردة بهذا العقد", { size: 17 }),
    ], { before: 200, after: 140 }),
    sigTable,
  ];

  const doc = new Document({
    styles: { default: { document: { run: { font: SANS, size: 19, color: INK }, paragraph: { spacing: { line: 250, after: 100 } } } } },
    sections: [{
      properties: { page: { margin: { top: mm(35), right: mm(16), bottom: mm(29), left: mm(16), header: mm(9), footer: mm(9) } } },
      headers: { default: header },
      footers: { default: footer },
      children: body,
    }],
  });
  return Packer.toBuffer(doc);
}
