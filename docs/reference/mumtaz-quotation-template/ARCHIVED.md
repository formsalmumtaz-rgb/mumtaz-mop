# ARCHIVED — superseded, do not integrate

**Decision (11 Aug 2026):** this package is retained only as a visual/layout
**reference**. It is not integrated and must not be added to the build.

## Why
- **PDF path (WeasyPrint):** dropped. WeasyPrint shells out to a Python binary
  that cannot run on Vercel serverless — it would require a DigitalOcean-style
  sidecar, which the stack decision explicitly removed (`CLAUDE.md`, DECISIONS
  §2.C). We already generate PDFs in-app with jsPDF + `brandChrome`, reading
  branding from `document_branding` (one source), with per-page letterhead/footer.
- **Brand constants:** the hardcoded values in `src/normalize.js` would drift
  from `document_branding`. Superseded by that reference data.
- **Totals:** `src/compute.js` recomputes totals; the app's `fn_price` /
  `fn_estimate_cost` are the pricing authority. Never let this recompute.

## What was lifted into the app
- **`src/docx.js` → `apps/ops-console/lib/documents/agreementDocx.ts`** (pure JS
  `docx`, Vercel-fine), rewired to read `document_branding` / `document_brand_org`
  and fed the contract's figures. Targeted at **agreement** generation only
  (editable Word, for negotiated clauses / the bilingual Sharjah Municipality
  schedules). Quotations and invoices stay fixed-output PDFs.

## Salvaged earlier
- The HTML/CSS letterhead + legal footer layout (legal entity, three offices,
  accent) was mined into `apps/ops-console/lib/documents/brandChrome.ts`.

Nothing here is on the build path. Keep for reference or delete.
