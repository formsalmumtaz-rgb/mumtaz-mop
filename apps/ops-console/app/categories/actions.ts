"use server";
import { requirePermission } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { getTenantId } from "@/lib/tenant";
import { getServiceLineId } from "@/lib/domain/reference";
import { createCategory, updateCategory, archiveCategory, restoreCategory, type CategoryInput } from "@/lib/domain/categories";

function inputFromForm(fd: FormData): CategoryInput {
  return {
    code: String(fd.get("code") ?? ""),
    name: String(fd.get("name") ?? ""),
    property_type: String(fd.get("property_type") ?? ""),
    crew_size: String(fd.get("crew_size") ?? ""),
    est_duration_hours: String(fd.get("est_duration_hours") ?? ""),
    buffer_minutes: String(fd.get("buffer_minutes") ?? ""),
    est_material_cost: String(fd.get("est_material_cost") ?? ""),
    default_pricing_model_id: String(fd.get("default_pricing_model_id") ?? ""),
    default_measure: String(fd.get("default_measure") ?? ""),
    default_unit_price: String(fd.get("default_unit_price") ?? ""),
    recommended_price: String(fd.get("recommended_price") ?? ""),
    notes: String(fd.get("notes") ?? ""),
  };
}

export async function createCategoryAction(fd: FormData): Promise<void> {
  await requirePermission("settings.manage");
  const tenantId = await getTenantId();
  const sl = await getServiceLineId(tenantId);
  await createCategory(tenantId, sl, inputFromForm(fd));
  revalidatePath("/categories");
}

export async function updateCategoryAction(fd: FormData): Promise<void> {
  await requirePermission("settings.manage");
  const id = String(fd.get("id") ?? ""); if (!id) return;
  await updateCategory(await getTenantId(), id, inputFromForm(fd));
  revalidatePath("/categories");
}

export async function archiveCategoryAction(fd: FormData): Promise<void> {
  await requirePermission("settings.manage");
  const id = String(fd.get("id") ?? ""); if (!id) return;
  await archiveCategory(await getTenantId(), id);
  revalidatePath("/categories");
}

export async function restoreCategoryAction(fd: FormData): Promise<void> {
  await requirePermission("settings.manage");
  const id = String(fd.get("id") ?? ""); if (!id) return;
  await restoreCategory(await getTenantId(), id);
  revalidatePath("/categories");
}
