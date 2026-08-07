"use server";
import { requirePermission } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTenantId } from "@/lib/tenant";
import { createCreditNote, addCreditNoteLine, deleteCreditNoteLine, issueCreditNote, recordRefund } from "@/lib/domain/creditnotes";

export async function createCreditNoteAction(fd: FormData): Promise<void> {
  await requirePermission("creditnote.issue");
  const invoiceId = String(fd.get("invoice_id") ?? "");
  if (!invoiceId) return;
  const tenantId = await getTenantId();
  const id = await createCreditNote(tenantId, {
    invoice_id: invoiceId,
    reason: String(fd.get("reason") ?? ""),
    vat_treatment: String(fd.get("vat_treatment") ?? "standard"),
  });
  redirect(`/credit-notes/${id}`);
}

export async function addCreditNoteLineAction(fd: FormData): Promise<void> {
  await requirePermission("creditnote.issue");
  const cnId = String(fd.get("cn_id") ?? "");
  if (!cnId) return;
  const tenantId = await getTenantId();
  await addCreditNoteLine(tenantId, cnId, {
    description: String(fd.get("description") ?? ""),
    quantity: String(fd.get("quantity") ?? "1"),
    unit_price: String(fd.get("unit_price") ?? "0"),
  });
  revalidatePath(`/credit-notes/${cnId}`);
}

export async function deleteCreditNoteLineAction(fd: FormData): Promise<void> {
  await requirePermission("creditnote.issue");
  const lineId = String(fd.get("line_id") ?? "");
  const cnId = String(fd.get("cn_id") ?? "");
  if (!lineId || !cnId) return;
  const tenantId = await getTenantId();
  await deleteCreditNoteLine(tenantId, lineId, cnId);
  revalidatePath(`/credit-notes/${cnId}`);
}

export async function issueCreditNoteAction(fd: FormData): Promise<void> {
  await requirePermission("creditnote.issue");
  const id = String(fd.get("cn_id") ?? "");
  if (!id) return;
  const tenantId = await getTenantId();
  await issueCreditNote(tenantId, id);
  revalidatePath(`/credit-notes/${id}`);
}

export async function recordRefundAction(fd: FormData): Promise<void> {
  await requirePermission("refund.record");
  const cnId = String(fd.get("cn_id") ?? "");
  if (!cnId) return;
  const tenantId = await getTenantId();
  await recordRefund(tenantId, {
    credit_note_id: cnId,
    method: String(fd.get("method") ?? "cash"),
    amount: String(fd.get("amount") ?? ""),
    reference: String(fd.get("reference") ?? ""),
    others_note: String(fd.get("others_note") ?? ""),
  });
  revalidatePath(`/credit-notes/${cnId}`);
}
