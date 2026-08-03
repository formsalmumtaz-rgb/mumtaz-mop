import "server-only";
import { pool } from "../db";
import { withTenantTx } from "./tx";
import { audit } from "./audit";

// Invoice subledger (mig 007 + 034). No GL posting here — a unified posting
// engine handles the ledger once all financial documents exist. Numbering,
// VAT, issue/cancel lifecycle and the service-report gate live in-DB
// (fn_issue_invoice / fn_cancel_invoice) so they are deterministic and atomic.

export interface InvoiceHeader {
  id: string;
  invoice_number: string | null;
  document_type: string;
  customer_id: string | null;
  customer: string | null;
  contract_id: string | null;
  job_id: string | null;
  status: string;
  issue_date: string | null;
  due_date: string | null;
  currency: string;
  vat_treatment: string;
  subtotal: number;
  vat_total: number;
  total: number;
  cancelled_reason: string | null;
  cancelled_at: string | null;
}

export interface InvoiceLine {
  id: string; line_no: number | null; description: string | null;
  quantity: number; unit_price: number; vat_rate: number; vat_amount: number; line_total: number;
}

export async function listInvoices(tenantId: string): Promise<InvoiceHeader[]> {
  const { rows } = await pool.query(
    `select i.id, i.invoice_number, i.document_type, i.customer_id, cu.trade_name as customer,
            i.contract_id, i.job_id, i.status, i.issue_date::text, i.due_date::text,
            i.currency, i.vat_treatment, i.subtotal::float8, i.vat_total::float8, i.total::float8,
            i.cancelled_reason, i.cancelled_at::text
       from invoices i left join customers cu on cu.id = i.customer_id
      where i.tenant_id = $1 and i.document_type = 'tax_invoice'
      order by i.created_at desc`,
    [tenantId],
  );
  return rows as InvoiceHeader[];
}

export async function getInvoice(tenantId: string, id: string): Promise<{ header: InvoiceHeader; lines: InvoiceLine[] } | null> {
  const { rows: hdr } = await pool.query(
    `select i.id, i.invoice_number, i.document_type, i.customer_id, cu.trade_name as customer,
            i.contract_id, i.job_id, i.status, i.issue_date::text, i.due_date::text,
            i.currency, i.vat_treatment, i.subtotal::float8, i.vat_total::float8, i.total::float8,
            i.cancelled_reason, i.cancelled_at::text
       from invoices i left join customers cu on cu.id = i.customer_id
      where i.tenant_id = $1 and i.id = $2`,
    [tenantId, id],
  );
  if (!hdr[0]) return null;
  const { rows: lines } = await pool.query(
    `select id, line_no, description, quantity::float8, unit_price::float8, vat_rate::float8, vat_amount::float8, line_total::float8
       from invoice_lines where tenant_id=$1 and invoice_id=$2 order by line_no nulls last, created_at`,
    [tenantId, id],
  );
  return { header: hdr[0] as InvoiceHeader, lines: lines as InvoiceLine[] };
}

const clean = (v?: string) => { const t = (v ?? "").trim(); return t === "" ? null : t; };

// Create a manual draft invoice, freezing the buyer's tax identity at creation.
export async function createManualInvoice(
  tenantId: string, d: { customer_id: string; contract_id?: string; vat_treatment?: string },
): Promise<string> {
  const vt = ["standard", "zero_rated", "exempt", "reverse_charge"].includes(d.vat_treatment ?? "") ? d.vat_treatment! : "standard";
  return withTenantTx(tenantId, async (c) => {
    const { rows } = await c.query(
      `insert into invoices (tenant_id, service_line_id, document_type, customer_id, contract_id, status, vat_treatment,
                             buyer_legal_name, buyer_trn, buyer_address, buyer_customer_type, currency, subtotal, vat_total, total)
       select $1, cu.service_line_id, 'tax_invoice', cu.id, $3, 'draft', $4,
              coalesce(cu.legal_name, cu.trade_name), cu.trn, cu.emirate, cu.customer_type, 'AED', 0, 0, 0
         from customers cu where cu.id = $2 and cu.tenant_id = $1
       returning id`,
      [tenantId, d.customer_id, clean(d.contract_id), vt],
    );
    if (!rows[0]) throw new Error("Customer not found");
    await audit(c, tenantId, { table: "invoices", rowId: rows[0].id, action: "insert", newValue: d, note: "manual invoice created (draft)" });
    return rows[0].id as string;
  });
}

