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
  const id = await createCustomer(tenantId, sl, {
    trade_name: String(formData.get("trade_name") ?? ""),
    legal_name: String(formData.get("legal_name") ?? ""),
    trn: String(formData.get("trn") ?? ""),
    trade_license: String(formData.get("trade_license") ?? ""),
    customer_type: String(formData.get("customer_type") ?? ""),
    emirate: String(formData.get("emirate") ?? ""),
  });
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
