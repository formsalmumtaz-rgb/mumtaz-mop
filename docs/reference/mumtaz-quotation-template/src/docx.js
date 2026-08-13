'use strict';

const fs = require('fs');
const {
  LineRuleType, Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow,
  TableCell, WidthType, BorderStyle, AlignmentType, ShadingType, Header, Footer,
  VerticalAlign, PageBreak, convertMillimetersToTwip,
} = require('docx');

const INK = '1C1C1C';
const MUTED = '5C5C5C';
const LINE = 'D8D3CC';
const CREAM = 'F6F1EA';
const SANS = 'Calibri';
const SERIF = 'Cambria';

const mm = convertMillimetersToTwip;
const CONTENT_W = mm(178); // A4 210 - 16 - 16

const NO_B = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const noBorders = { top: NO_B, bottom: NO_B, left: NO_B, right: NO_B, insideHorizontal: NO_B, insideVertical: NO_B };
const thin = (color = LINE, size = 4) => ({ style: BorderStyle.SINGLE, size, color });

const hex = (c) => String(c || '#A31E22').replace('#', '').toUpperCase();

/** Strip the light inline HTML the template allows (<b>) into docx runs. */
function richRuns(str, base = {}) {
  const out = [];
  const re = /<b>(.*?)<\/b>/gis;
  let last = 0; let m;
  while ((m = re.exec(str)) !== null) {
    if (m.index > last) out.push(run(str.slice(last, m.index), base));
    out.push(run(m[1], { ...base, bold: true }));
    last = m.index + m[0].length;
  }
  if (last < str.length) out.push(run(str.slice(last), base));
  return out.length ? out : [run(str, base)];
}

function run(text, o = {}) {
  return new TextRun({
    text: String(text).replace(/<[^>]+>/g, ''),
    font: o.font || SANS,
    size: o.size || 19,
    bold: !!o.bold,
    italics: !!o.italics,
    color: o.color || INK,
    characterSpacing: o.spacing,
    allCaps: !!o.caps,
  });
}

function para(runs, o = {}) {
  return new Paragraph({
    children: Array.isArray(runs) ? runs : [runs],
    alignment: o.align,
    spacing: { before: o.before || 0, after: o.after === undefined ? 100 : o.after, line: o.line || 250 },
    border: o.border,
  });
}

function cell(children, o = {}) {
  return new TableCell({
    children,
    width: { size: o.w, type: WidthType.DXA },
    columnSpan: o.span,
    shading: o.fill ? { type: ShadingType.CLEAR, fill: o.fill, color: 'auto' } : undefined,
    borders: o.borders || noBorders,
    verticalAlign: o.valign || VerticalAlign.TOP,
    margins: o.margins || { top: mm(1.6), bottom: mm(1.6), left: mm(2.6), right: mm(2.6) },
  });
}

function heading(text, accent) {
  return new Paragraph({
    children: [run(text, { font: SERIF, size: 21, bold: true, color: accent, caps: true, spacing: 12 })],
    spacing: { before: 200, after: 90, line: 250 },
    border: { bottom: thin(LINE, 4) },
  });
}

const bullet = (t) => new Paragraph({
  children: [run(t, { size: 19 })],
  bullet: { level: 0 },
  spacing: { before: 0, after: 40, line: 250 },
});

const numbered = (t) => new Paragraph({
  children: [run(t, { size: 19 })],
  numbering: { reference: 'terms', level: 0 },
  spacing: { before: 0, after: 70, line: 250 },
});

