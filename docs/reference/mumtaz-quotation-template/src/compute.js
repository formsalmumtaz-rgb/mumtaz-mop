'use strict';

/**
 * Pure calculation helpers. No I/O, no side effects — safe to unit test
 * and safe to reuse anywhere in MOP (edge functions, jobs, API routes).
 */

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function underThousand(n) {
  if (n === 0) return '';
  if (n < 20) return ONES[n];
  if (n < 100) {
    const t = TENS[Math.floor(n / 10)];
    const r = n % 10;
    return r ? `${t}-${ONES[r]}` : t;
  }
  const h = `${ONES[Math.floor(n / 100)]} Hundred`;
  const r = n % 100;
  return r ? `${h} and ${underThousand(r)}` : h;
}

/** 2520 -> "Two Thousand Five Hundred and Twenty" */
function integerToWords(num) {
  if (num === 0) return 'Zero';
  const scales = [
    [1e9, 'Billion'],
    [1e6, 'Million'],
    [1e3, 'Thousand'],
  ];
  let out = [];
  let rest = num;
  for (const [value, name] of scales) {
    if (rest >= value) {
      out.push(`${integerToWords(Math.floor(rest / value))} ${name}`);
      rest %= value;
    }
  }
  if (rest > 0) {
    // "and" only when the tail is under 100 and something precedes it
    if (out.length && rest < 100) out.push('and');
    out.push(underThousand(rest));
  }
  return out.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * UAE convention: "Two Thousand Five Hundred and Twenty Dirhams Only."
 * With fils: "... Dirhams and Fifty Fils Only."
 */
function amountInWords(amount, { major = 'Dirhams', minor = 'Fils' } = {}) {
  const cents = Math.round(amount * 100);
  const whole = Math.floor(cents / 100);
  const frac = cents % 100;
  let s = `${integerToWords(whole)} ${major}`;
  if (frac > 0) s += ` and ${integerToWords(frac)} ${minor}`;
  return `${s} Only.`;
}

/** Thousands-separated, always 2dp. */
function money(n) {
  return Number(n).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/**
 * Computes line amounts and document totals.
 * Never trust an `amount` supplied by the caller — always recompute from
 * qty x rate so the printed document can't disagree with the database.
 *
 * @param {Array<{qty:number, rate:number, taxable?:boolean}>} lineItems
 * @param {{vat_rate?:number, discount?:number}} opts vat_rate as decimal (0.05)
 */
function computeTotals(lineItems, opts = {}) {
  const vatRate = opts.vat_rate === undefined ? 0.05 : Number(opts.vat_rate);
  const discount = round2(opts.discount || 0);

  const items = lineItems.map((li) => {
    const qty = Number(li.qty);
    const rate = Number(li.rate);
    if (!Number.isFinite(qty) || !Number.isFinite(rate)) {
      throw new Error(`Line item "${li.title}" has a non-numeric qty or rate`);
    }
    const amount = round2(qty * rate);
    return { ...li, qty, rate, amount, taxable: li.taxable !== false };
  });

  const subtotal = round2(items.reduce((s, li) => s + li.amount, 0));
  if (discount > subtotal) throw new Error('Discount exceeds sub-total');

  const taxableBase = round2(
    items.filter((li) => li.taxable).reduce((s, li) => s + li.amount, 0) - discount
  );
  const vat = round2(taxableBase * vatRate);
  const total = round2(subtotal - discount + vat);

  return {
    items,
    subtotal,
    discount,
    vat_rate: vatRate,
    vat,
    total,
  };
}

module.exports = { computeTotals, amountInWords, integerToWords, money, round2 };
