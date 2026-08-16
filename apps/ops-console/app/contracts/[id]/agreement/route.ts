import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getSession } from "@/lib/auth";
import { authEnforced } from "@/lib/auth-flags";
import { getTenantId } from "@/lib/tenant";
import { scopedRead } from "@/lib/rls";
import { getContract } from "@/lib/domain/contracts";
import { resolveDocumentBrand, resolveDocumentBrandOrg } from "@/lib/domain/branding";
import { pngSize } from "@mop/documents";
import { buildAgreementDocx, type DocxImage } from "@/lib/documents/agreementDocx";
import { getAgreementTerms } from "@/lib/domain/agreementTerms";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function loadImage(key: string): Promise<DocxImage | null> {
  try {
    if (!/^[a-z0-9._-]+\.png$/i.test(key)) return null;
    const buf = await fs.readFile(path.join(process.cwd(), "public", "brand", key));
    const { w, h } = pngSize(buf);
    return { data: buf, w, h };
  } catch {
    return null;
  }
}

const fmtDate = (d: string | null) => (d ? new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—");

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = authEnforced() ? await getSession() : null;
  if (authEnforced() && !session) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });

  const tenantId = await getTenantId();
  const c = await getContract(tenantId, id);
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Attestation (mig 076, Unified Contract condition 1): the MOMENT a contract
  // document is generated/downloaded, tracking starts — no manual step.
  const { withRequest } = await import("@/lib/rls");
  await withRequest({ tenantId, actorId: session?.userId ?? null }, (cl) =>
    cl.query(
      `update contracts set attestation_status = 'pending'
        where id = $1 and tenant_id = $2 and attestation_status = 'not_required'`,
      [id, tenantId]),
  );

  // Service line name + code (getContract has the id only) — code drives branding.
  const { rows: slRows } = await scopedRead(tenantId,
    `select code, name from service_lines where tenant_id = $1 and id = $2`, [tenantId, c.service_line_id]);
  const serviceLineCode = (slRows[0]?.code as string) ?? null;
  const serviceLineName = (slRows[0]?.name as string) ?? "—";

  const [brand, org] = await Promise.all([
    resolveDocumentBrand(tenantId, serviceLineCode),
    resolveDocumentBrandOrg(tenantId),
  ]);
  const [logo, tollFree] = await Promise.all([
    loadImage(brand.logo_key),
    brand.show_toll_free ? loadImage("toll-free.png") : Promise.resolve(null),
  ]);

  // Which emirate governs this agreement — the SITE's, falling back to the
  // customer's. It decides the signing entity and the special conditions.
  const { rows: siteRows } = await scopedRead(tenantId,
    `select coalesce(b.emirate, cu.emirate) as emirate, b.name as premises,
            cu.trade_license,
            (select coalesce(k.phone, k.email) from contacts k
              where k.customer_id = cu.id order by k.is_primary desc nulls last limit 1) as contact,
            (select ft.name from facility_types ft where ft.id = ct.facility_type_id) as activity
       from contracts ct
       join customers cu on cu.id = ct.customer_id
       left join customer_branches b on b.customer_id = cu.id
      where ct.tenant_id = $1 and ct.id = $2
      -- prefer a site that actually HAS an emirate: a branch row with the field
      -- blank must not shadow the one that carries the governing emirate
      order by (coalesce(b.emirate, cu.emirate) is null), b.created_at
      limit 1`, [tenantId, id]);
  const site = siteRows[0] ?? {};
  const terms = await getAgreementTerms(tenantId, (site.emirate as string) ?? null);

  const term = c.start_date || c.end_date ? `${fmtDate(c.start_date)} — ${fmtDate(c.end_date)}` : "—";
  // P0-3: the document names the service actually contracted — a cleaning
  // agreement is a "General Cleaning Agreement", never a pest one. Title,
  // branding and clauses all derive from the contract's own service line.
  const buffer = await buildAgreementDocx({
    title: serviceLineName !== "—" ? `${serviceLineName} Agreement` : "Service Agreement",
    contractNumber: c.contract_number ?? "(draft)",
    date: fmtDate(new Date().toISOString().slice(0, 10)),
    term,
    frequency: c.frequency_name ?? "—",
    serviceLine: serviceLineName,
    currency: c.currency ?? "AED",
    contractValue: c.contract_value ? Number(c.contract_value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—",
    client: { name: c.customer_name ?? "—", addressLines: [] },
    scope: c.lines.map((l) => ({
      serviceType: l.service_type_name ?? "Service",
      pricingModel: l.pricing_model_name ?? "",
      qty: l.quantity ?? "",
      unitPrice: l.unit_price ? Number(l.unit_price).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "",
    })),
    brand: { name: brand.name, label: brand.label, accent: brand.accent_color ?? "#A31E22", showTollFree: brand.show_toll_free },
    org: { legal_name: org.legal_name, group_line: org.group_line, established: org.established, trade_licence: org.trade_licence, offices: org.offices },
    signatory: { name: session?.fullName ?? "", title: "Authorised Signatory" },
    logo,
    tollFree,
    entity: terms.entity,
    entityEmirate: terms.entityEmirate,
    client2: {
      trade_licence: (site.trade_license as string) ?? null,
      activity: (site.activity as string) ?? null,
      contact: (site.contact as string) ?? null,
      emirate: (site.emirate as string) ?? null,
    },
    conditions: terms.conditions,
    pests: serviceLineCode === "pest_control" ? terms.pests : [],
    premises: (site.premises as string) ?? null,
    missing: terms.missing,
  });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="agreement-${c.contract_number ?? id}.docx"`,
      "Cache-Control": "no-store",
    },
  });
}
