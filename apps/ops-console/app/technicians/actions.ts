"use server";
import { requirePermission } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { getTenantId } from "@/lib/tenant";
import { getServiceLineId } from "@/lib/domain/reference";
import {
  createTechnician, updateTechnician, confirmTechnician,
  archiveTechnician, restoreTechnician, type TechnicianInput,
} from "@/lib/domain/technicians";

function inputFromForm(fd: FormData): TechnicianInput {
  return {
    code: String(fd.get("code") ?? ""),
    full_name: String(fd.get("full_name") ?? ""),
    phone: String(fd.get("phone") ?? ""),
    employee_ref: String(fd.get("employee_ref") ?? ""),
  };
}

export async function createTechnicianAction(fd: FormData): Promise<void> {
  await requirePermission("settings.manage");
  const tenantId = await getTenantId();
  const sl = await getServiceLineId(tenantId);
  await createTechnician(tenantId, sl, inputFromForm(fd));
  revalidatePath("/technicians");
}

export async function updateTechnicianAction(fd: FormData): Promise<void> {
  await requirePermission("settings.manage");
  const id = String(fd.get("id") ?? "");
  if (!id) return;
  await updateTechnician(await getTenantId(), id, inputFromForm(fd));
  revalidatePath("/technicians");
}

export async function confirmAction(fd: FormData): Promise<void> {
  await requirePermission("settings.manage");
  const id = String(fd.get("id") ?? "");
  if (!id) return;
  await confirmTechnician(await getTenantId(), id);
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
