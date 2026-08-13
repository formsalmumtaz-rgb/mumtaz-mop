'use strict';

const path = require('path');
const { computeTotals, amountInWords, money } = require('./compute');

/**
 * Rich-text fields are rendered with a triple-stache so authors can use <b>.
 * That means every one of them must be sanitised here: content may come from
 * the database (a rep typing into MOP), not just from a trusted developer.
 * Escape everything, then restore a small allow-list of inline tags.
 */
const RICH_ALLOW = ['b', 'strong', 'i', 'em', 'br'];
function sanitizeRich(str) {
  if (str === null || str === undefined) return str;
  let out = String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  for (const tag of RICH_ALLOW) {
    out = out
      .replace(new RegExp(`&lt;${tag}&gt;`, 'gi'), `<${tag}>`)
      .replace(new RegExp(`&lt;/${tag}&gt;`, 'gi'), `</${tag}>`)
      .replace(new RegExp(`&lt;${tag}\\s*/&gt;`, 'gi'), `<${tag}/>`);
  }
  return out;
}
/** Escape a value being interpolated INTO a rich-text string. */
function esc(str) {
  return String(str === null || str === undefined ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const ASSETS = path.resolve(__dirname, '..', 'assets');

/** Company-wide constants. Divisions override the logo + name only. */
const BRAND_DEFAULTS = {
  legal_name: 'Al Mumtaz Bldg Clean & Pest Control',
  group_line: 'A division of Mumtaz Integrated Services Group',
  established: '2006',
  trade_licence: '546486',
  toll_free: '800 688',
  email: 'info@almumtaz.ae',
  accent_color: '#A31E22',
  toll_free_src: path.join(ASSETS, 'toll-free.png'),
  offices: [
    { city: 'Dubai', line1: 'Office F313, Al Hashmi Tower,', line2: 'Deira, Dubai' },
    { city: 'Sharjah', line1: 'Office 4, Al Estiqlal Street,', line2: 'Al Manakh, Sharjah' },
    { city: 'Abu Dhabi', line1: 'Office 504, Cont Building,', line2: 'Musaffah, Abu Dhabi' },
  ],
};

/** Per-division overrides. Add new lines here, not in the template. */
const DIVISIONS = {
  pest_control: {
    division_name: 'Mumtaz Pest Control',
    logo_src: path.join(ASSETS, 'logo-pest-control.png'),
    default_title: 'Pest Control Quotation',
    default_subtitle: 'Integrated Pest Management',
  },
  cleaning: {
    division_name: 'Mumtaz Cleaning Crew',
    logo_src: path.join(ASSETS, 'logo-cleaning-crew.png'),
    accent_color: '#235B3C',
    default_title: 'Cleaning Services Quotation',
    default_subtitle: 'Professional Deep Cleaning Services',
  },
  facilities: {
    division_name: 'Mumtaz Facilities Management',
    logo_src: path.join(ASSETS, 'logo-facilities-management.png'),
    accent_color: '#12294A',
    default_title: 'Facilities Management Quotation',
    default_subtitle: 'Integrated Facilities Management',
  },
};

const DEFAULT_CREDENTIALS = [
  'Established 2006 — Trade Licence No. 546486; municipality approved in Dubai, Sharjah and Abu Dhabi.',
  'ISO 9001 (Quality), ISO 14001 (Environment) and ISO 45001 (Occupational Health & Safety) certified.',
  'Trained and certified technicians under full supervision.',
  'Trusted by leading UAE corporate, retail, hospitality and healthcare groups.',
];

function fmtDate(d) {
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) throw new Error(`Invalid date: ${d}`);
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
}

function required(obj, field, where) {
  const v = field.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
  if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) {
    throw new Error(`Missing required field: ${where}.${field}`);
  }
  return v;
}

/**
 * Turns a lean payload (the shape you'd store in Postgres) into the fully
 * derived view model the template expects. Everything computed here is
 * intentionally NOT the caller's responsibility.
 */
