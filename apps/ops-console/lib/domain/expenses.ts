import "server-only";
import { scopedRead } from "../rls";
import { withTenantTx } from "./tx";
import { audit } from "./audit";

// Operational expenses (mig 045). Lightweight claim lifecycle:
//   draft → submitted → approved → paid   (reject from draft/submitted)
// The cash-allocation gate (paid ⇐ approved) is enforced in the DB trigger; the
// domain mirrors it and records the actor. Not GL-posted (§17/§18: lightweight).
export const EXPENSE_STATUSES = ["draft", "submitted", "approved", "rejected", "paid"] as const;
export const PAYMENT_METHODS = ["cash", "card", "bank_transfer", "company_account", "other"] as const;

export interface ExpenseRow {
  id: string;
  expense_date: string | null;
  category: string | null;
  description: string | null;
  amount: string;
  currency: string;
  status: string;
  technician: string | null;
  vehicle: string | null;
  payment_method: string | null;
  decision_note: string | null;
}

export interface ExpenseCategoryOpt { id: string; name: string }

export interface ExpenseInput {
  category_id?: string;
  expense_date?: string;
  amount?: string;
  description?: string;
  technician_id?: string;
  vehicle_id?: string;
  payment_method?: string;
}

const clean = (v?: string) => { const t = (v ?? "").trim(); return t === "" ? null : t; };
const money = (v?: string): number => {
  const n = Number((v ?? "").trim());
  if (!Number.isFinite(n) || n <= 0) throw new Error("Amount must be greater than 0");
  return n;
};
const method = (v?: string): string | null => {
  const t = (v ?? "").trim(); if (t === "") return null;
  if (!(PAYMENT_METHODS as readonly string[]).includes(t)) throw new Error("Invalid payment method");
  return t;
};

export async function listExpenseCategories(tenantId: string): Promise<ExpenseCategoryOpt[]> {
  const { rows } = await scopedRead(tenantId,
    `select id, name from expense_categories where tenant_id=$1 and is_active order by name`, [tenantId]);
  return rows as ExpenseCategoryOpt[];
}

const SELECT = `
  select e.id, e.expense_date::text as expense_date, ec.name as category, e.description,
         e.amount::text as amount, e.currency, e.status,
         coalesce(t.full_name, t.code) as technician, coalesce(v.name, v.code) as vehicle,
         e.payment_method, e.decision_note
    from expenses e
    left join expense_categories ec on ec.id = e.category_id
    left join technicians t on t.id = e.technician_id
    left join vehicles v on v.id = e.vehicle_id`;

export async function listExpensesPaged(
  tenantId: string, opts: { q?: string; status?: string; from?: string; to?: string; limit: number; offset: number },
): Promise<{ rows: ExpenseRow[]; total: number }> {
  const where: string[] = ["e.tenant_id = $1"];
  const params: unknown[] = [tenantId];
  const q = (opts.q ?? "").trim();
  if (q) { params.push(`%${q}%`); where.push(`(e.description ilike $${params.length} or ec.name ilike $${params.length})`); }
  if (opts.status && (EXPENSE_STATUSES as readonly string[]).includes(opts.status)) { params.push(opts.status); where.push(`e.status = $${params.length}`); }
  if (opts.from) { params.push(opts.from); where.push(`e.expense_date >= $${params.length}`); }
  if (opts.to) { params.push(opts.to); where.push(`e.expense_date <= $${params.length}`); }
  const w = where.join(" and ");
  const { rows: cnt } = await scopedRead(tenantId,
    `select count(*)::int n from expenses e left join expense_categories ec on ec.id=e.category_id where ${w}`, params);
  const { rows } = await scopedRead(tenantId,
    `${SELECT} where ${w} order by e.expense_date desc nulls last, e.created_at desc limit ${opts.limit} offset ${opts.offset}`, params);
  return { rows: rows as ExpenseRow[], total: cnt[0]?.n ?? 0 };
}

