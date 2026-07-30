"use server";
import { revalidatePath } from "next/cache";
import { getTenantId } from "@/lib/tenant";
import { getServiceLineId } from "@/lib/domain/reference";
import { createPricingModel, updatePricingModel, setServiceModels, type PricingModelInput } from "@/lib/domain/pricing";

function modelInput(fd: FormData): PricingModelInput {
  return {
    code: String(fd.get("code") ?? ""),
    name: String(fd.get("name") ?? ""),
    model_type: String(fd.get("model_type") ?? "fixed"),
    formula_base: String(fd.get("formula_base") ?? ""),
    formula_keys: fd.getAll("formula_key").map(String),
    formula_rates: fd.getAll("formula_rate").map(String),
  };
}

export async function createModelAction(fd: FormData): Promise<void> {
  const tenantId = await getTenantId();
  const sl = await getServiceLineId(tenantId);
  await createPricingModel(tenantId, sl, modelInput(fd));
  revalidatePath("/pricing");
}

export async function updateModelAction(fd: FormData): Promise<void> {
  const id = String(fd.get("id") ?? "");
  if (!id) return;
  const tenantId = await getTenantId();
  await updatePricingModel(tenantId, id, modelInput(fd));
  revalidatePath("/pricing");
}

export async function setServiceModelsAction(fd: FormData): Promise<void> {
  const serviceTypeId = String(fd.get("service_type_id") ?? "");
  if (!serviceTypeId) return;
  const tenantId = await getTenantId();
  const sl = await getServiceLineId(tenantId);
  const modelIds = fd.getAll("model_id").map(String);
  const defaultId = String(fd.get("default_id") ?? "") || null;
  await setServiceModels(tenantId, sl, serviceTypeId, modelIds, defaultId && modelIds.includes(defaultId) ? defaultId : null);
  revalidatePath("/pricing");
}
