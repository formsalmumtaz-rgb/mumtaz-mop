"use server";
import { requirePermission } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { getTenantId } from "@/lib/tenant";
import { assignJob, rescheduleJob, setJobStatus } from "@/lib/domain/jobs";

export async function assignJobAction(fd: FormData): Promise<void> {
  await requirePermission("job.edit");
  const id = String(fd.get("id") ?? ""); if (!id) return;
  const teamId = String(fd.get("team_id") ?? "") || null;
  const technicianIds = fd.getAll("technician_ids").map(String).filter(Boolean);
  await assignJob(await getTenantId(), id, teamId, technicianIds);
  revalidatePath(`/jobs/${id}`);
}

export async function rescheduleJobAction(fd: FormData): Promise<void> {
  await requirePermission("job.edit");
  const id = String(fd.get("id") ?? ""); if (!id) return;
  await rescheduleJob(await getTenantId(), id,
    String(fd.get("scheduled_date") ?? ""),
    String(fd.get("scheduled_start") ?? "") || null,
    String(fd.get("est_duration_minutes") ?? "") || null);
  revalidatePath(`/jobs/${id}`);
}

export async function setJobStatusAction(fd: FormData): Promise<void> {
  await requirePermission("job.edit");
  const id = String(fd.get("id") ?? ""); if (!id) return;
  await setJobStatus(await getTenantId(), id, String(fd.get("status") ?? ""));
  revalidatePath(`/jobs/${id}`);
}
