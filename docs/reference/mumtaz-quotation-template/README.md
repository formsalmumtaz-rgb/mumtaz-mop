# @mumtaz/quotation-template

Branded quotation renderer for the Mumtaz Operations Platform.

One JSON payload in → **HTML, PDF and DOCX** out, all three visually identical and all three carrying the letterhead (division logo + toll free), the repeating footer (legal name, group line, trade licence, three offices), and the sign-and-stamp block.

The template is **service-line agnostic**. Pest control, cleaning and FM all render from the same file; the `division` key swaps the logo and the default title.

---

## Quick start

```bash
npm install
npm test                 # 28 assertions, exits non-zero on failure
npm run example          # renders the Satguru quote into ./out
```

CLI:

```bash
node src/cli.js path/to/payload.json --out ./out
node src/cli.js payload.json --only pdf          # single format
```

Library:

```js
const { renderHtml, renderPdf, renderDocx, renderAll } = require('@mumtaz/quotation-template');

const { html } = renderHtml(payload);                    // string, assets inlined as data URIs
await renderDocx(payload, '/tmp/quote.docx');            // editable Word file
renderPdf(payload, '/tmp/quote.pdf');                    // requires `weasyprint` on PATH
const paths = await renderAll(payload, './out', 'Q-2026-0812');
```

---

## The contract

Full JSON Schema: [`schema/quotation.schema.json`](schema/quotation.schema.json). Working examples: [`examples/`](examples/).

Minimum viable payload — everything else has a sensible default:

```json
{
  "doc":    { "subject": "Pest Control Treatment — Quarterly Schedule" },
  "client": { "name": "M/s. Example Trading L.L.C." },
  "line_items": [ { "title": "Quarterly Treatment", "qty": 4, "rate": 750 } ]
}
```

### What you must NOT send

Line amounts, sub-total, VAT, grand total, amount-in-words and the summary badges are **computed by the renderer**. This is deliberate: if the caller could supply `amount`, a printed quotation could silently disagree with the database. `qty × rate` is recomputed every time and a caller-supplied `amount` is ignored (there's a test for it).

### Placeholders worth knowing

| Field | Effect |
|---|---|
| `division` | `pest_control` \| `cleaning` \| `facilities` — swaps logo, default title, default subtitle |
| `doc.ref_no` | Omit it and the document prints `DRAFT — NOT ISSUED` instead of a fake reference |
| `pricing.vat_rate` | Decimal, not percent. Defaults to `0.05` |
| `pricing.discount` | Absolute amount, applied to the sub-total **before** VAT |
| `line_items[].taxable` | `false` excludes the line from the VAT base (govt fees, disbursements) |
| `line_items[].counts_as_visit` | Feeds the auto "N Visits" badge |
| `line_items[].zero_label` | Prints e.g. `Included` instead of `0.00` |
| `warranty.months` | Drives both the warranty paragraph and the warranty badge |
| `badges` | Supply this to override the three auto-generated badges entirely |
| `doc.acceptance_note` | Set to `null` to suppress the acceptance callout |
| `credentials` | Omit to inherit the standard company credentials |

### Rich text

`doc.intro_paragraphs`, `doc.closing_paragraphs`, `doc.acceptance_note` and `warranty.text` accept inline `<b>`, `<i>`, `<br>`. Everything else is escaped. All four are run through an allow-list sanitiser — content arriving from the database (a rep typing into MOP) cannot inject markup. Every other field is escaped by Handlebars.

---

## Changing the brand, not the template

Letterhead, offices, licence number, accent colour and division logos live in `BRAND_DEFAULTS` / `DIVISIONS` at the top of [`src/normalize.js`](src/normalize.js). Change them once there and every document follows.

`brand_overrides` exists in the schema as an escape hatch for one-off letterheads. Avoid it in normal use — it's how documents drift out of sync.

**Open item:** the cleaning and facilities divisions currently point at the pest control logo (marked `TODO` in `normalize.js`). Drop `logo-cleaning.png` and `logo-facilities.png` into `assets/` and update the two paths.

---

## Mapping to MOP tables

The payload is intentionally close to a relational shape. Suggested wiring:

```
quotations                  → doc.*, client_id, division, vat_rate, discount, status
  quotation_line_items      → line_items[]     (fk quotation_id, sort_order)
  quotation_terms           → terms[]          (or a reusable terms_templates table)
  quotation_scope_items     → scope.items[]
customers                   → client.name (legal_name), client.trn
customer_addresses          → client.address_lines[]
users / staff               → signatory.name, signatory.title
```

Two notes specific to MOP:

- **Legal name and TRN.** `client.name` should read from the customer's *legal* name, not the trading name, and `client.trn` should be populated once the TRN backfill lands. Both matter for the e-invoicing deadline of 1 July 2027 — the same quotation record is the natural upstream of the tax invoice.
- **Ref numbers.** Generate `doc.ref_no` from a Postgres sequence per division rather than in application code, so two concurrent users can't mint the same reference.

A worked handler:

```js
const { data: q } = await supabase
  .from('quotations')
  .select('*, customer:customers(*), line_items:quotation_line_items(*)')
  .eq('id', quotationId)
  .single();

const payload = {
  division: q.division,
  doc: {
    ref_no: q.ref_no,
    issue_date: q.issued_at,
    validity_days: q.validity_days,
    subject: q.subject,
    intro_paragraphs: q.intro_paragraphs,
  },
  client: {
    name: q.customer.legal_name,
    address_lines: [q.customer.address_line1, q.customer.city].filter(Boolean),
    trn: q.customer.trn,
  },
  pricing: { vat_rate: q.vat_rate, discount: q.discount },
  line_items: q.line_items
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(li => ({
      title: li.title,
      description: li.description,
      qty: li.qty,
      rate: li.unit_rate,
      counts_as_visit: li.counts_as_visit,
    })),
  terms: q.terms,
  signatory: { name: q.prepared_by_name, title: q.prepared_by_title },
};

const { model } = await renderDocx(payload, outPath);
// model.totals.total is the authoritative figure — write it back, don't recompute in SQL
```

Write `model.totals.total` back to the row after rendering. One calculation path, one number.

---

## PDF engine

PDF rendering shells out to **WeasyPrint** (`pip install weasyprint`). It was chosen over headless Chrome because it implements CSS `@page` margin boxes and `position: running()` correctly, which is what makes the header and footer repeat on every page. Puppeteer renders the body fine but drops the running letterhead.

If you'd rather not add a Python dependency to the Node service, two options:

1. Render HTML in Node and POST it to a small WeasyPrint sidecar (this is what the VPS setup suits).
2. Skip PDF entirely in-app — generate DOCX, and let the user export to PDF from Word.

HTML and DOCX have **no** Python dependency.

---

## Files

```
templates/quotation.hbs      the layout — edit here for wording/structure
src/compute.js               pure maths: amounts, VAT, totals, amount-in-words
src/normalize.js             brand constants, defaults, validation, sanitising
src/docx.js                  docx-js builder driven by the same model
src/render.js                public API
src/cli.js                   command-line entry
src/render.test.js           28 assertions, no test framework needed
schema/quotation.schema.json the input contract
examples/                    two working payloads (pest control, cleaning)
```

Both renderers consume the **same normalized model**, so a change to totals or wording logic in `normalize.js` lands in all three formats at once. Layout changes, though, have to be made twice — once in `quotation.hbs` and once in `docx.js`. That's the cost of Word being a genuinely editable format rather than a PDF export; it's worth re-reading `docx.js` alongside any template edit.