async function recomputeTotals(c: import("pg").PoolClient, tenantId: string, invoiceId: string): Promise<void> {
  await c.query(
    `update invoices i set
        subtotal = t.sub, vat_total = t.vat, total = t.sub + t.vat
       from (select coalesce(sum(line_total),0) sub, coalesce(sum(vat_amount),0) vat
               from invoice_lines where tenant_id=$1 and invoice_id=$2) t
      where i.id=$2 and i.tenant_id=$1`,
    [tenantId, invoiceId],
  );
}

// Effective VAT rate for a line = 0 for zero-rated/exempt/reverse-charge,
// else the tenant's default standard rate (ASSUMED, settings-driven).
export async function addInvoiceLine(
  tenantId: string, invoiceId: string, d: { description?: string; quantity?: string; unit_price?: string },
): Promise<void> {
  const qty = Math.max(0, Number(d.quantity ?? "1") || 0);
  const price = Math.max(0, Number(d.unit_price ?? "0") || 0);
  await withTenantTx(tenantId, async (c) => {
    const inv = (await c.query(`select status, vat_treatment from invoices where id=$1 and tenant_id=$2`, [invoiceId, tenantId])).rows[0];
    if (!inv) throw new Error("Invoice not found");
    if (inv.status !== "draft") throw new Error("Only draft invoices can be edited");
    const defRate = Number((await c.query(
      `select value::text::numeric r from settings where tenant_id=$1 and service_line_id is null and key='ar.default_vat_rate'`, [tenantId])).rows[0]?.r ?? 5);
    const rate = inv.vat_treatment === "standard" ? defRate : 0;
    const base = Math.round(qty * price * 100) / 100;
    const vat = Math.round(base * rate) / 100;
    const nextNo = Number((await c.query(`select coalesce(max(line_no),0)+1 n from invoice_lines where tenant_id=$1 and invoice_id=$2`, [tenantId, invoiceId])).rows[0].n);
    const { rows } = await c.query(
      `insert into invoice_lines (tenant_id, invoice_id, line_no, description, quantity, unit_price, currency, vat_rate, vat_amount, line_total)
       values ($1,$2,$3,$4,$5,$6,'AED',$7,$8,$9) returning id`,
      [tenantId, invoiceId, nextNo, clean(d.description), qty, price, rate, vat, base],
    );
    await recomputeTotals(c, tenantId, invoiceId);
    await audit(c, tenantId, { table: "invoice_lines", rowId: rows[0].id, action: "insert", newValue: { base, vat, rate }, note: "invoice line added" });
  });
}

export async function deleteInvoiceLine(tenantId: string, lineId: string, invoiceId: string): Promise<void> {
  await withTenantTx(tenantId, async (c) => {
    const r = await c.query(
      `delete from invoice_lines l using invoices i
        where l.id=$1 and l.tenant_id=$2 and i.id=l.invoice_id and i.status='draft' returning l.id`,
      [lineId, tenantId],
    );
    if (r.rowCount) { await recomputeTotals(c, tenantId, invoiceId); await audit(c, tenantId, { table: "invoice_lines", rowId: lineId, action: "soft_delete", note: "invoice line removed" }); }
  });
}

export async function issueInvoice(tenantId: string, id: string): Promise<string> {
  return withTenantTx(tenantId, async (c) => {
    const { rows } = await c.query(`select fn_issue_invoice($1) as num`, [id]);
    await c.query(`select fn_post_invoice_gl($1)`, [id]); // unified GL posting, same tx
    await audit(c, tenantId, { table: "invoices", rowId: id, action: "update", newValue: { status: "issued", invoice_number: rows[0].num }, note: "invoice issued + posted to GL" });
    return rows[0].num as string;
  });
}

export async function cancelInvoice(tenantId: string, id: string, reason: string): Promise<void> {
  await withTenantTx(tenantId, async (c) => {
    await c.query(`select fn_cancel_invoice($1,$2,null)`, [id, reason]);
    await c.query(`select fn_post_invoice_cancel_gl($1)`, [id]); // reversing GL entry (no-op if never posted)
    await audit(c, tenantId, { table: "invoices", rowId: id, action: "update", oldValue: { status: "issued" }, newValue: { status: "cancelled", reason }, note: "invoice cancelled + GL reversed" });
  });
}