function normalize(input) {
  const divisionKey = input.division || 'pest_control';
  const division = DIVISIONS[divisionKey];
  if (!division) {
    throw new Error(`Unknown division "${divisionKey}". Known: ${Object.keys(DIVISIONS).join(', ')}`);
  }

  required(input, 'client.name', 'payload');
  required(input, 'line_items', 'payload');

  const brand = { ...BRAND_DEFAULTS, ...division, ...(input.brand_overrides || {}) };

  const issueDate = input.doc?.issue_date ? new Date(input.doc.issue_date) : new Date();
  const validityDays = input.doc?.validity_days ?? 30;

  const currency = input.pricing?.currency || 'AED';
  const totals = computeTotals(input.line_items, {
    vat_rate: input.pricing?.vat_rate,
    discount: input.pricing?.discount,
  });

  const lineItems = totals.items.map((li) => ({
    ...li,
    rate_fmt: money(li.rate),
    amount_fmt: li.amount === 0 && li.zero_label ? li.zero_label : money(li.amount),
  }));

  const warrantyMonths = input.warranty?.months;
  const visitCount = totals.items.reduce((s, li) => s + (li.counts_as_visit ? li.qty : 0), 0);

  // Badges default to the three facts a client scans for; override freely.
  const badges = input.badges || [
    { value: `${currency} ${money(totals.subtotal - totals.discount)}`, label: 'Net of VAT' },
    visitCount ? { value: `${visitCount} Visits`, label: input.badge_visit_label || 'Scheduled Service Visits' } : null,
    warrantyMonths ? { value: `${warrantyMonths} Months`, label: 'Service Warranty' } : null,
  ].filter(Boolean);

  const warrantyTextRaw = input.warranty?.text || (warrantyMonths
    ? `A <b>${esc(input.warranty.months_words || warrantyMonths)} month service warranty</b> applies from the date of the initial service. Should the issue recur within the warranty period, our team will attend the site and re-treat the affected areas free of charge, subject to the terms below.`
    : null);
  const warrantyText = sanitizeRich(warrantyTextRaw);

  return {
    brand,
    doc: {
      ref_no: input.doc?.ref_no || 'DRAFT — NOT ISSUED',
      issue_date: fmtDate(issueDate),
      validity_text: `${validityDays} days from date of issue`,
      title: input.doc?.title || division.default_title,
      subtitle: input.doc?.subtitle || division.default_subtitle,
      subject: required(input, 'doc.subject', 'payload'),
      salutation: input.doc?.salutation || 'Dear Sir,',
      intro_paragraphs: (input.doc?.intro_paragraphs || []).map(sanitizeRich),
      closing_paragraphs: (input.doc?.closing_paragraphs || [
        `For any clarification or to schedule the service, please contact us on our toll-free number <b>${esc(brand.toll_free)}</b> or by email at <b>${esc(brand.email)}</b>. We thank you for the opportunity to quote and look forward to serving ${esc(input.client.name)}.`,
      ]).map(sanitizeRich),
      acceptance_note: input.doc?.acceptance_note === null ? null : sanitizeRich(input.doc?.acceptance_note
        || `<b>To confirm this quotation:</b> kindly sign and stamp in the space provided above and return a scanned copy to <b>${esc(brand.email)}</b>. Our scheduling team will contact you within one working day to fix the service date.`),
    },
    client: {
      name: input.client.name,
      address_lines: input.client.address_lines || [],
      trn: input.client.trn || null,
    },
    scope: {
      heading: input.scope?.heading || 'Scope of Work',
      items: input.scope?.items || [],
    },
    premises: {
      heading: input.premises?.heading || 'Premises Covered',
      text: input.premises?.text || null,
    },
    pricing: {
      heading: input.pricing?.heading || 'Commercial Offer',
      currency,
    },
    line_items: lineItems,
    totals: {
      subtotal: totals.subtotal,
      subtotal_fmt: money(totals.subtotal),
      discount: totals.discount || null,
      discount_fmt: money(totals.discount),
      vat: totals.vat,
      vat_fmt: money(totals.vat),
      vat_rate_pct: +(totals.vat_rate * 100).toFixed(2).replace(/\.00$/, ''),
      total: totals.total,
      total_fmt: money(totals.total),
      amount_in_words: amountInWords(totals.total),
    },
    badges,
    warranty: {
      heading: input.warranty?.heading || 'Warranty',
      text: warrantyText,
    },
    terms: input.terms || [],
    credentials_heading: input.credentials_heading || 'Our Credentials',
    credentials: input.credentials || DEFAULT_CREDENTIALS,
    signatory: {
      name: input.signatory?.name || 'Sahad Saleem',
      title: input.signatory?.title || 'Business Development Manager',
    },
  };
}

module.exports = { normalize, sanitizeRich, BRAND_DEFAULTS, DIVISIONS, DEFAULT_CREDENTIALS };
