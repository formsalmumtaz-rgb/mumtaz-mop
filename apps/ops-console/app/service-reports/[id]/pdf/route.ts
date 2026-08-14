import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { authEnforced } from "@/lib/auth-flags";
import { getTenantId } from "@/lib/tenant";
import { getServiceReportDocument } from "@/lib/domain/servicereports";
import { resolveDocumentBrand, resolveDocumentBrandOrg } from "@/lib/domain/branding";
import { renderServiceReportPdf, prepareQr, pngSize, type Asset } from "@mop/documents";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const pngAsset = (buf: Buffer | null): Asset | null => {
  if (!buf) return null;
  try {
    const { w, h } = pngSize(buf);
    return { dataUrl: `data:image/png;base64,${buf.toString("base64")}`, w, h };
  } catch {
    return null;
  }
};

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (authEnforced() && !(await getSession())) {
    return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });
  }
  const tenantId = await getTenantId();
  const rpt = await getServiceReportDocument(tenantId, id);
  if (!rpt) return NextResponse.json({ error: "not found" }, { status: 404 });

  const [brand, org] = await Promise.all([
    resolveDocumentBrand(tenantId, rpt.service_line_code),
    resolveDocumentBrandOrg(tenantId),
  ]);

  const verifyUrl = `https://verify.almumtaz.ae/r/${id}`;
  await prepareQr(verifyUrl);

  const bytes = renderServiceReportPdf({
    reportNumber: rpt.report_number ?? rpt.job_ref,
    date: rpt.date ?? "",
    timeIn: rpt.time_in,
    timeOut: rpt.time_out,
    jobRef: rpt.job_ref,
    contractNumber: rpt.contract_number,
    invoiceNumber: rpt.invoice_number,
    visitSeq: rpt.visit_seq,
    visitTotal: rpt.visit_total,
    serviceOrderType: rpt.service_order_type,
    serviceCategory: rpt.service_category,
    contractType: rpt.contract_type,
    divisionName: rpt.service_line_name ?? "—",
    customer: rpt.customer,
    supervisor: rpt.supervisor,
    team: rpt.team,
    premisesType: rpt.premises_type,
    pestEvidence: rpt.pest_evidence,
    infestationLevel: rpt.infestation_level,
    areasTreated: rpt.areas_treated,
    specificAreasDetail: rpt.specific_areas_detail,
    accessRestrictions: rpt.access_restrictions,
    treatmentMethod: rpt.treatment_method,
    chemicals: rpt.chemicals,
    ppeUsed: rpt.ppe_used,
    findings: rpt.findings,
    recommendations: rpt.recommendations,
    trend: rpt.trend,
    mostFlaggedIssue: rpt.most_flagged_issue,
    notes: rpt.notes,
    financials: rpt.financials,
    signatureCustomer: pngAsset(rpt.signatures.customer),
    signatureCustomerCaptured: rpt.signatures.customer_captured,
    signatureTechnician: pngAsset(rpt.signatures.technician),
    signatureTechnicianCaptured: rpt.signatures.technician_captured,
    verifyUrl,
    brand: { name: brand.name, label: brand.label, showLabel: brand.show_label_on_document, tagline: brand.tagline, accent: brand.accent_color ?? "#A31E22", showTollFree: brand.show_toll_free },
    org: {
      legal_name: org.legal_name,
      group_line: org.group_line,
      established: org.established,
      trade_licence: org.trade_licence,
      offices: org.offices,
    },
    logo: null,
    tollFree: null,
  });

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="service-report-${rpt.report_number ?? id}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
