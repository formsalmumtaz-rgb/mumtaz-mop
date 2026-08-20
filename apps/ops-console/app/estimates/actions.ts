"use server";
import { costVisible } from "@/lib/costing-visibility";
import { requirePermission } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTenantId } from "@/lib/tenant";
import { getServiceLineId } from "@/lib/domain/reference";
import { createEstimate, addEstimateLine, addEstimateLineFromCategory, deleteEstimateLine, setEstimateStatus, convertEstimateToContract, suggestLinePrice, getLineDefaults } from "@/lib/domain/estimation";

export async function addLineFromCategoryAction(fd: FormData): Promise<void> {
  await requirePermission("estimate.edit");
  const estimateId = String(fd.get("estimate_id") ?? "");
  const categoryId = String(fd.get("category_id") ?? "");
  if (!estimateId || !categoryId) return;
  const tenantId = await getTenantId();
  const sl = await getServiceLineId(tenantId);
  await addEstimateLineFromCategory(tenantId, sl, estimateId, categoryId);
  revalidatePath(`/estimates/${estimateId}`);
}


export async function createEstimateAction(fd: FormData): Promise<void> {
  await requirePermission("estimate.edit");
  const tenantId = await getTenantId();
  // P0-3: explicit service line from the form (prefilled with the active
  // division, editable); the cookie is only the fallback for older forms.
  // Validated against this tenant's own lines — form input, system boundary.
  const requested = String(fd.get("service_line_id") ?? "").trim();
  let sl = await getServiceLineId(tenantId);
  if (requested && requested !== sl) {
    const { listServiceLines } = await import("@/lib/domain/reference");
    const lines = await listServiceLines(tenantId);
    if (lines.some((l) => l.id === requested)) sl = requested;
  }
  // Flow 6+7: inline customer creates a REAL record (shared path); the site is
  // inherited automatically when the customer has exactly one branch.
  const { resolveOrCreateInlineCustomer, defaultBranchId } = await import("@/lib/domain/customers");
  const cust = await resolveOrCreateInlineCustomer(tenantId, sl, fd);
  const branchId = await defaultBranchId(tenantId, cust.id);
  const id = await createEstimate(tenantId, sl, {
    customer_id: cust.id,
    branch_id: branchId ?? undefined,
    property_type: String(fd.get("property_type") ?? ""),
    engagement_type: String(fd.get("engagement_type") ?? ""),
    valid_until: String(fd.get("valid_until") ?? ""),
    notes: String(fd.get("notes") ?? ""),
  });
  redirect(cust.created ? `/estimates/${id}?created=${encodeURIComponent(cust.code ?? "")}` : `/estimates/${id}`);
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
  // Cost inputs are only accepted from a session that may see cost. The sales
  // role never renders these fields, so anything arriving in them came from a
  // crafted request — and a zeroed material cost would quietly distort job
  // costing, contract profitability and every report built on them. Ignored,
  // and the engine's own figures used instead.
  const mayCost = await costVisible();
  const engine = mayCost ? null : await getLineDefaults(tenantId, sl, estimateId);
  await addEstimateLine(tenantId, sl, estimateId, {
    service_type_id: String(fd.get("service_type_id") ?? ""),
    pricing_model_id: String(fd.get("pricing_model_id") ?? ""),
    description: String(fd.get("description") ?? ""),
    unit_price: String(fd.get("unit_price") ?? ""),
    measure: String(fd.get("measure") ?? ""),
    measures,
    est_labour_hours: mayCost ? String(fd.get("est_labour_hours") ?? "") : String(engine!.labour_hours ?? ""),
    est_distance_km: mayCost ? String(fd.get("est_distance_km") ?? "") : String(engine!.round_trip_km ?? ""),
    est_material_cost: mayCost ? String(fd.get("est_material_cost") ?? "") : "",
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

// P0-1 / flow item 10: "Generate quotation" is the single primary action on a
// draft estimate. It freezes the snapshot + assigns the quotation number (what
// setEstimateStatus('quoted') already does) and lands the user straight on the
// quotation — no separate "mark as quoted" step before you can see it.
export async function generateQuotationAction(fd: FormData): Promise<void> {
  await requirePermission("estimate.edit");
  const id = String(fd.get("estimate_id") ?? "");
  if (!id) return;
  const tenantId = await getTenantId();
  await setEstimateStatus(tenantId, id, "quoted");
  redirect(`/estimates/${id}/quotation`);
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

// Release 1 item 2 — one click instead of Accept → wait → Convert. Accepts the
// quoted estimate and immediately creates + opens its contract (both steps are the
// existing idempotent domain functions; conversion refuses if already linked).
export async function acceptAndConvertAction(fd: FormData): Promise<void> {
  await requirePermission("estimate.edit");
  await requirePermission("contract.edit");
  const id = String(fd.get("estimate_id") ?? "");
  if (!id) return;
  const tenantId = await getTenantId();
  const sl = await getServiceLineId(tenantId);
  await setEstimateStatus(tenantId, id, "accepted");
  const contractId = await convertEstimateToContract(tenantId, sl, id);
  redirect(`/contracts/${contractId}`);
}

// The suggested price for a line in progress — ONE number.
//
// The suggestion depends on what the user is typing, so it cannot be
// precomputed; and it must not be computed in the browser, because that needs
// the labour, vehicle, overhead and material rates. So it is computed here, per
// call, from operational inputs the seller already knows (hours, distance,
// area) and returns the price alone — no cost, no margin, no target percentage.
// A role barred from margin cannot derive it from this.
export async function suggestLinePriceAction(
  estimateId: string,
  inputs: { labour_hours?: number; distance_km?: number; area_m2?: number },
): Promise<{ suggested: number | null }> {
  await requirePermission("estimate.edit");
  const tenantId = await getTenantId();
  const sl = await getServiceLineId(tenantId);
  return suggestLinePrice(tenantId, sl, estimateId, inputs);
}
