"use server";
import { requirePermission } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { getTenantId } from "@/lib/tenant";
import {
  activateContract, updateContract, extendContractEndDate,
  archiveContract, restoreContract,
} from "@/lib/domain/contracts";
import { setContractBilling } from "@/lib/domain/billing";

export async function updateContractAction(fd: FormData): Promise<void> {
  await requirePermission("contract.edit");
  const id = String(fd.get("contract_id") ?? ""); if (!id) return;
  await updateContract(await getTenantId(), id, {
    contract_number: String(fd.get("contract_number") ?? ""),
    frequency_id: String(fd.get("frequency_id") ?? ""),
    pricing_model_id: String(fd.get("pricing_model_id") ?? ""),
    contract_value: String(fd.get("contract_value") ?? ""),
    currency: String(fd.get("currency") ?? "AED"),
    start_date: String(fd.get("start_date") ?? ""),
    end_date: String(fd.get("end_date") ?? ""),
  });
  revalidatePath(`/contracts/${id}`);
}

export async function extendContractAction(fd: FormData): Promise<void> {
  await requirePermission("contract.edit");
  const id = String(fd.get("contract_id") ?? ""); if (!id) return;
  await extendContractEndDate(await getTenantId(), id, String(fd.get("end_date") ?? ""));
  revalidatePath(`/contracts/${id}`);
}

export async function archiveContractAction(fd: FormData): Promise<void> {
  await requirePermission("contract.edit");
  const id = String(fd.get("contract_id") ?? ""); if (!id) return;
  await archiveContract(await getTenantId(), id);
  revalidatePath(`/contracts/${id}`);
}

export async function restoreContractAction(fd: FormData): Promise<void> {
  await requirePermission("contract.edit");
  const id = String(fd.get("contract_id") ?? ""); if (!id) return;
  await restoreContract(await getTenantId(), id);
  revalidatePath(`/contracts/${id}`);
}

export async function setContractBillingAction(fd: FormData): Promise<void> {
  await requirePermission("contract.edit");
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
  await requirePermission("contract.activate");
  const id = String(fd.get("contract_id") ?? "");
  if (!id) return;
  const tenantId = await getTenantId();
  await activateContract(tenantId, id);
  revalidatePath(`/contracts/${id}`);
}
