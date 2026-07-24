"use server";
import { revalidatePath } from "next/cache";
import { getTenantId } from "@/lib/tenant";
import { confirmTechnician, updateTechnicianName } from "@/lib/domain/technicians";

export async function confirmAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const tenantId = await getTenantId();
  await confirmTechnician(tenantId, id);
  revalidatePath("/technicians");
}

export async function updateNameAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("full_name") ?? "").trim();
  if (!id || !name) return;
  const tenantId = await getTenantId();
  await updateTechnicianName(tenantId, id, name);
  revalidatePath("/technicians");
}