/** Build the .docx from a NORMALIZED model (see src/normalize.js). */
async function buildDocx(m) {
  const ACCENT = hex(m.brand.accent_color);

  /* ---------- header ---------- */
  const header = new Header({
    children: [
      new Table({
        width: { size: CONTENT_W, type: WidthType.DXA },
        columnWidths: [mm(100), mm(78)],
        borders: noBorders,
        rows: [new TableRow({
          height: { value: mm(15), rule: 'atLeast' },
          children: [
            cell([new Paragraph({
              children: [new ImageRun({
                type: 'png',
                data: fs.readFileSync(m.brand.logo_src),
                transformation: { width: 166, height: 54 },
              })],
              spacing: { after: 0, before: 0, line: 240, lineRule: LineRuleType.AUTO },
            })], { w: mm(100), margins: { top: 0, bottom: 0, left: 0, right: 0 }, valign: VerticalAlign.CENTER }),
            cell([new Paragraph({
              children: [new ImageRun({
                type: 'png',
                data: fs.readFileSync(m.brand.toll_free_src),
                transformation: { width: 113, height: 54 },
              })],
              alignment: AlignmentType.RIGHT,
              spacing: { after: 0, before: 0, line: 240, lineRule: LineRuleType.AUTO },
            })], { w: mm(78), margins: { top: 0, bottom: 0, left: 0, right: 0 }, valign: VerticalAlign.CENTER }),
          ],
        })],
      }),
      new Paragraph({ children: [run('', { size: 2 })], spacing: { before: 60, after: 0 }, border: { bottom: { style: BorderStyle.SINGLE, size: 18, color: ACCENT } } }),
      new Paragraph({ children: [run('', { size: 2 })], spacing: { before: 20, after: 0 }, border: { bottom: thin(LINE, 4) } }),
    ],
  });

  /* ---------- footer ---------- */
  const officeW = Math.floor(CONTENT_W / Math.max(m.brand.offices.length, 1));
  const footer = new Footer({
    children: [
      new Paragraph({ children: [run('', { size: 2 })], spacing: { after: 60 }, border: { bottom: thin(LINE, 4) } }),
      new Paragraph({
        children: [
          run(m.brand.legal_name, { font: SERIF, size: 16, color: ACCENT }),
          run(`   |   ${m.brand.group_line}   |   Est. ${m.brand.established}   |   Trade Licence ${m.brand.trade_licence}`, { size: 14, color: MUTED }),
        ],
        spacing: { after: 60, line: 220 },
      }),
      new Table({
        width: { size: CONTENT_W, type: WidthType.DXA },
        columnWidths: m.brand.offices.map(() => officeW),
        borders: noBorders,
        rows: [new TableRow({
          children: m.brand.offices.map((o) => cell([
            new Paragraph({ children: [run(o.city, { size: 13, bold: true, color: ACCENT, caps: true, spacing: 12 })], spacing: { after: 0, line: 220 } }),
            new Paragraph({ children: [run(o.line1, { size: 14, color: MUTED })], spacing: { after: 0, line: 220 } }),
            new Paragraph({ children: [run(o.line2, { size: 14, color: MUTED })], spacing: { after: 0, line: 220 } }),
          ], { w: officeW, margins: { top: 0, bottom: 0, left: 0, right: mm(4) } })),
        })],
      }),
    ],
  });

  /* ---------- pricing ---------- */
  const COLS = [mm(104), mm(16), mm(28), mm(30)];
  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      ['Description of Service', AlignmentType.LEFT],
      ['Qty', AlignmentType.CENTER],
      [`Rate (${m.pricing.currency})`, AlignmentType.RIGHT],
      [`Amount (${m.pricing.currency})`, AlignmentType.RIGHT],
    ].map(([t, a], i) => cell(
      [new Paragraph({ children: [run(t, { size: 15, bold: true, color: 'FFFFFF', caps: true, spacing: 12 })], alignment: a, spacing: { after: 0, line: 240 } })],
      { w: COLS[i], fill: ACCENT, margins: { top: mm(1.9), bottom: mm(1.9), left: mm(2.6), right: mm(2.6) } }
    )),
  });

  const itemRows = m.line_items.map((li) => {
    const b = { top: NO_B, bottom: thin(LINE, 4), left: NO_B, right: NO_B };
    const numP = (t) => [new Paragraph({ children: [run(t, { size: 19 })], alignment: AlignmentType.RIGHT, spacing: { after: 0, line: 250 } })];
    const desc = [new Paragraph({ children: [run(li.title, { size: 19, bold: true })], spacing: { after: 0, line: 250 } })];
    if (li.description) desc.push(new Paragraph({ children: [run(li.description, { size: 16, color: MUTED })], spacing: { after: 0, line: 240 } }));
    return new TableRow({
      children: [
        cell(desc, { w: COLS[0], borders: b }),
        cell([new Paragraph({ children: [run(String(li.qty), { size: 19 })], alignment: AlignmentType.CENTER, spacing: { after: 0, line: 250 } })], { w: COLS[1], borders: b }),
        cell(numP(li.rate_fmt), { w: COLS[2], borders: b }),
        cell(numP(li.amount_fmt), { w: COLS[3], borders: b }),
      ],
    });
  });

  const sumRow = (label, amt) => new TableRow({
    children: [
      cell([new Paragraph({ children: [run(label, { size: 19, color: MUTED })], alignment: AlignmentType.RIGHT, spacing: { after: 0, line: 240 } })],
        { w: COLS[0] + COLS[1] + COLS[2], span: 3, margins: { top: mm(1.1), bottom: mm(1.1), left: mm(2.6), right: mm(2.6) } }),
      cell([new Paragraph({ children: [run(amt, { size: 19 })], alignment: AlignmentType.RIGHT, spacing: { after: 0, line: 240 } })],
        { w: COLS[3], margins: { top: mm(1.1), bottom: mm(1.1), left: mm(2.6), right: mm(2.6) } }),
    ],
  });

  const totalRow = (label, amt) => {
    const b = { top: { style: BorderStyle.SINGLE, size: 10, color: ACCENT }, bottom: { style: BorderStyle.SINGLE, size: 10, color: ACCENT }, left: NO_B, right: NO_B };
    const mg = { top: mm(2.2), bottom: mm(2.2), left: mm(2.6), right: mm(2.6) };
    return new TableRow({
      children: [
        cell([new Paragraph({ children: [run(label, { font: SERIF, size: 23, bold: true, color: ACCENT })], spacing: { after: 0, line: 250 } })],
          { w: COLS[0] + COLS[1] + COLS[2], span: 3, fill: CREAM, borders: b, margins: mg }),
        cell([new Paragraph({ children: [run(amt, { font: SERIF, size: 23, bold: true, color: ACCENT })], alignment: AlignmentType.RIGHT, spacing: { after: 0, line: 250 } })],
          { w: COLS[3], fill: CREAM, borders: b, margins: mg }),
      ],
    });
  };

  const priceRows = [headerRow, ...itemRows, sumRow('Sub-Total', m.totals.subtotal_fmt)];
  if (m.totals.discount) priceRows.push(sumRow('Discount', `-${m.totals.discount_fmt}`));
  priceRows.push(sumRow(`VAT @ ${m.totals.vat_rate_pct}%`, m.totals.vat_fmt));
  priceRows.push(totalRow('Total Payable (Inclusive of VAT)', `${m.pricing.currency} ${m.totals.total_fmt}`));

  const priceTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: COLS,
    borders: noBorders,
    rows: priceRows,
  });

  /* ---------- badges ---------- */
  const badgeW = m.badges.length ? Math.floor(CONTENT_W / m.badges.length) : CONTENT_W;
  const badgeTable = m.badges.length ? new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: m.badges.map(() => badgeW),
    borders: noBorders,
    rows: [new TableRow({
      children: m.badges.map((b) => cell([
        new Paragraph({ children: [run(b.value, { font: SERIF, size: 21, bold: true, color: ACCENT })], alignment: AlignmentType.CENTER, spacing: { after: 20, line: 240 } }),
        new Paragraph({ children: [run(b.label, { size: 14, color: MUTED, caps: true, spacing: 16 })], alignment: AlignmentType.CENTER, spacing: { after: 0, line: 240 } }),
      ], { w: badgeW, borders: { top: thin(LINE, 4), bottom: thin(LINE, 4), left: thin(LINE, 4), right: thin(LINE, 4) }, margins: { top: mm(2.2), bottom: mm(2.2), left: mm(2), right: mm(2) } })),
    })],
  }) : null;

  /* ---------- signature ---------- */
  function sigCell(hd, name, role, withName, company, wid) {
    const dashed = { style: BorderStyle.DASHED, size: 4, color: 'C3BCB2' };
    const rule = '_'.repeat(28);
    const kids = [
      new Paragraph({ children: [run(hd, { size: 14, bold: true, color: ACCENT, caps: true, spacing: 16 })], spacing: { after: 60, line: 240 } }),
      new Table({
        width: { size: wid, type: WidthType.DXA },
        columnWidths: [wid],
        borders: noBorders,
        rows: [new TableRow({
          height: { value: mm(25), rule: 'atLeast' },
          children: [cell([
            new Paragraph({ children: [run('', { size: 18 })], spacing: { after: 0 } }),
            new Paragraph({ children: [run('', { size: 18 })], spacing: { after: 0 } }),
            new Paragraph({ children: [run('Signature & Company Stamp', { size: 13, color: 'A8A29A', caps: true, spacing: 14 })], alignment: AlignmentType.CENTER, spacing: { after: 0, line: 240 } }),
          ], { w: wid, borders: { top: dashed, bottom: dashed, left: dashed, right: dashed }, valign: VerticalAlign.BOTTOM })],
        })],
      }),
      new Paragraph({ children: [run('', { size: 6 })], spacing: { before: 80, after: 40 }, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: INK } } }),
      new Paragraph({ children: [run(name, { size: 19, bold: true })], spacing: { after: 0, line: 240 } }),
      new Paragraph({ children: [run(role, { size: 17, color: MUTED })], spacing: { after: 0, line: 240 } }),
    ];
    if (company) kids.push(new Paragraph({ children: [run(company, { size: 16, color: ACCENT })], spacing: { after: 0, line: 240 } }));
    if (withName) kids.push(new Paragraph({ children: [run('Name: ', { size: 17, color: MUTED }), run(rule, { size: 17, color: 'B8B2A9' })], spacing: { before: 110, after: 0, line: 240 } }));
    kids.push(new Paragraph({ children: [run('Date: ', { size: 17, color: MUTED }), run(rule, { size: 17, color: 'B8B2A9' })], spacing: { before: 110, after: 0, line: 240 } }));
    return cell(kids, { w: wid + mm(6), margins: { top: 0, bottom: 0, left: 0, right: mm(6) } });
  }

  const sigTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [mm(89), mm(89)],
    borders: noBorders,
    rows: [new TableRow({
      children: [
        sigCell(`For ${m.brand.legal_name}`, m.signatory.name, m.signatory.title, false, m.brand.legal_name, mm(83)),
        sigCell('Accepted for and on behalf of the Client', m.client.name, 'Authorised Signatory', true, null, mm(83)),
      ],
    })],
  });

  /* ---------- meta + client ---------- */
  const metaCell = (runs, align) => cell([para(runs, { align, after: 0 })], { w: mm(89), margins: { top: 0, bottom: 0, left: 0, right: 0 } });
  const metaTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [mm(89), mm(89)],
    borders: noBorders,
    rows: [
      new TableRow({ children: [
        metaCell([run('Ref. No: ', { bold: true }), run(m.doc.ref_no)]),
        metaCell([run('Date: ', { bold: true }), run(m.doc.issue_date)], AlignmentType.RIGHT),
      ] }),
      new TableRow({ children: [
        metaCell([run('Validity: ', { bold: true }), run(m.doc.validity_text)]),
        metaCell([run('Prepared by: ', { bold: true }), run(m.signatory.name)], AlignmentType.RIGHT),
      ] }),
    ],
  });

  const clientBlock = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [CONTENT_W],
    borders: noBorders,
    rows: [new TableRow({
      children: [cell([
        new Paragraph({ children: [run('Submitted to', { size: 14, color: MUTED, caps: true, spacing: 20 })], spacing: { after: 30, line: 240 } }),
        new Paragraph({ children: [run(m.client.name, { font: SERIF, size: 23, bold: true })], spacing: { after: 30, line: 250 } }),
        ...m.client.address_lines.map((l) => new Paragraph({ children: [run(l, { size: 18, color: '3A3A3A' })], spacing: { after: 0, line: 240 } })),
      ], {
        w: CONTENT_W,
        borders: { top: NO_B, bottom: NO_B, right: NO_B, left: { style: BorderStyle.SINGLE, size: 18, color: ACCENT } },
        margins: { top: 0, bottom: 0, left: mm(4), right: 0 },
      })],
    })],
  });

  /* ---------- assemble ---------- */
  const body = [
    metaTable,
    new Paragraph({ children: [run(m.doc.title, { font: SERIF, size: 32, color: ACCENT, caps: true, spacing: 30 })], alignment: AlignmentType.CENTER, spacing: { before: 220, after: 30, line: 260 } }),
    new Paragraph({ children: [run(m.doc.subtitle, { size: 15, color: MUTED, caps: true, spacing: 40 })], alignment: AlignmentType.CENTER, spacing: { after: 190, line: 240 } }),
    clientBlock,
    para([run('Subject: ', { bold: true, color: ACCENT }), run(m.doc.subject)], { before: 170, after: 120 }),
    para(run(m.doc.salutation), { after: 110 }),
    ...m.doc.intro_paragraphs.map((p) => para(richRuns(p), { align: AlignmentType.JUSTIFIED, after: 60 })),
  ];

  if (m.scope.items.length) {
    body.push(heading(m.scope.heading, ACCENT), ...m.scope.items.map(bullet));
  }
  if (m.premises.text) {
    body.push(heading(m.premises.heading, ACCENT), para(run(m.premises.text), { align: AlignmentType.JUSTIFIED, after: 60 }));
  }

  body.push(
    heading(m.pricing.heading, ACCENT),
    priceTable,
    para(run(m.totals.amount_in_words ? `Amount in words: ${m.totals.amount_in_words}` : '', { size: 16, italics: true, color: MUTED }), { before: 70, after: 0 }),
    new Paragraph({ children: [new PageBreak()] })
  );

  if (badgeTable) body.push(badgeTable);
  if (m.warranty.text) body.push(heading(m.warranty.heading, ACCENT), para(richRuns(m.warranty.text), { align: AlignmentType.JUSTIFIED, after: 60 }));
  if (m.terms.length) body.push(heading('Terms and Conditions', ACCENT), ...m.terms.map(numbered));
  if (m.credentials.length) body.push(heading(m.credentials_heading, ACCENT), ...m.credentials.map(bullet));

  m.doc.closing_paragraphs.forEach((p, i) => {
    body.push(para(richRuns(p), { before: i === 0 ? 150 : 0, align: AlignmentType.JUSTIFIED, after: 180 }));
  });

  body.push(sigTable);

  if (m.doc.acceptance_note) {
    body.push(new Table({
      width: { size: CONTENT_W, type: WidthType.DXA },
      columnWidths: [CONTENT_W],
      borders: noBorders,
      rows: [new TableRow({
        children: [cell([para(richRuns(m.doc.acceptance_note, { size: 17, color: MUTED }), { after: 0 })], {
          w: CONTENT_W, fill: 'FAF7F3',
          borders: { top: NO_B, bottom: NO_B, right: NO_B, left: { style: BorderStyle.SINGLE, size: 18, color: ACCENT } },
          margins: { top: mm(2.2), bottom: mm(2.2), left: mm(3), right: mm(3) },
        })],
      })],
    }));
  }

  const doc = new Document({
    numbering: {
      config: [{
        reference: 'terms',
        levels: [{
          level: 0, format: 'decimal', text: '%1.', alignment: AlignmentType.START,
          style: { paragraph: { indent: { left: mm(7), hanging: mm(5) } }, run: { color: ACCENT, bold: true } },
        }],
      }],
    },
    styles: {
      default: { document: { run: { font: SANS, size: 19, color: INK }, paragraph: { spacing: { line: 250, after: 100 } } } },
      paragraphStyles: [{ id: 'ListParagraph', name: 'List Paragraph', basedOn: 'Normal', quickFormat: true, paragraph: { indent: { left: mm(6), hanging: mm(4) } } }],
    },
    sections: [{
      properties: { page: { margin: { top: mm(35), right: mm(16), bottom: mm(29), left: mm(16), header: mm(9), footer: mm(9) } } },
      headers: { default: header },
      footers: { default: footer },
      children: body,
    }],
  });

  return Packer.toBuffer(doc);
}

module.exports = { buildDocx };
