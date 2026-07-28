"use server";
import { revalidatePath } from "next/cache";
import { getTenantId } from "@/lib/tenant";
import { getServiceLineId } from "@/lib/domain/reference";
import { createItem, updateItem, confirmItem, type ItemInput } from "@/lib/domain/items";

function itemInputFromForm(fd: FormData): ItemInput {
  return {
    name: String(fd.get("name") ?? ""),
    code: String(fd.get("code") ?? ""),
    base_unit_id: String(fd.get("base_unit_id") ?? ""),
    active_ingredient: String(fd.get("active_ingredient") ?? ""),
    intended_service_type_ids: fd.getAll("service_type_ids").map(String).filter(Boolean),
    is_recurring_stock: fd.get("is_recurring_stock") === "on",
    shelf_life_days: String(fd.get("shelf_life_days") ?? ""),
    reorder_level: String(fd.get("reorder_level") ?? ""),
  };
}

export async function createItemAction(fd: FormData): Promise<void> {
  const tenantId = await getTenantId();
  const sl = await getServiceLineId(tenantId);
  await createItem(tenantId, sl, itemInputFromForm(fd));
  revalidatePath("/chemicals");
}

export async function updateItemAction(fd: FormData): Promise<void> {
  const id = String(fd.get("id") ?? "");
  if (!id) return;
  const tenantId = await getTenantId();
  await updateItem(tenantId, id, itemInputFromForm(fd));
  revalidatePath("/chemicals");
}

export async function confirmItemAction(fd: FormData): Promise<void> {
  const id = String(fd.get("id") ?? "");
  if (!id) return;
  const tenantId = await getTenantId();
  await confirmItem(tenantId, id);
  revalidatePath("/chemicals");
}
