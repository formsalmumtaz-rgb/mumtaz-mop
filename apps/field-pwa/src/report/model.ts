// The customer-facing Service Completion Report — data model.
//
// Every field is OPTIONAL. The renderer omits any field, row, or whole section
// that has no value (spec: "Omit any field with no value. Never display blank
// fields or 'N/A'."). Nothing here is a form control — the report is read-only.
//
// This model is the contract the technician-capture workstream will fill. Today
// only a subset is populated from LocalJob; the rest simply drop out of the PDF.

export interface ChemicalRow {
  product?: string;
  activeIngredient?: string;
  concentration?: string; // "%"
  dosage?: string; // qty used, e.g. "250 ml"
  batchNo?: string;
  dilution?: string; // e.g. "1:50"
  method?: string; // application method
  targetPest?: string;
}

export interface TrendPoint {
  visitLabel: string; // "V21", or a short date
  date?: string;
  infestation?: number; // mapped 0..4 (None..Critical)
  hygiene?: number; // 1..5
  structural?: number; // 1..5
}

export interface Technician {
  name: string;
  badge?: string;
}

export interface Signatory {
  name?: string;
  dataUrl?: string; // PNG/WebP data URL of the signature image
}

export interface ReportModel {
  meta: {
    reportNo?: string;
    generatedAt: string; // ISO
    verifyUrl?: string; // encoded into the QR / stamp box
    sampleWatermark?: boolean; // true = preview/sample data, show a faint SAMPLE mark
  };

  // 1 — Job reference & identification
  identification: {
    jobNo?: string;
    contractNo?: string;
    visitNo?: number;
    visitOf?: number;
    invoiceNo?: string;
    serviceDate?: string;
    timeIn?: string;
    timeOut?: string;
    serviceOrderType?: string; // Scheduled / Emergency / Follow-up / Warranty
    serviceCategory?: string; // Residential (B2C) / Commercial (B2B) / Industrial
    contractType?: string; // AMC / One-Time / Quarterly / Monthly
  };

  // 2 — Customer details (names resolved by the smart-name rule before rendering)
  customer: {
    displayName?: string; // resolved primary line
    legalNameSecondary?: string; // shown only when it meaningfully differs
    accountNo?: string; // permanent customer reference
    trn?: string;
    chainGroup?: string;
    groupId?: string;
    building?: string;
    branchName?: string;
    branchId?: string;
    siteRef?: string;
    street?: string;
    area?: string;
    emirate?: string;
    poBox?: string;
    addressLine?: string; // single free-text address (fallback when unstructured)
    contactPrimary?: string;
    contactSecondary?: string;
    email?: string;
    rep?: { name?: string; designation?: string; contact?: string };
  };

  // 3 — Service team
  team: {
    supervisor?: { name?: string; badge?: string; contact?: string };
    teamSize?: number;
    technicians?: Technician[];
  };

  // 4 — Premises type (single resolved value, no checkbox grid)
  premisesType?: string;

  // 5 — Pest activity & infestation
  findings: {
    pestsObserved?: string[];
    noPestActivity?: boolean;
    infestationLevel?: string; // ASSUMED scale label
    hygieneScore?: number; // 1..5 (ASSUMED)
    structuralScore?: number; // 1..5 (ASSUMED)
  };

  // 6 & 7 — Treatment areas + chemicals
  treatment: {
    areas?: string[];
    specificAreas?: string;
    accessRestrictions?: string;
    methods?: string[];
    chemicals?: ChemicalRow[];
    ppe?: string;
    storageDisposal?: string;
    reentry?: string;
  };

  // Photos (thumbnails, when available)
  photos?: { dataUrl: string; caption?: string }[];

  // 8 — Trend analysis (Page 2). history drives the offline chart.
  trend: {
    history: TrendPoint[];
    infestationTrend?: string;
    hygieneTrend?: string;
    mostFlaggedIssue?: string;
    overallStatus?: "Improving" | "Stable" | "Deteriorating";
  };

  // 8/9 — Observations, findings & recommendations
  observations?: string;
  recommendations?: string;
  carriedForward?: string;

  // 10 — Regulatory & compliance
  regulatoryNotes?: string;
  boilerplate: {
    postTreatment?: string;
    municipality?: string;
    guarantee?: string;
  };

  // 12 — Confirmation & signatures
  signatures: {
    technician?: Signatory;
    customer?: Signatory;
    supervisor?: Signatory;
  };

  // Whether the findings scales in this report are ASSUMED defaults (adds a flag).
  scalesAssumed?: boolean;
}

// ---------------------------------------------------------------------------
// ASSUMED findings scales (Constitution Art. X §4 — seeded, editable, flagged).
// These are NOT yet owner-confirmed. They live here until the settings module
// owns them; the report shows an "ASSUMED" flag wherever they drive a value.
// ---------------------------------------------------------------------------
export const ASSUMED_SCALES = {
  assumed: true,
  hygiene: { min: 1, max: 5, note: "Hygiene 1 (poor) – 5 (excellent)" },
  structural: { min: 1, max: 5, note: "Structural 1 (poor) – 5 (excellent)" },
  infestation: ["None", "Low", "Medium", "High", "Critical"] as const,
};

export function infestationIndex(label?: string): number | undefined {
  if (!label) return undefined;
  const i = ASSUMED_SCALES.infestation.findIndex(
    (l) => l.toLowerCase() === label.toLowerCase(),
  );
  return i < 0 ? undefined : i;
}

// Static company identity from the letterhead (safe to hard-code — it's branding,
// not a business rule).
export const COMPANY = {
  tagline: "PEST CONTROL · UAE",
  title: "Service Completion Report",
  legalName: "AL MUMTAZ BUILDING CLEANING & PEST CONTROL",
  tollFree: "800 688",
  email: "info@almumtaz.ae",
  web: "www.almumtaz.ae",
  phone: "06 565 4466",
  poBox: "PO Box 66575, Sharjah",
  certifications: [
    "ISO 9001:2015 CERTIFIED",
    "ISO 45001 HEALTH & SAFETY",
    "ISO 45001 ENVIRONMENTAL",
    "ASCB ACCREDITED",
    "DUBAI MUNICIPALITY APPROVED",
    "SHARJAH MUNICIPALITY APPROVED",
  ],
  footer:
    "GUARANTEE VOID IF SERVICE RECORD IS MISPLACED · Al Mumtaz Bldg Clean & Pest Control · Al Estiqlal Street, Al Manakh, Sharjah, UAE",
};

export const DEFAULT_BOILERPLATE = {
  postTreatment:
    "Vacate premises for min. 2–5 hrs after spray/fogging. Keep children & pets away. Open windows after re-entry.",
  municipality:
    "This service complies with Dubai & Sharjah Municipality regulations and approved chemical usage guidelines.",
  guarantee:
    "Guarantee is void if this record is misplaced or tampered with. Complaint must be raised within one month.",
};

// The smart-name rule (spec, Customer Identification):
//  - trade name is the primary line when it exists;
//  - legal name shows as a secondary line only when it exists AND differs
//    meaningfully from the trade name;
//  - never emit a duplicate or empty name row.
export function resolveNames(
  legalName?: string | null,
  tradeName?: string | null,
): { displayName?: string; legalNameSecondary?: string } {
  const legal = (legalName ?? "").trim();
  const trade = (tradeName ?? "").trim();
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (trade && legal) {
    if (norm(trade) === norm(legal)) return { displayName: trade };
    return { displayName: trade, legalNameSecondary: legal };
  }
  if (trade) return { displayName: trade };
  if (legal) return { displayName: legal };
  return {};
}
