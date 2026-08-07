"use server";
import { requirePermission } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { getTenantId } from "@/lib/tenant";
import { generateInvoiceNow, regenerateMissed } from "@/lib/domain/billing";

export async function generateNowAction(fd: FormData): Promise<void> {
  await requirePermission("billing.run");
  const contractId = String(fd.get("contract_id") ?? "");
  if (!contractId) return;
  const tenantId = await getTenantId();
  await generateInvoiceNow(tenantId, contractId);
  revalidatePath("/billing");
}

export async function regenerateMissedAction(): Promise<void> {
  await requirePermission("billing.run");
  const tenantId = await getTenantId();
  await regenerateMissed(tenantId);
  revalidatePath("/billing");
}
