'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const Handlebars = require('handlebars');
const { normalize } = require('./normalize');
const { buildDocx } = require('./docx');

const TEMPLATE_PATH = path.resolve(__dirname, '..', 'templates', 'quotation.hbs');
const ASSETS_DIR = path.resolve(__dirname, '..', 'assets');

let _compiled = null;
function template() {
  if (!_compiled) {
    _compiled = Handlebars.compile(fs.readFileSync(TEMPLATE_PATH, 'utf8'), { noEscape: false });
  }
  return _compiled;
}

/** Inline images as data URIs so the HTML is a single portable file. */
function inlineAssets(html) {
  return html.replace(/src="([^"]+\.png)"/g, (m, p) => {
    const abs = path.isAbsolute(p) ? p : path.join(ASSETS_DIR, path.basename(p));
    if (!fs.existsSync(abs)) return m;
    return `src="data:image/png;base64,${fs.readFileSync(abs).toString('base64')}"`;
  });
}

/**
 * @param {object} payload lean quotation payload (see schema/quotation.schema.json)
 * @param {{inline?:boolean}} opts
 * @returns {{html:string, model:object}}
 */
function renderHtml(payload, opts = {}) {
  const model = normalize(payload);
  let html = template()(model);
  if (opts.inline !== false) html = inlineAssets(html);
  return { html, model };
}

/**
 * HTML -> PDF via WeasyPrint. Chosen over headless Chrome because it renders
 * @page margin boxes and running headers/footers correctly, which is what
 * makes the repeating header/footer work. Requires `weasyprint` on PATH.
 */
function renderPdf(payload, outPath, opts = {}) {
  const { html, model } = renderHtml(payload, { inline: false });
  const tmp = path.join(path.dirname(outPath), `.${path.basename(outPath)}.html`);
  fs.writeFileSync(tmp, html);
  try {
    execFileSync(opts.weasyprintBin || 'weasyprint', ['-e', 'utf8', tmp, outPath], { stdio: 'pipe' });
  } finally {
    if (!opts.keepHtml) fs.unlinkSync(tmp);
  }
  return { path: outPath, model };
}

/** Same payload -> editable Word document. */
async function renderDocx(payload, outPath) {
  const model = normalize(payload);
  const buffer = await buildDocx(model);
  fs.writeFileSync(outPath, buffer);
  return { path: outPath, model };
}

/** Convenience: emit every format at once. */
async function renderAll(payload, outDir, basename) {
  fs.mkdirSync(outDir, { recursive: true });
  const { html, model } = renderHtml(payload);
  const htmlPath = path.join(outDir, `${basename}.html`);
  fs.writeFileSync(htmlPath, html);
  const pdf = renderPdf(payload, path.join(outDir, `${basename}.pdf`));
  const docx = await renderDocx(payload, path.join(outDir, `${basename}.docx`));
  return { html: htmlPath, pdf: pdf.path, docx: docx.path, model };
}

module.exports = { renderHtml, renderPdf, renderDocx, renderAll, normalize };
