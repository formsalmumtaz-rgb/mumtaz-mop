import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getSession } from "@/lib/auth";
import { authEnforced } from "@/lib/auth-flags";
import { getTenantId } from "@/lib/tenant";
import { getQuotation } from "@/lib/domain/estimation";
import { resolveDocumentBrand } from "@/lib/domain/branding";
import { renderQuotationPdf, pngSize, type Asset } from "@/lib/documents/quotationPdf";

export const dynamic = "force-dynamic";

async function loadAsset(key: string): Promise<Asset | null> {
  try {
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
  const q = await getQuotation(tenantId, id);
  if (!q) return NextResponse.json({ error: "not found" }, { status: 404 });

  const brand = await resolveDocumentBrand(tenantId, q.service_line_code);
  const [logo, tollFree] = await Promise.all([
    loadAsset(brand.logo_key),
    brand.show_toll_free ? loadAsset("toll-free.png") : Promise.resolve(null),
  ]);

  const bytes = renderQuotationPdf({
    quotationNumber: q.quotation_number ?? "(draft)",
    date: (q.quoted_at ?? "").slice(0, 10),
    validUntil: q.valid_until ?? "",
    customer: q.customer ?? "—",
    customerTrn: q.customer_trn ?? "—",
    divisionName: q.service_line_name ?? "—",
    currency: "AED",
    lines: q.lines,
    subtotal: q.subtotal,
    vatRate: q.vat_rate,
    vat: q.vat,
    total: q.total,
    brand: { name: brand.name, tagline: brand.tagline, showTollFree: brand.show_toll_free },
    logo,
    tollFree,
  });

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="quotation-${q.quotation_number ?? id}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
