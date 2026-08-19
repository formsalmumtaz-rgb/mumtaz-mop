import "server-only";
import { scopedRead } from "../rls";
import { withTenantTx } from "./tx";
import { audit } from "./audit";

// Credit Notes & Refunds subledger (mig 036). No GL posting (unified engine later).
// A credit note reduces the net receivable on its invoice; a refund is a cash
// outflow against a credit note. Refunds are append-only.

export interface CreditNoteHeader {
  customer_code: string | null;
  id: string; credit_note_number: string | null; customer_id: string | null; customer: string | null;
  invoice_id: string | null; invoice_number: string | null; issue_date: string | null; status: string;
  vat_treatment: string; subtotal: number; vat_total: number; total: number; reason: string | null;
  refunded: number;
}
export interface CreditNoteLine { id: string; line_no: number | null; description: string | null; quantity: number; unit_price: number; vat_rate: number; vat_amount: number; line_total: number; }
export interface Refund { id: string; refund_number: string | null; refund_date: string | null; method: string; amount: number; reference: string | null; }

export async function listCreditNotes(tenantId: string): Promise<CreditNoteHeader[]> {
  const { rows } = await scopedRead(tenantId,
    `select cn.id, cn.credit_note_number, cn.customer_id, cu.trade_name as customer, cu.code as customer_code,
            cn.invoice_id, i.invoice_number, cn.issue_date::text, cn.status, cn.vat_treatment,
            cn.subtotal::float8, cn.vat_total::float8, cn.total::float8, cn.reason,
            coalesce((select sum(amount) from refunds r where r.credit_note_id=cn.id),0)::float8 as refunded
       from credit_notes cn
       left join customers cu on cu.id = cn.customer_id
       left join invoices i on i.id = cn.invoice_id
      where cn.tenant_id = $1 order by cn.created_at desc`,
    [tenantId],
  );
  return rows as CreditNoteHeader[];
}

// Paged + searchable list (credit-note number, customer, invoice number, or status).
export async function listCreditNotesPaged(
  tenantId: string, opts: { q?: string; limit: number; offset: number },
): Promise<{ rows: CreditNoteHeader[]; total: number }> {
  const q = (opts.q ?? "").trim();
  const like = `%${q}%`;
  const filter = q
    ? `and (cn.credit_note_number ilike $2 or cu.code ilike $2 or cu.trade_name ilike $2 or i.invoice_number ilike $2 or cn.status = lower($3))`
    : ``;
  const params = q ? [tenantId, like, q] : [tenantId];
  const { rows: cnt } = await scopedRead(tenantId,
    `select count(*)::int as n from credit_notes cn
       left join customers cu on cu.id = cn.customer_id
       left join invoices i on i.id = cn.invoice_id
      where cn.tenant_id=$1 ${filter}`, params);
  const { rows } = await scopedRead(tenantId,
    `select cn.id, cn.credit_note_number, cn.customer_id, cu.trade_name as customer, cu.code as customer_code,
            cn.invoice_id, i.invoice_number, cn.issue_date::text, cn.status, cn.vat_treatment,
            cn.subtotal::float8, cn.vat_total::float8, cn.total::float8, cn.reason,
            coalesce((select sum(amount) from refunds r where r.credit_note_id=cn.id),0)::float8 as refunded
       from credit_notes cn
       left join customers cu on cu.id = cn.customer_id
       left join invoices i on i.id = cn.invoice_id
      where cn.tenant_id=$1 ${filter}
      order by cn.created_at desc limit ${opts.limit} offset ${opts.offset}`, params);
  return { rows: rows as CreditNoteHeader[], total: cnt[0]?.n ?? 0 };
}

