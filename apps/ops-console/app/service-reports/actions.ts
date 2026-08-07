"use server";
import { requirePermission } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTenantId } from "@/lib/tenant";
import { createServiceReport, reviewServiceReport, addServiceReportAttachment } from "@/lib/domain/servicereports";

export async function createServiceReportAction(fd: FormData): Promise<void> {
  await requirePermission("service_report.file");
  const jobId = String(fd.get("job_id") ?? "");
  if (!jobId) return;
  const tenantId = await getTenantId();
  const id = await createServiceReport(tenantId, jobId, {
    performed_by: String(fd.get("performed_by") ?? ""),
    notes: String(fd.get("notes") ?? ""),
  });
  redirect(`/service-reports/${id}`);
}

export async function reviewServiceReportAction(fd: FormData): Promise<void> {
  await requirePermission("service_report.approve");
  const id = String(fd.get("sr_id") ?? "");
  const action = String(fd.get("action") ?? "");
  if (!id || (action !== "approved" && action !== "rejected")) return;
  const tenantId = await getTenantId();
  await reviewServiceReport(tenantId, id, action, String(fd.get("note") ?? ""));
  revalidatePath(`/service-reports/${id}`);
}

export async function addAttachmentAction(fd: FormData): Promise<void> {
  await requirePermission("service_report.file");
  const id = String(fd.get("sr_id") ?? "");
  if (!id) return;
  const tenantId = await getTenantId();
  await addServiceReportAttachment(tenantId, id, {
    kind: String(fd.get("kind") ?? "document"),
    storage_key: String(fd.get("storage_key") ?? ""),
    caption: String(fd.get("caption") ?? ""),
  });
  revalidatePath(`/service-reports/${id}`);
}
