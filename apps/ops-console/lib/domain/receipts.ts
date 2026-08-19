import "server-only";
import { scopedRead } from "../rls";
import { withTenantTx } from "./tx";
import { audit } from "./audit";

// Receipts & Payments subledger (mig 035). No GL posting (unified engine later).
// Allocation rules are enforced deterministically in fn_record_receipt.

export interface ReceiptHeader {
  customer_code: string | null;
  id: string; receipt_number: string | null; customer_id: string | null; customer: string | null;
  receipt_date: string | null; method: string; amount: number; reference: string | null;
  others_note: string | null; allocated_count: number; reversed_at?: string | null; reversed_reason?: string | null;
}

// Reverse a receipt (bounced cheque / misapplied). Append-only: records a
// receipt_reversals row, reverts any invoices it had paid, posts the reversing
// GL entry — all in fn_reverse_receipt.
export async function reverseReceipt(tenantId: string, id: string, reason: string): Promise<void> {
  await withTenantTx(tenantId, async (c) => {
    await c.query(`select fn_reverse_receipt($1, $2)`, [id, reason]);
    await audit(c, tenantId, { table: "receipts", rowId: id, action: "update", newValue: { reversed: true, reason }, note: "receipt reversed" });
  });
}

export async function listReceipts(tenantId: string): Promise<ReceiptHeader[]> {
  const { rows } = await scopedRead(tenantId,
    `select r.id, r.receipt_number, r.customer_id, cu.trade_name as customer, cu.code as customer_code, r.receipt_date::text,
            r.method, r.amount::float8, r.reference, r.others_note,
            (select count(*)::int from receipt_allocations ra where ra.receipt_id = r.id) as allocated_count
       from receipts r left join customers cu on cu.id = r.customer_id
      where r.tenant_id = $1 order by r.receipt_date desc, r.created_at desc`,
    [tenantId],
  );
  return rows as ReceiptHeader[];
}

// Paged + searchable list (receipt number, customer name, or reference).
export async function listReceiptsPaged(
  tenantId: string, opts: { q?: string; limit: number; offset: number },
): Promise<{ rows: ReceiptHeader[]; total: number }> {
  const q = (opts.q ?? "").trim();
  const like = `%${q}%`;
  const filter = q ? `and (r.receipt_number ilike $2 or cu.code ilike $2 or cu.trade_name ilike $2 or r.reference ilike $2)` : ``;
  const params = q ? [tenantId, like] : [tenantId];
  const { rows: cnt } = await scopedRead(tenantId,
    `select count(*)::int as n from receipts r left join customers cu on cu.id = r.customer_id
      where r.tenant_id=$1 ${filter}`, params);
  const { rows } = await scopedRead(tenantId,
    `select r.id, r.receipt_number, r.customer_id, cu.trade_name as customer, cu.code as customer_code, r.receipt_date::text,
            r.method, r.amount::float8, r.reference, r.others_note,
            (select count(*)::int from receipt_allocations ra where ra.receipt_id = r.id) as allocated_count,
            (select rr.created_at::text from receipt_reversals rr where rr.receipt_id = r.id) as reversed_at
       from receipts r left join customers cu on cu.id = r.customer_id
      where r.tenant_id=$1 ${filter}
      order by r.receipt_date desc, r.created_at desc limit ${opts.limit} offset ${opts.offset}`, params);
  return { rows: rows as ReceiptHeader[], total: cnt[0]?.n ?? 0 };
}

export interface ReceiptAllocation { id: string; invoice_id: string; invoice_number: string | null; amount: number; }

export async function getReceipt(tenantId: string, id: string): Promise<{ header: ReceiptHeader; allocations: ReceiptAllocation[] } | null> {
  const { rows: hdr } = await scopedRead(tenantId, 
    `select r.id, r.receipt_number, r.customer_id, cu.trade_name as customer, cu.code as customer_code, r.receipt_date::text,
            r.method, r.amount::float8, r.reference, r.others_note, 0 as allocated_count,
            rr.created_at::text as reversed_at, rr.reason as reversed_reason
       from receipts r
       left join customers cu on cu.id = r.customer_id
       left join receipt_reversals rr on rr.receipt_id = r.id
      where r.tenant_id=$1 and r.id=$2`,
    [tenantId, id],
  );
  if (!hdr[0]) return null;
  const { rows: alloc } = await scopedRead(tenantId, 
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
  const { rows } = await scopedRead(tenantId, 
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
    await c.query(`select fn_post_receipt_gl($1)`, [rows[0].id]); // unified GL posting, same tx
    await audit(c, tenantId, { table: "receipts", rowId: rows[0].id, action: "insert", newValue: { amount, method: d.method, allocations }, note: "receipt recorded + posted to GL" });
    return rows[0].id as string;
  });
}
