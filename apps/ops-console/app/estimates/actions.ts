"use server";
import { requirePermission } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTenantId } from "@/lib/tenant";
import { getServiceLineId } from "@/lib/domain/reference";
import { createEstimate, addEstimateLine, deleteEstimateLine, setEstimateStatus, convertEstimateToContract } from "@/lib/domain/estimation";

export async function createEstimateAction(fd: FormData): Promise<void> {
  await requirePermission("estimate.edit");
  const tenantId = await getTenantId();
  const sl = await getServiceLineId(tenantId);
  const id = await createEstimate(tenantId, sl, {
    customer_id: String(fd.get("customer_id") ?? ""),
    property_type: String(fd.get("property_type") ?? ""),
    engagement_type: String(fd.get("engagement_type") ?? ""),
    valid_until: String(fd.get("valid_until") ?? ""),
    notes: String(fd.get("notes") ?? ""),
  });
  redirect(`/estimates/${id}`);
}

export async function addLineAction(fd: FormData): Promise<void> {
  await requirePermission("estimate.edit");
  const estimateId = String(fd.get("estimate_id") ?? "");
  if (!estimateId) return;
  const tenantId = await getTenantId();
  const sl = await getServiceLineId(tenantId);
  const measures: Record<string, number> = {};
  const keys = fd.getAll("measure_key").map(String);
  const vals = fd.getAll("measure_val").map(String);
  keys.forEach((k, i) => { if (k.trim()) measures[k.trim()] = Number(vals[i] ?? "0") || 0; });
  await addEstimateLine(tenantId, sl, estimateId, {
    service_type_id: String(fd.get("service_type_id") ?? ""),
    pricing_model_id: String(fd.get("pricing_model_id") ?? ""),
    description: String(fd.get("description") ?? ""),
    unit_price: String(fd.get("unit_price") ?? ""),
    measure: String(fd.get("measure") ?? ""),
    measures,
    est_labour_hours: String(fd.get("est_labour_hours") ?? ""),
    est_distance_km: String(fd.get("est_distance_km") ?? ""),
    est_material_cost: String(fd.get("est_material_cost") ?? ""),
  });
  revalidatePath(`/estimates/${estimateId}`);
}

export async function deleteLineAction(fd: FormData): Promise<void> {
  await requirePermission("estimate.edit");
  const id = String(fd.get("line_id") ?? "");
  const estimateId = String(fd.get("estimate_id") ?? "");
  if (!id) return;
  const tenantId = await getTenantId();
  await deleteEstimateLine(tenantId, id);
  revalidatePath(`/estimates/${estimateId}`);
}

export async function setStatusAction(fd: FormData): Promise<void> {
  await requirePermission("estimate.edit");
  const id = String(fd.get("estimate_id") ?? "");
  const status = String(fd.get("status") ?? "");
  if (!id || !status) return;
  const tenantId = await getTenantId();
  await setEstimateStatus(tenantId, id, status);
  revalidatePath(`/estimates/${id}`);
}

export async function convertToContractAction(fd: FormData): Promise<void> {
  await requirePermission("contract.edit");
  const id = String(fd.get("estimate_id") ?? "");
  if (!id) return;
  const tenantId = await getTenantId();
  const sl = await getServiceLineId(tenantId);
  const contractId = await convertEstimateToContract(tenantId, sl, id);
  redirect(`/contracts/${contractId}`);
}
