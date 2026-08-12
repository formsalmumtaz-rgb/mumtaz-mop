// On-device Service Completion Report. Runs fully offline: jsPDF, the cached
// logo, the QR code, the canvas trend chart, and the signature blobs all work
// with no network.
//
// The layout and DNA live in ./report/render.ts; the data mapping (omit-empty)
// lives in ./report/build.ts. This file just wires the two to the existing
// call site in App.tsx (unchanged signature).

import logoUrl from "./assets/pest-logo.png";
import type { LocalJob, MediaItem } from "./db";
import { buildReportModel } from "./report/build";
import { renderReport } from "./report/render";

export async function generateServiceReport(
  job: LocalJob,
  media: MediaItem[],
): Promise<Blob> {
  // A10 parallel path (opt-in, default OFF). When VITE_REPORT_SHARED_CHROME="1" the
  // report renders via the shared @mop/documents brandChrome so it can be compared,
  // on a phone, against the device-verified renderer below. Everything past this gate
  // is new code; the false branch is byte-for-byte the existing path.
  if (import.meta.env.VITE_REPORT_SHARED_CHROME === "1") {
    const { generateServiceReportSharedChrome } = await import("./report/sharedChrome");
    return generateServiceReportSharedChrome(job, media, logoUrl);
  }
  const model = await buildReportModel(job, media);
  return renderReport(model, { logoUrl });
}
