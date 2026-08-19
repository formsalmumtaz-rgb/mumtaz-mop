"use server";
import { requirePermission } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { getTenantId } from "@/lib/tenant";
import { approveSchedule } from "@/lib/domain/approvals";

export async function approveScheduleAction(fd: FormData): Promise<void> {
  await requirePermission("job.edit");
  const tenantId = await getTenantId();
  await approveSchedule(
    tenantId,
    String(fd.get("operating_date")),
    String(fd.get("shift_id") ?? "") || null,
    String(fd.get("note") ?? "") || undefined,
  );
  revalidatePath("/schedule/approvals");
}
