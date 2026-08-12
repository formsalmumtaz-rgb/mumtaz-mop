// A10 (parallel path, flag-gated) — render the on-device service report through the
// SHARED @mop/documents brandChrome, so the field report can be compared, on a real
// phone, against the existing device-verified renderer (report/render.ts) BEFORE any
// switch. This file is NEVER reached unless VITE_REPORT_SHARED_CHROME === "1"; the
// default path (render.ts) is byte-for-byte untouched.
//
// STAGED, not final (see BLOCKED A10):
//  * The division brand here is derived from the app's existing pest identity
//    (COMPANY) + the single bundled pest logo — NOT yet the per-division brand block
//    from reference data. True per-division needs branding in the field sync payload
//    + the division logos precached in public/brand. Until then this renders the pest
//    division only.
//  * renderServiceReportPdf draws the shared letterhead/footer/accent + a meta grid +
//    notes — a THINNER body than render.ts (no QR, trend chart, signatures, photos,
//    chemicals). It is a chrome comparison, not a full replacement.
import {
  renderServiceReportPdf, pngSize,
  type ServiceReportPdfData, type BrandSkin, type DocOrg, type Asset,
} from "@mop/documents";
import { COMPANY } from "./model";
import type { LocalJob, MediaItem } from "../db";

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

async function loadLogo(logoUrl: string): Promise<Asset | null> {
  try {
    const buf = new Uint8Array(await (await fetch(logoUrl)).arrayBuffer());
    const { w, h } = pngSize(buf);
    return { dataUrl: "data:image/png;base64," + bytesToBase64(buf), w, h };
  } catch {
    return null; // offline/asset missing → letterhead falls back to text
  }
}

// The pest-division skin, derived from the app's existing identity. Accent is the
// same MAROON the verified renderer uses, so the comparison isolates the chrome.
const PEST_SKIN: BrandSkin = {
  name: "Mumtaz Pest Control",
  label: null,
  showLabel: false,
  tagline: COMPANY.tagline,
  accent: "#A31E22",
  showTollFree: true,
};

const ORG: DocOrg = {
  legal_name: COMPANY.legalName,
  group_line: "Mumtaz Integrated Services Group",
  established: null,
  trade_licence: null,
  offices: [{ city: "Sharjah", line1: "Al Estiqlal Street, Al Manakh", line2: COMPANY.poBox }],
};

export async function generateServiceReportSharedChrome(
  job: LocalJob,
  _media: MediaItem[],
  logoUrl: string,
): Promise<Blob> {
  const logo = await loadLogo(logoUrl);
  const date = job.device_completed_at ?? job.scheduled_date ?? "";
  const customer = [job.customer_name, job.branch_name].filter(Boolean).join(" · ");
  const notesParts = [
    job.service_type ? `Service: ${job.service_type}` : null,
    job.address ? `Site: ${job.address}` : null,
    job.access_notes ? `Access: ${job.access_notes}` : null,
  ].filter(Boolean) as string[];

  const data: ServiceReportPdfData = {
    reportNumber: `SR-${job.id.slice(0, 8).toUpperCase()}`,
    date,
    customer,
    performer: "Field Technician",
    jobRef: job.id,
    divisionName: "Pest Control",
    notes: notesParts.join("\n"),
    brand: PEST_SKIN,
    org: ORG,
    logo,
    tollFree: null,
  };

  const bytes = renderServiceReportPdf(data);
  // Copy into a plain ArrayBuffer so the Blob part is exactly typed (avoids the
  // ArrayBufferLike/SharedArrayBuffer strictness on Uint8Array).
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new Blob([ab], { type: "application/pdf" });
}
