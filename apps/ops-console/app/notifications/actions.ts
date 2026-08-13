"use server";
import { requirePermission } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { getTenantId } from "@/lib/tenant";
import { resendNotification, runNotificationSweep } from "@mop/worker";
import { pool } from "@/lib/db";

export async function resendNotificationAction(fd: FormData): Promise<void> {
  await requirePermission("customer.view");
  const id = String(fd.get("id") ?? "");
  if (!id) return;
  const tenantId = await getTenantId();
  await resendNotification(pool, tenantId, id);
  revalidatePath("/notifications");
}

export async function runSweepAction(): Promise<void> {
  await requirePermission("customer.view");
  await runNotificationSweep(pool);
  revalidatePath("/notifications");
}
