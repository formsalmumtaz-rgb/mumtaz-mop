"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { getTenantId } from "@/lib/tenant";
import { stageCustomerCsv, commitImportBatch, abandonImportBatch } from "@/lib/domain/imports";

const MAX_BYTES = 8 * 1024 * 1024; // a customer list is text; 8 MB is thousands of rows

export async function uploadImportAction(fd: FormData): Promise<void> {
  await requirePermission("settings.manage");
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) redirect("/imports?error=Choose+a+CSV+file+first");
  if (file.size > MAX_BYTES) redirect("/imports?error=That+file+is+too+large+(max+8+MB)");
  const text = await file.text();
  let batchId: string;
  try {
    const res = await stageCustomerCsv(await getTenantId(), text, `upload: ${file.name}`);
    batchId = res.batchId;
  } catch (e) {
    redirect(`/imports?error=${encodeURIComponent((e as Error).message)}`);
  }
  revalidatePath("/imports");
  redirect(`/imports/${batchId}`);
}

export async function commitImportAction(fd: FormData): Promise<void> {
  await requirePermission("settings.manage");
  const id = String(fd.get("id") ?? "");
  try {
    await commitImportBatch(await getTenantId(), id);
  } catch (e) {
    redirect(`/imports/${id}?error=${encodeURIComponent((e as Error).message)}`);
  }
  revalidatePath(`/imports/${id}`);
  revalidatePath("/customers");
  redirect(`/imports/${id}?committed=1`);
}

export async function abandonImportAction(fd: FormData): Promise<void> {
  await requirePermission("settings.manage");
  const id = String(fd.get("id") ?? "");
  await abandonImportBatch(await getTenantId(), id);
  revalidatePath(`/imports/${id}`);
  revalidatePath("/imports");
}
