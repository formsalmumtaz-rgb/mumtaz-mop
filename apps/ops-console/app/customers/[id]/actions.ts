"use server";
import { requirePermission } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { drainOnce, consumers } from "@mop/worker";
import { pool } from "@/lib/db";
import { getTenantId } from "@/lib/tenant";
import { getServiceLineId } from "@/lib/domain/reference";
import { updateCustomer, confirmCustomer } from "@/lib/domain/customers";
import { createBranch } from "@/lib/domain/branches";
import { createContract, activateContract } from "@/lib/domain/contracts";

const num = (v: FormDataEntryValue | null): number | null => {
  const s = String(v ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

export async function updateCustomerAction(formData: FormData): Promise<void> {
  await requirePermission("customer.edit");
  const id = String(formData.get("id"));
  const tenantId = await getTenantId();
  await updateCustomer(tenantId, id, {
    trade_name: String(formData.get("trade_name") ?? ""),
    legal_name: String(formData.get("legal_name") ?? ""),
    trn: String(formData.get("trn") ?? ""),
    trade_license: String(formData.get("trade_license") ?? ""),
    customer_type: String(formData.get("customer_type") ?? ""),
    emirate: String(formData.get("emirate") ?? ""),
  });
  revalidatePath(`/customers/${id}`);
}

export async function confirmCustomerAction(formData: FormData): Promise<void> {
  await requirePermission("customer.edit");
  const id = String(formData.get("id"));
  const tenantId = await getTenantId();
  await confirmCustomer(tenantId, id);
  revalidatePath(`/customers/${id}`);
}

export async function createBranchAction(formData: FormData): Promise<void> {
  await requirePermission("customer.edit");
  const customerId = String(formData.get("customer_id"));
  const tenantId = await getTenantId();
  const sl = await getServiceLineId(tenantId);
  await createBranch(tenantId, sl, customerId, {
    name: String(formData.get("name") ?? ""),
    address: String(formData.get("address") ?? ""),
    emirate: String(formData.get("emirate") ?? ""),
    facility_type_id: String(formData.get("facility_type_id") ?? ""),
    lat: num(formData.get("location_lat")),
    lng: num(formData.get("location_lng")),
  });
  revalidatePath(`/customers/${customerId}`);
}

export async function createContractAction(formData: FormData): Promise<void> {
  await requirePermission("contract.edit");
  const customerId = String(formData.get("customer_id"));
  const tenantId = await getTenantId();
  const sl = await getServiceLineId(tenantId);
  await createContract(tenantId, sl, customerId, {
    contract_number: String(formData.get("contract_number") ?? ""),
    frequency_id: String(formData.get("frequency_id") ?? ""),
    pricing_model_id: String(formData.get("pricing_model_id") ?? ""),
    contract_value: String(formData.get("contract_value") ?? ""),
    currency: String(formData.get("currency") ?? "AED"),
    start_date: String(formData.get("start_date") ?? ""),
    end_date: String(formData.get("end_date") ?? ""),
  });
  revalidatePath(`/customers/${customerId}`);
}

export async function activateContractAction(formData: FormData): Promise<void> {
  await requirePermission("contract.activate");
  const customerId = String(formData.get("customer_id"));
  const contractId = String(formData.get("contract_id"));
  const tenantId = await getTenantId();
  await activateContract(tenantId, contractId);
  // Fan out immediately (mirrors the production Supabase webhook). If the drain
  // fails, the event stays queued for the sweeper — activation still succeeds.
  try {
    await drainOnce(pool, consumers, { tenantId });
  } catch (e) {
    console.error("[activate] fan-out drain failed; event remains queued:", e);
  }
  revalidatePath(`/customers/${customerId}`);
}
