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
  const model = await buildReportModel(job, media);
  return renderReport(model, { logoUrl });
}
