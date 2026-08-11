"use server";
import { requirePermission } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { getTenantId } from "@/lib/tenant";
import { createDivision, updateDivision, setDivisionActive } from "@/lib/domain/divisions";

export async function createDivisionAction(fd: FormData): Promise<void> {
  await requirePermission("settings.manage");
  await createDivision(await getTenantId(), String(fd.get("code") ?? ""), String(fd.get("name") ?? ""));
  revalidatePath("/settings/divisions");
}

export async function updateDivisionAction(fd: FormData): Promise<void> {
  await requirePermission("settings.manage");
  const id = String(fd.get("id") ?? ""); if (!id) return;
  await updateDivision(await getTenantId(), id, String(fd.get("name") ?? ""));
  revalidatePath("/settings/divisions");
}

export async function setDivisionActiveAction(fd: FormData): Promise<void> {
  await requirePermission("settings.manage");
  const id = String(fd.get("id") ?? ""); if (!id) return;
  await setDivisionActive(await getTenantId(), id, String(fd.get("active") ?? "") === "1");
  revalidatePath("/settings/divisions");
}