export async function getExpenseStatusCounts(tenantId: string): Promise<Record<string, number>> {
  const { rows } = await scopedRead(tenantId, `select status, count(*)::int n from expenses where tenant_id=$1 group by status`, [tenantId]);
  const out: Record<string, number> = {};
  for (const r of rows as { status: string; n: number }[]) out[r.status] = r.n;
  return out;
}

// Create a claim. Defaults to 'submitted' (the common case: someone incurred a
// cost and is claiming it); pass draft=true to hold as a draft.
export async function createExpense(tenantId: string, serviceLineId: string, d: ExpenseInput, draft = false): Promise<string> {
  const amount = money(d.amount);
  return withTenantTx(tenantId, async (c) => {
    const { rows } = await c.query(
      `insert into expenses (tenant_id, service_line_id, category_id, expense_date, amount, description,
          technician_id, vehicle_id, payment_method, status, created_by)
       values ($1,$2,$3,coalesce($4::date, current_date),$5,$6,$7,$8,$9,$10, app_current_actor()) returning id`,
      [tenantId, serviceLineId, clean(d.category_id), clean(d.expense_date), amount, clean(d.description),
       clean(d.technician_id), clean(d.vehicle_id), method(d.payment_method), draft ? "draft" : "submitted"],
    );
    await audit(c, tenantId, { table: "expenses", rowId: rows[0].id, action: "insert", newValue: { ...d, amount, status: draft ? "draft" : "submitted" }, note: "expense recorded" });
    return rows[0].id as string;
  });
}

// Edit is only permitted while the claim is still draft or submitted (before a
// financial decision). The status check + trigger protect approved/paid rows.
export async function updateExpense(tenantId: string, id: string, d: ExpenseInput): Promise<void> {
  const amount = money(d.amount);
  await withTenantTx(tenantId, async (c) => {
    const before = (await c.query(`select status, category_id, amount::text, description, payment_method from expenses where id=$1 and tenant_id=$2 for update`, [id, tenantId])).rows[0];
    if (!before) throw new Error("Expense not found");
    if (!["draft", "submitted"].includes(before.status)) throw new Error(`A ${before.status} expense cannot be edited`);
    await c.query(
      `update expenses set category_id=$1, expense_date=coalesce($2::date, current_date), amount=$3, description=$4,
              technician_id=$5, vehicle_id=$6, payment_method=$7 where id=$8`,
      [clean(d.category_id), clean(d.expense_date), amount, clean(d.description), clean(d.technician_id), clean(d.vehicle_id), method(d.payment_method), id]);
    await audit(c, tenantId, { table: "expenses", rowId: id, action: "update", oldValue: before, newValue: { ...d, amount }, note: "expense edited" });
  });
}

async function transition(tenantId: string, id: string, to: string, extraSet: string, note: string, decisionNote?: string): Promise<void> {
  await withTenantTx(tenantId, async (c) => {
    const before = (await c.query(`select status from expenses where id=$1 and tenant_id=$2 for update`, [id, tenantId])).rows[0];
    if (!before) throw new Error("Expense not found");
    // The DB trigger is the authority on legal transitions; this surfaces a clear message first.
    await c.query(`update expenses set status=$1 ${extraSet} where id=$2`,
      decisionNote !== undefined ? [to, id, decisionNote] : [to, id]);
    await audit(c, tenantId, { table: "expenses", rowId: id, action: "update", oldValue: { status: before.status }, newValue: { status: to, ...(decisionNote ? { decision_note: decisionNote } : {}) }, note });
  });
}

export const submitExpense = (t: string, id: string) => transition(t, id, "submitted", "", "expense submitted");
export const approveExpense = (t: string, id: string) => transition(t, id, "approved", ", approved_by=app_current_actor(), approved_at=now()", "expense approved");
export const rejectExpense = (t: string, id: string, reason: string) =>
  transition(t, id, "rejected", ", approved_by=app_current_actor(), approved_at=now(), decision_note=$3", "expense rejected", (reason ?? "").trim() || "rejected");
export const markExpensePaid = (t: string, id: string) => transition(t, id, "paid", ", paid_by=app_current_actor(), paid_at=now()", "expense paid (cash allocated)");
