// One shared branding + document layer (jsPDF). brandChrome is the single
// letterhead/legal-footer implementation; the report and quotation generators use
// it. Imported by both the ops-console and the field app. Explicit re-exports so
// the shared primitives (Asset/pngSize/DocOrg/BrandSkin) come once from brandChrome.
export * from "./brandChrome";
export { renderServiceReportPdf, prepareQr } from "./serviceReportPdf";
export type { ServiceReportPdfData } from "./serviceReportPdf";
export { renderQuotationPdf, amountInWords } from "./quotationPdf";
export type { QuotationPdfData } from "./quotationPdf";
export { renderListPdf } from "./listPdf";
export type { ListPdfData, ListPdfColumn } from "./listPdf";
