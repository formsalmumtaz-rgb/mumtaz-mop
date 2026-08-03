"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTenantId } from "@/lib/tenant";
import { createManualInvoice, addInvoiceLine, deleteInvoiceLine, issueInvoice, cancelInvoice } from "@/lib/domain/invoices";

export async function createInvoiceAction(fd: FormData): Promise<void> {
  const customerId = String(fd.get("customer_id") ?? "");
  if (!customerId) return;
  const tenantId = await getTenantId();
  const id = await createManualInvoice(tenantId, {
    customer_id: customerId,
    vat_treatment: String(fd.get("vat_treatment") ?? "standard"),
  });
  redirect(`/invoices/${id}`);
}

export async function addInvoiceLineAction(fd: FormData): Promise<void> {
  const invoiceId = String(fd.get("invoice_id") ?? "");
  if (!invoiceId) return;
  const tenantId = await getTenantId();
  await addInvoiceLine(tenantId, invoiceId, {
    description: String(fd.get("description") ?? ""),
    quantity: String(fd.get("quantity") ?? "1"),
    unit_price: String(fd.get("unit_price") ?? "0"),
  });
  revalidatePath(`/invoices/${invoiceId}`);
}

export async function deleteInvoiceLineAction(fd: FormData): Promise<void> {
  const lineId = String(fd.get("line_id") ?? "");
  const invoiceId = String(fd.get("invoice_id") ?? "");
  if (!lineId || !invoiceId) return;
  const tenantId = await getTenantId();
  await deleteInvoiceLine(tenantId, lineId, invoiceId);
  revalidatePath(`/invoices/${invoiceId}`);
}

export async function issueInvoiceAction(fd: FormData): Promise<void> {
  const id = String(fd.get("invoice_id") ?? "");
  if (!id) return;
  const tenantId = await getTenantId();
  await issueInvoice(tenantId, id);
  revalidatePath(`/invoices/${id}`);
}

export async function cancelInvoiceAction(fd: FormData): Promise<void> {
  const id = String(fd.get("invoice_id") ?? "");
  if (!id) return;
  const tenantId = await getTenantId();
  await cancelInvoice(tenantId, id, String(fd.get("reason") ?? ""));
  revalidatePath(`/invoices/${id}`);
}
