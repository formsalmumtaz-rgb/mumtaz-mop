"use server";
import { requirePermission } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getTenantId } from "@/lib/tenant";
import { recordReceipt } from "@/lib/domain/receipts";

export async function recordReceiptAction(fd: FormData): Promise<void> {
  await requirePermission("payment.record");
  const customerId = String(fd.get("customer_id") ?? "");
  if (!customerId) return;
  const tenantId = await getTenantId();
  // Allocation inputs are named alloc_<invoiceId>
  const allocations: { invoice_id: string; amount: number }[] = [];
  for (const [k, v] of fd.entries()) {
    if (k.startsWith("alloc_")) {
      const amount = Number(String(v).trim());
      if (Number.isFinite(amount) && amount > 0) allocations.push({ invoice_id: k.slice(6), amount: Math.round(amount * 100) / 100 });
    }
  }
  const id = await recordReceipt(tenantId, {
    customer_id: customerId,
    receipt_date: String(fd.get("receipt_date") ?? ""),
    method: String(fd.get("method") ?? "cash"),
    reference: String(fd.get("reference") ?? ""),
    others_note: String(fd.get("others_note") ?? ""),
    allocations,
  });
  redirect(`/receipts/${id}`);
}
