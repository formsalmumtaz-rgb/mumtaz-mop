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
  label: string | null;
  accent_color: string | null;
  show_label_on_document: boolean;
  is_active: boolean;
  is_assumed: boolean;
  assumed_note: string | null;
}

export interface ResolvedBrand {
  name: string;
  logo_key: string;
  tagline: string | null;
  show_toll_free: boolean;
  label: string | null;         // short division label, e.g. 'Pest Control' (mig 052)
  accent_color: string | null;  // hex accent for this division (mig 052)
  show_label_on_document: boolean; // print the label on documents? (mig 053)
}

// Resolve the brand for a document from its division (service-line code). Matches
// an active brand mapped to that code; otherwise the group/default brand.
export async function resolveDocumentBrand(tenantId: string, serviceLineCode: string | null): Promise<ResolvedBrand> {
  const { rows } = await scopedRead(tenantId,
    `select name, logo_key, tagline, show_toll_free, label, accent_color, show_label_on_document,
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
  return { name: "Mumtaz Integrated Services Group", logo_key: "mumtaz-isg.png", tagline: "Integrated Services Group", show_toll_free: true, label: null, accent_color: "#A31E22", show_label_on_document: false };
}

// The group-level legal block every generated document footer must carry (mig
// 052): legal entity name, trade licence, offices. Reference data, editable from
// admin — no generator hardcodes any of it.
export interface BrandOffice { city: string; line1: string | null; line2: string | null }
export interface BrandOrg {
  legal_name: string;
  group_line: string | null;
  established: string | null;
  trade_licence: string | null;
  toll_free: string | null;
  email: string | null;
  offices: BrandOffice[];
}

export async function resolveDocumentBrandOrg(tenantId: string): Promise<BrandOrg> {
  const org = await scopedRead(tenantId,
    `select legal_name, group_line, established, trade_licence, toll_free, email
       from document_brand_org where tenant_id = $1 limit 1`,
    [tenantId],
  );
  const offices = await scopedRead(tenantId,
    `select city, line1, line2 from document_brand_office
      where tenant_id = $1 and is_active order by sort_order, city`,
    [tenantId],
  );
  const o = org.rows[0] ?? { legal_name: "Al Mumtaz Bldg Clean & Pest Control", group_line: "Mumtaz Integrated Services Group", established: "2006", trade_licence: "546486", toll_free: "800 688", email: null };
  return { ...o, offices: offices.rows as BrandOffice[] } as BrandOrg;
}

export async function listDocumentBranding(tenantId: string): Promise<DocumentBrand[]> {
  const { rows } = await scopedRead(tenantId,
    `select id, brand_key, name, logo_key, tagline, applies_to_service_line_code,
            show_toll_free, label, accent_color, show_label_on_document, is_active, is_assumed, assumed_note
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
  label?: string;
  accent_color?: string;
  show_label_on_document?: boolean;
}

const clean = (v?: string) => { const t = (v ?? "").trim(); return t === "" ? null : t; };
// Accept #RGB / #RRGGBB only; anything else is rejected so a bad value can never
// reach a generator's colour parser.
const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export async function updateDocumentBrand(tenantId: string, id: string, d: DocumentBrandInput): Promise<void> {
  if (!clean(d.name)) throw new Error("Name is required");
  if (!clean(d.logo_key)) throw new Error("Logo is required");
  const accent = clean(d.accent_color);
  if (accent && !HEX.test(accent)) throw new Error("Accent colour must be a hex value like #A31E22");
  await withTenantTx(tenantId, async (c) => {
    const before = (await c.query(
      `select name, logo_key, tagline, show_toll_free, label, accent_color, show_label_on_document, is_assumed from document_branding where id=$1 and tenant_id=$2 for update`,
      [id, tenantId],
    )).rows[0];
    if (!before) throw new Error("Brand not found");
    await c.query(
      `update document_branding set name=$1, logo_key=$2, tagline=$3, show_toll_free=$4, label=$5, accent_color=$6, show_label_on_document=$7
              ${before.is_assumed ? ", is_assumed=false, confirmed_at=now()" : ""} where id=$8`,
      [(d.name ?? "").trim(), (d.logo_key ?? "").trim(), clean(d.tagline), d.show_toll_free ?? false, clean(d.label), accent, d.show_label_on_document ?? true, id],
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