export async function getCreditNote(tenantId: string, id: string): Promise<{ header: CreditNoteHeader; lines: CreditNoteLine[]; refunds: Refund[] } | null> {
  const { rows: hdr } = await scopedRead(tenantId, 
    `select cn.id, cn.credit_note_number, cn.customer_id, cu.trade_name as customer, cu.code as customer_code,
            cn.invoice_id, i.invoice_number, cn.issue_date::text, cn.status, cn.vat_treatment,
            cn.subtotal::float8, cn.vat_total::float8, cn.total::float8, cn.reason,
            coalesce((select sum(amount) from refunds r where r.credit_note_id=cn.id),0)::float8 as refunded
       from credit_notes cn
       left join customers cu on cu.id = cn.customer_id
       left join invoices i on i.id = cn.invoice_id
      where cn.tenant_id=$1 and cn.id=$2`,
    [tenantId, id],
  );
  if (!hdr[0]) return null;
  const { rows: lines } = await scopedRead(tenantId, 
    `select id, line_no, description, quantity::float8, unit_price::float8, vat_rate::float8, vat_amount::float8, line_total::float8
       from credit_note_lines where tenant_id=$1 and credit_note_id=$2 order by line_no nulls last, created_at`, [tenantId, id]);
  const { rows: refunds } = await scopedRead(tenantId, 
    `select id, refund_number, refund_date::text, method, amount::float8, reference
       from refunds where tenant_id=$1 and credit_note_id=$2 order by created_at`, [tenantId, id]);
  return { header: hdr[0] as CreditNoteHeader, lines: lines as CreditNoteLine[], refunds: refunds as Refund[] };
}

// Issued invoices the current customer can be credited against.
export async function listIssuedInvoices(tenantId: string): Promise<{ id: string; invoice_number: string | null; customer_id: string | null; customer: string | null; total: number }[]> {
  const { rows } = await scopedRead(tenantId, 
    `select i.id, i.invoice_number, i.customer_id, cu.trade_name as customer, i.total::float8
       from invoices i left join customers cu on cu.id = i.customer_id
      where i.tenant_id=$1 and i.document_type='tax_invoice' and i.status in ('issued','paid')
      order by i.issue_date desc nulls last limit 200`, [tenantId]);
  return rows;
}

const clean = (v?: string) => { const t = (v ?? "").trim(); return t === "" ? null : t; };

export async function createCreditNote(tenantId: string, d: { invoice_id: string; reason?: string; vat_treatment?: string }): Promise<string> {
  const vt = ["standard", "zero_rated", "exempt", "reverse_charge"].includes(d.vat_treatment ?? "") ? d.vat_treatment! : "standard";
  return withTenantTx(tenantId, async (c) => {
    const { rows } = await c.query(
      `insert into credit_notes (tenant_id, service_line_id, customer_id, invoice_id, vat_treatment, reason, status, subtotal, vat_total, total)
       select $1, i.service_line_id, i.customer_id, i.id, $3, $4, 'draft', 0,0,0
         from invoices i where i.id=$2 and i.tenant_id=$1
       returning id`,
      [tenantId, d.invoice_id, vt, clean(d.reason)],
    );
    if (!rows[0]) throw new Error("Invoice not found");
    await audit(c, tenantId, { table: "credit_notes", rowId: rows[0].id, action: "insert", newValue: d, note: "credit note created (draft)" });
    return rows[0].id as string;
  });
}

async function recompute(c: import("pg").PoolClient, tenantId: string, cnId: string): Promise<void> {
  await c.query(
    `update credit_notes cn set subtotal=t.s, vat_total=t.v, total=t.s+t.v
       from (select coalesce(sum(line_total),0) s, coalesce(sum(vat_amount),0) v from credit_note_lines where tenant_id=$1 and credit_note_id=$2) t
      where cn.id=$2 and cn.tenant_id=$1`, [tenantId, cnId]);
}

