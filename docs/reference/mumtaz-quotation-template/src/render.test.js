'use strict';

/**
 * Zero-dependency test suite. Run: node src/render.test.js
 * Exits non-zero on failure so CI / the Proof-of-Work check can gate on it.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { computeTotals, amountInWords, money } = require('./compute');
const { normalize } = require('./normalize');
const { renderHtml } = require('./render');

let passed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (err) {
    failures.push({ name, err });
    console.log(`  FAIL  ${name}\n        ${err.message}`);
  }
}

console.log('\ncompute.js');

test('line amount = qty x rate', () => {
  const t = computeTotals([{ title: 'a', qty: 3, rate: 750 }]);
  assert.strictEqual(t.items[0].amount, 2250);
});

test('Satguru case: 750x1 + 750x2 + 150x1 = 2400 / VAT 120 / total 2520', () => {
  const t = computeTotals([
    { title: 'initial', qty: 1, rate: 750 },
    { title: 'follow-up', qty: 2, rate: 750 },
    { title: 'materials', qty: 1, rate: 150 },
  ]);
  assert.strictEqual(t.subtotal, 2400);
  assert.strictEqual(t.vat, 120);
  assert.strictEqual(t.total, 2520);
});

test('discount is applied before VAT', () => {
  const t = computeTotals([{ title: 'a', qty: 1, rate: 1000 }], { discount: 200 });
  assert.strictEqual(t.subtotal, 1000);
  assert.strictEqual(t.vat, 40); // 5% of 800, not of 1000
  assert.strictEqual(t.total, 840);
});

test('non-taxable lines are excluded from the VAT base', () => {
  const t = computeTotals([
    { title: 'service', qty: 1, rate: 1000 },
    { title: 'govt fee', qty: 1, rate: 500, taxable: false },
  ]);
  assert.strictEqual(t.subtotal, 1500);
  assert.strictEqual(t.vat, 50);
  assert.strictEqual(t.total, 1550);
});

test('rounding holds at 2dp (no floating point drift)', () => {
  const t = computeTotals([{ title: 'a', qty: 3, rate: 33.33 }]);
  assert.strictEqual(t.subtotal, 99.99);
  assert.strictEqual(t.vat, 5);
  assert.strictEqual(t.total, 104.99);
});

test('caller-supplied amount is ignored and recomputed', () => {
  const t = computeTotals([{ title: 'a', qty: 2, rate: 100, amount: 999999 }]);
  assert.strictEqual(t.items[0].amount, 200);
});

test('discount larger than sub-total throws', () => {
  assert.throws(() => computeTotals([{ title: 'a', qty: 1, rate: 100 }], { discount: 500 }), /exceeds/);
});

test('non-numeric rate throws with the line title', () => {
  assert.throws(() => computeTotals([{ title: 'Bad Line', qty: 1, rate: 'x' }]), /Bad Line/);
});

test('zero VAT rate is honoured (not defaulted to 5%)', () => {
  const t = computeTotals([{ title: 'a', qty: 1, rate: 1000 }], { vat_rate: 0 });
  assert.strictEqual(t.vat, 0);
  assert.strictEqual(t.total, 1000);
});

console.log('\namountInWords');

test('2520 -> Two Thousand Five Hundred and Twenty Dirhams Only.', () => {
  assert.strictEqual(amountInWords(2520), 'Two Thousand Five Hundred and Twenty Dirhams Only.');
});

test('787.50 includes fils', () => {
  assert.strictEqual(amountInWords(787.5), 'Seven Hundred and Eighty-Seven Dirhams and Fifty Fils Only.');
});

test('8715 -> Eight Thousand Seven Hundred and Fifteen', () => {
  assert.strictEqual(amountInWords(8715), 'Eight Thousand Seven Hundred and Fifteen Dirhams Only.');
});

test('116991 (DGE tender scale) reads correctly', () => {
  assert.strictEqual(amountInWords(116991), 'One Hundred and Sixteen Thousand Nine Hundred and Ninety-One Dirhams Only.');
});

test('money() adds thousands separators at 2dp', () => {
  assert.strictEqual(money(1500), '1,500.00');
  assert.strictEqual(money(0), '0.00');
});

console.log('\nnormalize.js');

const minimal = {
  doc: { subject: 'Test' },
  client: { name: 'Test Client L.L.C.' },
  line_items: [{ title: 'Service', qty: 1, rate: 100 }],
};

test('minimal payload normalizes without throwing', () => {
  const m = normalize(minimal);
  assert.strictEqual(m.totals.total, 105);
});

test('missing client.name throws a named error', () => {
  assert.throws(() => normalize({ ...minimal, client: {} }), /client\.name/);
});

test('missing doc.subject throws a named error', () => {
  assert.throws(() => normalize({ ...minimal, doc: {} }), /doc\.subject/);
});

test('unknown division throws and lists valid options', () => {
  assert.throws(() => normalize({ ...minimal, division: 'catering' }), /Known:/);
});

test('division swaps the title and logo', () => {
  const m = normalize({ ...minimal, division: 'cleaning' });
  assert.strictEqual(m.doc.title, 'Cleaning Services Quotation');
  assert.ok(m.brand.logo_src.endsWith('.png'));
});

test('brand defaults carry the legal name and all three offices', () => {
  const m = normalize(minimal);
  assert.strictEqual(m.brand.legal_name, 'Al Mumtaz Bldg Clean & Pest Control');
  assert.strictEqual(m.brand.offices.length, 3);
});

test('visit badge counts only lines flagged counts_as_visit', () => {
  const m = normalize({
    ...minimal,
    line_items: [
      { title: 'a', qty: 1, rate: 100, counts_as_visit: true },
      { title: 'b', qty: 2, rate: 100, counts_as_visit: true },
      { title: 'materials', qty: 1, rate: 50 },
    ],
    warranty: { months: 6 },
  });
  assert.ok(m.badges.some((b) => b.value === '3 Visits'));
});

test('ref_no omitted renders a visible DRAFT marker', () => {
  assert.match(normalize(minimal).doc.ref_no, /DRAFT/);
});

console.log('\nrender.js');

test('HTML contains no unresolved {{placeholders}}', () => {
  const { html } = renderHtml(require('../examples/satguru-pest-control.json'));
  const leftover = html.match(/\{\{[^}]+\}\}/g);
  assert.strictEqual(leftover, null, `unresolved: ${leftover && leftover.join(', ')}`);
});

test('HTML carries the computed total, not a placeholder', () => {
  const { html } = renderHtml(require('../examples/satguru-pest-control.json'));
  assert.ok(html.includes('2,520.00'));
  assert.ok(html.includes('Two Thousand Five Hundred and Twenty Dirhams Only.'));
});

test('client name is escaped everywhere, including interpolated rich text', () => {
  const { html } = renderHtml({
    ...minimal,
    client: { name: '<script>alert(1)</script>' },
  });
  assert.ok(!html.includes('<script>alert(1)</script>'), 'raw script tag leaked into output');
  assert.ok(html.includes('&lt;script&gt;'), 'expected escaped form to be present');
});

test('rich-text fields keep <b> but strip everything else', () => {
  const { html } = renderHtml({
    ...minimal,
    warranty: { text: 'Keep <b>this</b> drop <img src=x onerror=alert(1)>' },
  });
  assert.ok(html.includes('Keep <b>this</b>'), '<b> should survive');
  // NB: the letterhead legitimately contains <img> for the logos, so assert
  // on the injected payload specifically rather than on the tag name.
  assert.ok(!html.includes('onerror=alert(1)>'), 'img payload should be neutralised');
  assert.ok(html.includes('&lt;img src=x'), 'injected tag should appear escaped');
});

test('assets inline as base64 data URIs', () => {
  const { html } = renderHtml(require('../examples/satguru-pest-control.json'));
  assert.ok(html.includes('data:image/png;base64,'));
});

test('both shipped examples render', () => {
  for (const f of fs.readdirSync(path.join(__dirname, '..', 'examples'))) {
    if (!f.endsWith('.json')) continue;
    const { html } = renderHtml(require(path.join(__dirname, '..', 'examples', f)));
    assert.ok(html.length > 3000, `${f} produced suspiciously short output`);
  }
});

console.log(`\n${passed} passed, ${failures.length} failed\n`);
process.exit(failures.length ? 1 : 0);
