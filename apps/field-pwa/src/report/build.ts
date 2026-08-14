// Maps on-device data (LocalJob + media) into the ReportModel, and provides a
// richly-populated SAMPLE model for design review. Production mapping is strictly
// omit-empty: fields the device doesn't hold are simply left undefined and drop
// out of the PDF.

import type { LocalJob, MediaItem } from "../db";
import { DEFAULT_BOILERPLATE, resolveNames, type ReportModel } from "./model";

function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result as string);
    fr.onerror = rej;
    fr.readAsDataURL(b);
  });
}

// P0-2 root cause: media is stored as WebP (photos via compression, historic
// signatures via the old capture) but jsPDF cannot decode WebP — addImage threw
// and the empty catch printed an EMPTY box where the signature belonged.
// Captured means rendered: transcode any blob to PNG (signatures — line art,
// transparency) or JPEG (photos — smaller) via canvas before it reaches jsPDF.
// Already-compatible formats pass through untouched.
async function blobToRenderableDataUrl(b: Blob, target: "png" | "jpeg"): Promise<string> {
  const passthrough = target === "png" ? "image/png" : "image/jpeg";
  if (b.type === passthrough) return blobToDataUrl(b);
  try {
    const bmp = await createImageBitmap(b);
    const canvas = document.createElement("canvas");
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    const ctx = canvas.getContext("2d")!;
    if (target === "jpeg") { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    ctx.drawImage(bmp, 0, 0);
    bmp.close();
    return canvas.toDataURL(passthrough, target === "jpeg" ? 0.85 : undefined);
  } catch {
    // decode failed — fall back to the raw data URL (renderer may still cope)
    return blobToDataUrl(b);
  }
}

const timeOf = (iso?: string) =>
  iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : undefined;

export async function buildReportModel(
  job: LocalJob,
  media: MediaItem[],
): Promise<ReportModel> {
  const names = resolveNames(null, job.customer_name);
  const photos = await Promise.all(
    media
      .filter((m) => m.kind === "photo")
      .slice(0, 6)
      .map(async (m) => ({ dataUrl: await blobToRenderableDataUrl(m.blob, "jpeg") })),
  );
  const sigBlob = media.find((m) => m.kind === "signature");
  const customerSig = sigBlob ? await blobToRenderableDataUrl(sigBlob.blob, "png") : undefined;
  const techSigBlob = media.find((m) => m.kind === "signature_tech");
  const techSig = techSigBlob ? await blobToRenderableDataUrl(techSigBlob.blob, "png") : undefined;

  const chemicals = job.recipe
    ? [
        {
          product: job.recipe.name,
          dilution: job.recipe.dilution_ratio ?? undefined,
          dosage:
            job.recipe.dose_rate != null
              ? `${job.recipe.dose_rate} ${job.recipe.dose_unit ?? ""}`.trim()
              : undefined,
        },
      ]
    : undefined;

  return {
    meta: {
      reportNo: job.id.slice(0, 8).toUpperCase(),
      generatedAt: new Date().toISOString(),
      verifyUrl: `https://verify.almumtaz.ae/r/${job.id}`,
    },
    identification: {
      jobNo: job.id.slice(0, 8).toUpperCase(),
      serviceDate: job.device_completed_at?.slice(0, 10) ?? job.scheduled_date ?? undefined,
      timeIn: timeOf(job.device_started_at),
      timeOut: timeOf(job.device_completed_at),
      serviceCategory: undefined,
    },
    customer: {
      displayName: names.displayName,
      legalNameSecondary: names.legalNameSecondary,
      branchName: job.branch_name ?? undefined,
      addressLine: job.address ?? undefined,
    },
    team: {},
    premisesType: job.service_type ?? undefined,
    findings: {}, // no findings capture yet → whole block omits
    treatment: {
      chemicals,
    },
    photos: photos.length ? photos : undefined,
    trend: { history: [] }, // no history → "Baseline assessment" message
    boilerplate: DEFAULT_BOILERPLATE,
    signatures: {
      customer: customerSig ? { dataUrl: customerSig } : undefined,
      technician: techSig ? { dataUrl: techSig } : undefined,
    },
  };
}

// A fully-populated, clearly-watermarked SAMPLE for design review only. Uses a
// real customer/contract shape (Calicut Restaurant, contract 1330/25) so the
// layout can be judged at full density. NOT real service data.
export function buildSampleModel(): ReportModel {
  const history = [
    { visitLabel: "V19", infestation: 3, hygiene: 3, structural: 3 },
    { visitLabel: "V20", infestation: 3, hygiene: 3, structural: 4 },
    { visitLabel: "V21", infestation: 2, hygiene: 4, structural: 4 },
    { visitLabel: "V22", infestation: 1, hygiene: 4, structural: 4 },
  ];
  return {
    meta: {
      reportNo: "A1B2C3D4",
      generatedAt: new Date().toISOString(),
      verifyUrl: "https://verify.almumtaz.ae/r/sample-1330-25-v22",
      sampleWatermark: true,
    },
    identification: {
      jobNo: "JOB-24-0912",
      contractNo: "1330/25",
      visitNo: 22,
      visitOf: 24,
      invoiceNo: "INV-24-3391",
      serviceDate: "2026-07-24",
      timeIn: "09:15",
      timeOut: "10:40",
      serviceOrderType: "Scheduled",
      serviceCategory: "Commercial (B2B)",
      contractType: "AMC — Monthly (2 visits)",
    },
    customer: {
      displayName: "Calicut Restaurant",
      accountNo: "CUST-0001",
      building: "Al Manakh Plaza, Shop 4, Ground Floor",
      branchName: "Aljada Branch",
      branchId: "BR-0001",
      street: "Al Estiqlal Street, Al Manakh",
      area: "Al Qasimia",
      emirate: "Sharjah",
      contactPrimary: "+971 6 565 4466",
      contactSecondary: "+971 50 123 4567",
      rep: { name: "Mr. Rashid", designation: "Branch Manager", contact: "+971 50 123 4567" },
    },
    team: {
      supervisor: { name: "Anwar Sadat", badge: "SUP-07" },
      teamSize: 2,
      technicians: [
        { name: "Imran Khan", badge: "TECH-14" },
        { name: "Suresh Nair", badge: "TECH-22" },
      ],
    },
    premisesType: "Restaurant / Café",
    findings: {
      pestsObserved: ["Cockroach", "Ant"],
      infestationLevel: "Low",
      hygieneScore: 4,
      structuralScore: 4,
    },
    treatment: {
      areas: ["Kitchen", "Store Room", "Drainage / Sewage", "Dining Area"],
      specificAreas: "Kitchen wall cavities, under-sink voids, dry store shelving.",
      accessRestrictions: "Cold room not treated at client request (in use).",
      methods: ["Gel Treatment", "Residual Spray"],
      chemicals: [
        {
          product: "Maxforce Gold",
          activeIngredient: "Imidacloprid 2.15%",
          concentration: "2.15",
          dosage: "18 g",
          batchNo: "MG-2451",
          dilution: "Ready-to-use",
          method: "Gel bait",
          targetPest: "Cockroach",
        },
        {
          product: "Cislin 2.5 EC",
          activeIngredient: "Deltamethrin 2.5%",
          concentration: "2.5",
          dosage: "500 ml",
          batchNo: "CIS-8830",
          dilution: "1:50",
          method: "Residual spray",
          targetPest: "Ant, Crawling",
        },
      ],
      ppe: "Gloves, mask, coveralls",
      reentry: "2 hours",
    },
    trend: {
      history,
      infestationTrend: "Down — Medium to Low over 4 visits",
      hygieneTrend: "Up — 3 to 4",
      mostFlaggedIssue: "Cockroach activity near drainage",
      overallStatus: "Improving",
    },
    observations:
      "Cockroach activity noticeably reduced since last visit. Drainage grease trap remains a harbourage point. Dry store now well-organised — no rodent evidence.",
    recommendations:
      "Increase grease-trap cleaning frequency to weekly. Install door sweep on rear kitchen door. Maintain gel bait rotation to avoid aversion.",
    carriedForward: "Rear door gap (raised V20) — still open; door sweep recommended again.",
    regulatoryNotes: "All chemicals used are Dubai Municipality approved for food-handling premises.",
    boilerplate: DEFAULT_BOILERPLATE,
    signatures: {
      customer: { name: "Mr. Rashid" },
      technician: { name: "Imran Khan" },
    },
    scalesAssumed: true,
  };
}
