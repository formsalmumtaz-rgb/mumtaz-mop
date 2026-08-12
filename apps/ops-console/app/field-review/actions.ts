"use server";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { getTenantId } from "@/lib/tenant";
import { approveHeldFieldEvent, rejectHeldFieldEvent } from "@/lib/domain/fieldReview";

export async function approveFieldEventAction(fd: FormData): Promise<void> {
  const s = await requirePermission("settings.manage");
  const id = String(fd.get("event_id") ?? "");
  if (!id) return;
  await approveHeldFieldEvent(await getTenantId(), s?.userId ?? "", id);
  revalidatePath("/field-review");
}

export async function rejectFieldEventAction(fd: FormData): Promise<void> {
  const s = await requirePermission("settings.manage");
  const id = String(fd.get("event_id") ?? "");
  if (!id) return;
  await rejectHeldFieldEvent(await getTenantId(), s?.userId ?? "", id);
  revalidatePath("/field-review");
}
