"use server";
import { requirePermission } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { getTenantId } from "@/lib/tenant";
import { confirmTechnician, updateTechnicianName, archiveTechnician, restoreTechnician } from "@/lib/domain/technicians";

export async function confirmAction(formData: FormData): Promise<void> {
  await requirePermission("settings.manage");
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const tenantId = await getTenantId();
  await confirmTechnician(tenantId, id);
  revalidatePath("/technicians");
}

export async function updateNameAction(formData: FormData): Promise<void> {
  await requirePermission("settings.manage");
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("full_name") ?? "").trim();
  if (!id || !name) return;
  const tenantId = await getTenantId();
  await updateTechnicianName(tenantId, id, name);
  revalidatePath("/technicians");
}

export async function archiveTechnicianAction(fd: FormData): Promise<void> {
  await requirePermission("settings.manage");
  const id = String(fd.get("id") ?? ""); if (!id) return;
  await archiveTechnician(await getTenantId(), id);
  revalidatePath("/technicians");
}
export async function restoreTechnicianAction(fd: FormData): Promise<void> {
  await requirePermission("settings.manage");
  const id = String(fd.get("id") ?? ""); if (!id) return;
  await restoreTechnician(await getTenantId(), id);
  revalidatePath("/technicians");
}
