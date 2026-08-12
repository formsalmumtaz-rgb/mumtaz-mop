import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getSession } from "@/lib/auth";
import { authEnforced } from "@/lib/auth-flags";
import { getTenantId } from "@/lib/tenant";
import { getServiceReport } from "@/lib/domain/servicereports";
import { resolveDocumentBrand, resolveDocumentBrandOrg } from "@/lib/domain/branding";
import { renderServiceReportPdf, pngSize, type Asset } from "@mop/documents";

export const dynamic = "force-dynamic";

async function loadAsset(key: string): Promise<Asset | null> {
  try {
    // Guard against traversal — only a bare filename under public/brand.
    if (!/^[a-z0-9._-]+\.png$/i.test(key)) return null;
    const buf = await fs.readFile(path.join(process.cwd(), "public", "brand", key));
    const { w, h } = pngSize(buf);
    return { dataUrl: `data:image/png;base64,${buf.toString("base64")}`, w, h };
  } catch {
    return null;
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (authEnforced() && !(await getSession())) {
    return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });
  }
  const tenantId = await getTenantId();
  const data = await getServiceReport(tenantId, id);
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { header } = data;

  const [brand, org] = await Promise.all([
    resolveDocumentBrand(tenantId, header.service_line_code),
    resolveDocumentBrandOrg(tenantId),
  ]);
  const [logo, tollFree] = await Promise.all([
    loadAsset(brand.logo_key),
    brand.show_toll_free ? loadAsset("toll-free.png") : Promise.resolve(null),
  ]);

  const notes = typeof header.snapshot?.notes === "string" ? header.snapshot.notes : "";
  const bytes = renderServiceReportPdf({
    reportNumber: header.report_number ?? "(draft)",
    date: (header.server_completed_at ?? "").slice(0, 10),
    customer: header.customer ?? "—",
    performer: header.performer ?? header.performed_by ?? "—",
    jobRef: header.job_id.slice(0, 8),
    divisionName: header.service_line_name ?? "—",
    notes,
    brand: { name: brand.name, label: brand.label, showLabel: brand.show_label_on_document, tagline: brand.tagline, accent: brand.accent_color ?? "#A31E22", showTollFree: brand.show_toll_free },
    org: {
      legal_name: org.legal_name,
      group_line: org.group_line,
      established: org.established,
      trade_licence: org.trade_licence,
      offices: org.offices,
    },
    logo,
    tollFree,
  });

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="service-report-${header.report_number ?? id}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