export async function addCreditNoteLine(tenantId: string, cnId: string, d: { description?: string; quantity?: string; unit_price?: string }): Promise<void> {
  const qty = Math.max(0, Number(d.quantity ?? "1") || 0);
  const price = Math.max(0, Number(d.unit_price ?? "0") || 0);
  await withTenantTx(tenantId, async (c) => {
    const cn = (await c.query(`select status, vat_treatment from credit_notes where id=$1 and tenant_id=$2`, [cnId, tenantId])).rows[0];
    if (!cn) throw new Error("Credit note not found");
    if (cn.status !== "draft") throw new Error("Only draft credit notes can be edited");
    const defRate = Number((await c.query(`select value::text::numeric r from settings where tenant_id=$1 and service_line_id is null and key='ar.default_vat_rate'`, [tenantId])).rows[0]?.r ?? 5);
    const rate = cn.vat_treatment === "standard" ? defRate : 0;
    const base = Math.round(qty * price * 100) / 100;
    const vat = Math.round(base * rate) / 100;
    const nextNo = Number((await c.query(`select coalesce(max(line_no),0)+1 n from credit_note_lines where tenant_id=$1 and credit_note_id=$2`, [tenantId, cnId])).rows[0].n);
    const { rows } = await c.query(
      `insert into credit_note_lines (tenant_id, credit_note_id, line_no, description, quantity, unit_price, vat_rate, vat_amount, line_total)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
      [tenantId, cnId, nextNo, clean(d.description), qty, price, rate, vat, base]);
    await recompute(c, tenantId, cnId);
    await audit(c, tenantId, { table: "credit_note_lines", rowId: rows[0].id, action: "insert", newValue: { base, vat }, note: "credit note line added" });
  });
}

export async function deleteCreditNoteLine(tenantId: string, lineId: string, cnId: string): Promise<void> {
  await withTenantTx(tenantId, async (c) => {
    const r = await c.query(
      `delete from credit_note_lines l using credit_notes cn where l.id=$1 and l.tenant_id=$2 and cn.id=l.credit_note_id and cn.status='draft' returning l.id`,
      [lineId, tenantId]);
    if (r.rowCount) { await recompute(c, tenantId, cnId); await audit(c, tenantId, { table: "credit_note_lines", rowId: lineId, action: "soft_delete", note: "credit note line removed" }); }
  });
}

export async function issueCreditNote(tenantId: string, id: string): Promise<string> {
  return withTenantTx(tenantId, async (c) => {
    const cn = (await c.query(`select total from credit_notes where id=$1 and tenant_id=$2`, [id, tenantId])).rows[0];
    if (!cn) throw new Error("Credit note not found");
    if (Number(cn.total) <= 0) throw new Error("Add at least one line before issuing");
    const { rows } = await c.query(`select fn_issue_credit_note($1) as num`, [id]);
    await c.query(`select fn_post_credit_note_gl($1)`, [id]); // unified GL posting, same tx
    await audit(c, tenantId, { table: "credit_notes", rowId: id, action: "update", newValue: { status: "issued", credit_note_number: rows[0].num }, note: "credit note issued + posted to GL" });
    return rows[0].num as string;
  });
}

// Refund against a credit note; cannot exceed the credit not already refunded.
export async function recordRefund(tenantId: string, d: { credit_note_id: string; method: string; amount: string; reference?: string; others_note?: string }): Promise<void> {
  const amount = Number((d.amount ?? "").trim());
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Refund amount must be > 0");
  await withTenantTx(tenantId, async (c) => {
    const cn = (await c.query(
      `select cn.customer_id, cn.service_line_id, cn.status, cn.total,
              coalesce((select sum(amount) from refunds r where r.credit_note_id=cn.id),0) as refunded
         from credit_notes cn where cn.id=$1 and cn.tenant_id=$2 for update`, [d.credit_note_id, tenantId])).rows[0];
    if (!cn) throw new Error("Credit note not found");
    if (cn.status !== "issued") throw new Error("Only issued credit notes can be refunded");
    if (amount > Number(cn.total) - Number(cn.refunded) + 0.005) throw new Error("Refund exceeds the credit note's remaining balance");
    if (d.method === "other" && !(d.others_note ?? "").trim()) throw new Error("A note is required when the method is 'other'");
    const { rows } = await c.query(
      `insert into refunds (tenant_id, service_line_id, customer_id, credit_note_id, refund_number, method, amount, reference, others_note)
       values ($1,$2,$3,$4, fn_next_document_number($1,'RFD'), $5,$6,$7,$8) returning id, refund_number`,
      [tenantId, cn.service_line_id, cn.customer_id, d.credit_note_id, d.method, Math.round(amount * 100) / 100, clean(d.reference), clean(d.others_note)]);
    await c.query(`select fn_post_refund_gl($1)`, [rows[0].id]); // unified GL posting, same tx
    await audit(c, tenantId, { table: "refunds", rowId: rows[0].id, action: "insert", newValue: { amount, method: d.method, refund_number: rows[0].refund_number }, note: "refund recorded + posted to GL" });
  });
}
