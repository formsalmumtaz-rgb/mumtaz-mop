#!/usr/bin/env node
'use strict';

/**
 * Usage:
 *   node src/cli.js <payload.json> [--out ./out] [--name basename] [--only pdf|docx|html]
 *
 * Example:
 *   node src/cli.js examples/satguru-pest-control.json --out ./out
 */

const fs = require('fs');
const path = require('path');
const { renderHtml, renderPdf, renderDocx } = require('./render');

function parseArgs(argv) {
  const args = { out: './out', only: null, name: null };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') args.out = argv[++i];
    else if (a === '--name') args.name = argv[++i];
    else if (a === '--only') args.only = argv[++i];
    else if (a === '-h' || a === '--help') args.help = true;
    else rest.push(a);
  }
  args.payload = rest[0];
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || !args.payload) {
    console.log('Usage: node src/cli.js <payload.json> [--out DIR] [--name BASE] [--only pdf|docx|html]');
    process.exit(args.help ? 0 : 1);
  }
  if (!fs.existsSync(args.payload)) {
    console.error(`Payload not found: ${args.payload}`);
    process.exit(1);
  }

  const payload = JSON.parse(fs.readFileSync(args.payload, 'utf8'));
  const base = args.name || path.basename(args.payload, '.json');
  fs.mkdirSync(args.out, { recursive: true });

  const want = (f) => !args.only || args.only === f;
  const made = [];

  try {
    if (want('html')) {
      const { html } = renderHtml(payload);
      const p = path.join(args.out, `${base}.html`);
      fs.writeFileSync(p, html);
      made.push(p);
    }
    if (want('pdf')) made.push(renderPdf(payload, path.join(args.out, `${base}.pdf`)).path);
    if (want('docx')) made.push((await renderDocx(payload, path.join(args.out, `${base}.docx`))).path);
  } catch (err) {
    console.error(`\nRender failed: ${err.message}\n`);
    process.exit(1);
  }

  const { model } = renderHtml(payload);
  console.log(`\n${model.doc.ref_no}  ·  ${model.client.name}`);
  console.log(`Total: ${model.pricing.currency} ${model.totals.total_fmt} (incl. VAT)\n`);
  made.forEach((p) => console.log(`  ${p}`));
  console.log('');
}

main();
