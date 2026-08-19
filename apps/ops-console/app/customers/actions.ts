"use server";
import { requirePermission } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTenantId } from "@/lib/tenant";
import { getServiceLineId } from "@/lib/domain/reference";
import { createCustomer, archiveCustomer, restoreCustomer } from "@/lib/domain/customers";

export async function createCustomerAction(formData: FormData): Promise<void> {
  await requirePermission("customer.edit");
  const tenantId = await getTenantId();
  const sl = await getServiceLineId(tenantId);
  const emirate = String(formData.get("emirate") ?? "");
  // Every field the form asks is carried through — a question the office answers
  // must never be silently dropped on the way to the record.
  const f = (k: string) => String(formData.get(k) ?? "");
  const id = await createCustomer(tenantId, sl, {
    trade_name: f("trade_name"), legal_name: f("legal_name"), trn: f("trn"),
    trade_license: f("trade_license"), customer_type: f("customer_type"), emirate,
    alias_name: f("alias_name"),
    industry_category_id: f("industry_category_id"),
    municipality_category_id: f("municipality_category_id"),
    trade_licence_no: f("trade_licence_no"), tl_expiry: f("tl_expiry"),
    contact_person: f("contact_person"), contact_designation: f("contact_designation"),
    whatsapp: f("whatsapp"),
    preferred_shift: f("preferred_shift"), preferred_language: f("preferred_language"),
    payment_terms: f("payment_terms"), billing_frequency: f("billing_frequency"),
    referred_by: f("referred_by"), access_notes: f("access_notes"),
    place_of_supply: f("place_of_supply"), district: f("district"),
    po_box: f("po_box"), priority: f("priority"),
    night_shift_service: f("night_shift_service"),
  });

  // The contact details the form collects become a real contact row — otherwise
  // the office types a phone number that lands nowhere.
  const cName = f("contact_person").trim(), cEmail = f("contact_email").trim();
  const cPhone = (f("contact_mobile").trim() || f("contact_phone").trim());
  if (cName || cEmail || cPhone) {
    const { withTenantTx } = await import("@/lib/domain/tx");
    await withTenantTx(tenantId, (c) => c.query(
      `insert into contacts (tenant_id, service_line_id, customer_id, name, phone, email, role)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [tenantId, sl, id, cName || "Primary contact", cPhone || null, cEmail || null,
       f("contact_designation").trim() || null]));
  }

  // Item 16: the FIRST site is captured on the same form. The pin is geocoded
  // server-side from the address (Art. XVII); geocode failure just leaves the
  // pin empty — never invented, addable later on the profile.
  const siteAddress = String(formData.get("site_address") ?? "").trim();
  const siteFacility = String(formData.get("site_facility_type_id") ?? "").trim();
  if (siteAddress || siteFacility) {
    let lat: number | null = null, lng: number | null = null;
    if (siteAddress) {
      try {
        const { routeProvider } = await import("@/lib/route-provider");
        const geo = await routeProvider.geocode(`${siteAddress}, ${emirate}, United Arab Emirates`);
        if (geo) { lat = geo.location.lat; lng = geo.location.lng; }
      } catch { /* no key / provider down — site saved without a pin */ }
    }
    const { createBranch } = await import("@/lib/domain/branches");
    await createBranch(tenantId, sl, id, {
      name: "Main site",
      address: siteAddress || undefined,
      emirate,
      facility_type_id: siteFacility || undefined,
      lat, lng,
    });
  }

  revalidatePath("/customers");
  redirect(`/customers/${id}`);
}

export async function archiveCustomerAction(fd: FormData): Promise<void> {
  await requirePermission("customer.edit");
  const id = String(fd.get("id") ?? "");
  if (!id) return;
  await archiveCustomer(await getTenantId(), id);
  revalidatePath("/customers");
}

export async function restoreCustomerAction(fd: FormData): Promise<void> {
  await requirePermission("customer.edit");
  const id = String(fd.get("id") ?? "");
  if (!id) return;
  await restoreCustomer(await getTenantId(), id);
  revalidatePath("/customers");
}
