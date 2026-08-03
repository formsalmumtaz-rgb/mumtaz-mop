"use server";
import { revalidatePath } from "next/cache";
import { getTenantId } from "@/lib/tenant";
import { activateContract } from "@/lib/domain/contracts";
import { setContractBilling } from "@/lib/domain/billing";

export async function setContractBillingAction(fd: FormData): Promise<void> {
  const id = String(fd.get("contract_id") ?? "");
  if (!id) return;
  const tenantId = await getTenantId();
  await setContractBilling(tenantId, id, {
    billing_frequency: String(fd.get("billing_frequency") ?? ""),
    billing_day: String(fd.get("billing_day") ?? ""),
    billing_interval_days: String(fd.get("billing_interval_days") ?? ""),
    auto_generate_invoice: fd.get("auto_generate_invoice") === "on",
    next_invoice_date: String(fd.get("next_invoice_date") ?? ""),
  });
  revalidatePath(`/contracts/${id}`);
}

export async function activateContractAction(fd: FormData): Promise<void> {
  const id = String(fd.get("contract_id") ?? "");
  if (!id) return;
  const tenantId = await getTenantId();
  await activateContract(tenantId, id);
  revalidatePath(`/contracts/${id}`);
}
