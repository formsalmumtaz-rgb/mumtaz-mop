"use server";
import { requirePermission } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { getTenantId } from "@/lib/tenant";
import { moveJobToDate } from "@/lib/domain/jobs";

// Drag-and-drop reschedule from the calendar. Moves the DAY only — the time and
// duration already on the job are preserved (the drop target is a day cell, so
// inventing a time would be a lie). Same domain function as the job page, so the
// audit entry and the customer schedule_change notice are identical.
export async function moveJobAction(
  jobId: string, toDate: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requirePermission("job.edit");
    if (!/^[0-9a-f-]{36}$/i.test(jobId)) return { ok: false, error: "bad job id" };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(toDate)) return { ok: false, error: "bad date" };
    const tenantId = await getTenantId();
    await moveJobToDate(tenantId, jobId, toDate);
    revalidatePath("/schedule");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
