"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTenantId } from "@/lib/tenant";
import { getServiceLineId } from "@/lib/domain/reference";
import { createCustomer } from "@/lib/domain/customers";

export async function createCustomerAction(formData: FormData): Promise<void> {
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
