"use server";
import { requirePermission } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTenantId } from "@/lib/tenant";
import { getServiceLineId } from "@/lib/domain/reference";
import { createSurvey, addSurveyLine, addSurveyLineFromCategory, deleteSurveyLine, setSurveyStatus, createEstimateFromSurvey } from "@/lib/domain/survey";

export async function addSurveyLineFromCategoryAction(fd: FormData): Promise<void> {
  await requirePermission("survey.edit");
  const surveyId = String(fd.get("survey_id") ?? "");
  const categoryId = String(fd.get("category_id") ?? "");
  if (!surveyId || !categoryId) return;
  const tenantId = await getTenantId();
  const sl = await getServiceLineId(tenantId);
  await addSurveyLineFromCategory(tenantId, sl, surveyId, categoryId);
  revalidatePath(`/surveys/${surveyId}`);
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

export async function createSurveyAction(fd: FormData): Promise<void> {
  await requirePermission("survey.edit");
  const tenantId = await getTenantId();
  const sl = await getServiceLineId(tenantId);
  const customerId = await resolveOrCreateCustomer(tenantId, sl, fd);
  const id = await createSurvey(tenantId, sl, {
    customer_id: customerId,
    surveyor_id: String(fd.get("surveyor_id") ?? ""),
    survey_date: String(fd.get("survey_date") ?? ""),
    property_type: String(fd.get("property_type") ?? ""),
    notes: String(fd.get("notes") ?? ""),
  });
  redirect(`/surveys/${id}`);
}

export async function addSurveyLineAction(fd: FormData): Promise<void> {
  await requirePermission("survey.edit");
  const surveyId = String(fd.get("survey_id") ?? "");
  if (!surveyId) return;
  const tenantId = await getTenantId();
  const sl = await getServiceLineId(tenantId);
  const measures: Record<string, number> = {};
  const keys = fd.getAll("measure_key").map(String);
  const vals = fd.getAll("measure_val").map(String);
  keys.forEach((k, i) => { if (k.trim()) measures[k.trim()] = Number(vals[i] ?? "0") || 0; });
  await addSurveyLine(tenantId, sl, surveyId, {
    service_type_id: String(fd.get("service_type_id") ?? ""),
    pricing_model_id: String(fd.get("pricing_model_id") ?? ""),
    description: String(fd.get("description") ?? ""),
    unit_price: String(fd.get("unit_price") ?? ""),
    measure: String(fd.get("measure") ?? ""),
    measures,
    est_labour_hours: String(fd.get("est_labour_hours") ?? ""),
    est_distance_km: String(fd.get("est_distance_km") ?? ""),
    est_material_cost: String(fd.get("est_material_cost") ?? ""),
    observed_notes: String(fd.get("observed_notes") ?? ""),
  });
  revalidatePath(`/surveys/${surveyId}`);
}

export async function deleteSurveyLineAction(fd: FormData): Promise<void> {
  await requirePermission("survey.edit");
  const id = String(fd.get("line_id") ?? "");
  const surveyId = String(fd.get("survey_id") ?? "");
  if (!id) return;
  const tenantId = await getTenantId();
  await deleteSurveyLine(tenantId, id);
  revalidatePath(`/surveys/${surveyId}`);
}

export async function setSurveyStatusAction(fd: FormData): Promise<void> {
  await requirePermission("survey.edit");
  const id = String(fd.get("survey_id") ?? "");
  const status = String(fd.get("status") ?? "");
  if (!id || !status) return;
  const tenantId = await getTenantId();
  await setSurveyStatus(tenantId, id, status);
  revalidatePath(`/surveys/${id}`);
}

export async function createEstimateFromSurveyAction(fd: FormData): Promise<void> {
  await requirePermission("estimate.edit");
  const id = String(fd.get("survey_id") ?? "");
  if (!id) return;
  const tenantId = await getTenantId();
  const sl = await getServiceLineId(tenantId);
  const estimateId = await createEstimateFromSurvey(tenantId, sl, id);
  redirect(`/estimates/${estimateId}`);
}
