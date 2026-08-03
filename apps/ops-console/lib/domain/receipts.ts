import "server-only";
import { pool } from "../db";
import { withTenantTx } from "./tx";
import { audit } from "./audit";

// Receipts & Payments subledger (mig 035). No GL posting (unified engine later).
// Allocation rules are enforced deterministically in fn_record_receipt.

export interface ReceiptHeader {
  id: string; receipt_number: string | null; customer_id: string | null; customer: string | null;
  receipt_date: string | null; method: string; amount: number; reference: string | null;
  others_note: string | null; allocated_count: number;
}

export async function listReceipts(tenantId: string): Promise<ReceiptHeader[]> {
  const { rows } = await pool.query(
    `select r.id, r.receipt_number, r.customer_id, cu.trade_name as customer, r.receipt_date::text,
            r.method, r.amount::float8, r.reference, r.others_note,
            (select count(*)::int from receipt_allocations ra where ra.receipt_id = r.id) as allocated_count
       from receipts r left join customers cu on cu.id = r.customer_id
      where r.tenant_id = $1 order by r.receipt_date desc, r.created_at desc`,
    [tenantId],
  );
  return rows as ReceiptHeader[];
}

export interface ReceiptAllocation { id: string; invoice_id: string; invoice_number: string | null; amount: number; }

export async function getReceipt(tenantId: string, id: string): Promise<{ header: ReceiptHeader; allocations: ReceiptAllocation[] } | null> {
  const { rows: hdr } = await pool.query(
    `select r.id, r.receipt_number, r.customer_id, cu.trade_name as customer, r.receipt_date::text,
            r.method, r.amount::float8, r.reference, r.others_note, 0 as allocated_count
       from receipts r left join customers cu on cu.id = r.customer_id
      where r.tenant_id=$1 and r.id=$2`,
    [tenantId, id],
  );
  if (!hdr[0]) return null;
  const { rows: alloc } = await pool.query(
    `select ra.id, ra.invoice_id, i.invoice_number, ra.amount::float8
       from receipt_allocations ra left join invoices i on i.id = ra.invoice_id
      where ra.tenant_id=$1 and ra.receipt_id=$2 order by ra.created_at`,
    [tenantId, id],
  );
  return { header: hdr[0] as ReceiptHeader, allocations: alloc as ReceiptAllocation[] };
}

export interface OpenInvoice {
  invoice_id: string; invoice_number: string | null; issue_date: string | null; due_date: string | null;
  total: number; balance: number; is_contract_invoice: boolean; aging_bucket: string;
}

// Open (issued/queued, unpaid/partial) invoices for a customer — the allocation queue.
export async function listOpenInvoicesForCustomer(tenantId: string, customerId: string): Promise<OpenInvoice[]> {
  const { rows } = await pool.query(
    `select ar.invoice_id, ar.invoice_number, ar.issue_date::text, ar.due_date::text,
            ar.total::float8, ar.balance::float8, ar.is_contract_invoice, ar.aging_bucket
       from invoice_ar ar
       join invoices i on i.id = ar.invoice_id
      where ar.tenant_id=$1 and ar.customer_id=$2 and i.status in ('issued','queued') and ar.balance > 0
      order by ar.due_date nulls last`,
    [tenantId, customerId],
  );
  return rows as OpenInvoice[];
}

export async function recordReceipt(
  tenantId: string,
  d: { customer_id: string; receipt_date?: string; method: string; reference?: string; others_note?: string;
       allocations: { invoice_id: string; amount: number }[] },
): Promise<string> {
  const allocations = d.allocations.filter((a) => a.amount > 0);
  if (allocations.length === 0) throw new Error("Enter at least one allocation amount");
  const amount = Math.round(allocations.reduce((s, a) => s + a.amount, 0) * 100) / 100;
  return withTenantTx(tenantId, async (c) => {
    const { rows } = await c.query(
      `select fn_record_receipt($1,$2,$3::date,$4,$5,$6,$7,$8::jsonb) as id`,
      [tenantId, d.customer_id, (d.receipt_date ?? "").trim() || null, d.method, amount,
       (d.reference ?? "").trim() || null, (d.others_note ?? "").trim() || null, JSON.stringify(allocations)],
    );
    await audit(c, tenantId, { table: "receipts", rowId: rows[0].id, action: "insert", newValue: { amount, method: d.method, allocations }, note: "receipt recorded" });
    return rows[0].id as string;
  });
}
