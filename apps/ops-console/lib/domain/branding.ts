import "server-only";
import { scopedRead } from "../rls";
import { withTenantTx } from "./tx";
import { audit } from "./audit";

// Document branding (mig 043). Which logo/name a generated document carries is
// DATA, not code (Art. XVIII): resolved by the document's division (service
// line), falling back to the group (ISG) brand. Editable from admin.
export interface DocumentBrand {
  id: string;
  brand_key: string;
  name: string;
  logo_key: string;
  tagline: string | null;
  applies_to_service_line_code: string | null;
  show_toll_free: boolean;
  is_active: boolean;
  is_assumed: boolean;
  assumed_note: string | null;
}

export interface ResolvedBrand {
  name: string;
  logo_key: string;
  tagline: string | null;
  show_toll_free: boolean;
}

// Resolve the brand for a document from its division (service-line code). Matches
// an active brand mapped to that code; otherwise the group/default brand.
export async function resolveDocumentBrand(tenantId: string, serviceLineCode: string | null): Promise<ResolvedBrand> {
  const { rows } = await scopedRead(tenantId,
    `select name, logo_key, tagline, show_toll_free,
            (applies_to_service_line_code is not distinct from $2) as exact
       from document_branding
      where tenant_id = $1 and is_active
        and (applies_to_service_line_code = $2 or applies_to_service_line_code is null)
      order by exact desc
      limit 1`,
    [tenantId, serviceLineCode],
  );
  if (rows[0]) return rows[0] as ResolvedBrand;
  // Absolute fallback if branding was never seeded — never leave a document unbranded.
  return { name: "Mumtaz Integrated Services Group", logo_key: "mumtaz-isg.png", tagline: "Integrated Services Group", show_toll_free: true };
}

export async function listDocumentBranding(tenantId: string): Promise<DocumentBrand[]> {
  const { rows } = await scopedRead(tenantId,
    `select id, brand_key, name, logo_key, tagline, applies_to_service_line_code,
            show_toll_free, is_active, is_assumed, assumed_note
       from document_branding where tenant_id = $1 order by (applies_to_service_line_code is null) desc, name`,
    [tenantId],
  );
  return rows as DocumentBrand[];
}

export interface DocumentBrandInput {
  name?: string;
  logo_key?: string;
  tagline?: string;
  show_toll_free?: boolean;
}

const clean = (v?: string) => { const t = (v ?? "").trim(); return t === "" ? null : t; };

export async function updateDocumentBrand(tenantId: string, id: string, d: DocumentBrandInput): Promise<void> {
  if (!clean(d.name)) throw new Error("Name is required");
  if (!clean(d.logo_key)) throw new Error("Logo is required");
  await withTenantTx(tenantId, async (c) => {
    const before = (await c.query(
      `select name, logo_key, tagline, show_toll_free, is_assumed from document_branding where id=$1 and tenant_id=$2 for update`,
      [id, tenantId],
    )).rows[0];
    if (!before) throw new Error("Brand not found");
    await c.query(
      `update document_branding set name=$1, logo_key=$2, tagline=$3, show_toll_free=$4
              ${before.is_assumed ? ", is_assumed=false, confirmed_at=now()" : ""} where id=$5`,
      [(d.name ?? "").trim(), (d.logo_key ?? "").trim(), clean(d.tagline), d.show_toll_free ?? false, id],
    );
    await audit(c, tenantId, {
      table: "document_branding", rowId: id, action: "update",
      oldValue: before, newValue: d, note: "document branding edited in admin console",
    });
  });
}

// Logo assets bundled with the app that admin can choose between.
export const LOGO_CHOICES = [
  { key: "mumtaz-isg.png", label: "Mumtaz ISG (group)" },
  { key: "mumtaz-pest-control.png", label: "Mumtaz Pest Control" },
  { key: "mumtaz-cleaning-crew.png", label: "Mumtaz Cleaning Crew" },
  { key: "mumtaz-facilities-management.png", label: "Mumtaz Facilities Management" },
] as const;
