"use server";
import { requirePermission } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTenantId } from "@/lib/tenant";
import { getServiceLineId } from "@/lib/domain/reference";
import { createEstimate, addEstimateLine, addEstimateLineFromCategory, deleteEstimateLine, setEstimateStatus, convertEstimateToContract } from "@/lib/domain/estimation";

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


// Flow refresh item 3: estimates/surveys are mostly for NEW customers — the
// creation forms accept a compact inline customer (name + phone + emirate) and
// create it without leaving the flow. Full details completed later on the profile.
async function resolveOrCreateCustomer(tenantId: string, sl: string, fd: FormData): Promise<string> {
  const existing = String(fd.get("customer_id") ?? "").trim();
  if (existing) return existing;
  const name = String(fd.get("new_customer_name") ?? "").trim();
  if (!name) throw new Error("Pick a customer or enter a new customer name");
  const { createCustomer } = await import("@/lib/domain/customers");
  const { withRequest } = await import("@/lib/rls");
  const customerId = await createCustomer(tenantId, sl, {
    trade_name: name,
    customer_type: String(fd.get("new_customer_type") ?? "B2B") || "B2B",
    emirate: String(fd.get("new_customer_emirate") ?? "Sharjah") || "Sharjah",
  } as never);
  const phone = String(fd.get("new_customer_phone") ?? "").trim();
  if (phone) {
    await withRequest({ tenantId }, (c) =>
      c.query(
        `insert into contacts (tenant_id, service_line_id, customer_id, name, phone, is_primary, is_assumed, assumed_note)
         values ($1,$2,$3,'Primary contact',$4,true,true,'Captured inline at survey/estimate - confirm')`,
        [tenantId, sl, customerId, phone]));
  }
  return customerId;
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
  const customerId = await resolveOrCreateCustomer(tenantId, sl, fd);
  const id = await createEstimate(tenantId, sl, {
    customer_id: customerId,
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
