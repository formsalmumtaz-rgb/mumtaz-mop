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
  const id = await createCustomer(tenantId, sl, {
    trade_name: String(formData.get("trade_name") ?? ""),
    legal_name: String(formData.get("legal_name") ?? ""),
    trn: String(formData.get("trn") ?? ""),
    trade_license: String(formData.get("trade_license") ?? ""),
    customer_type: String(formData.get("customer_type") ?? ""),
    emirate,
  });

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
