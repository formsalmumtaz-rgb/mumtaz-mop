import Link from "next/link";
import { getTenantId } from "@/lib/tenant";
import { can } from "@/lib/auth";
import { listExpensesPaged, getExpenseStatusCounts, listExpenseCategories, EXPENSE_STATUSES, PAYMENT_METHODS } from "@/lib/domain/expenses";
import { listTechnicians } from "@/lib/domain/technicians";
import { parseListParams } from "@/lib/list";
import { ListToolbar, Pagination } from "@/components/ListControls";
import { Card, Badge, Button, Field, Input, Select, TableWrap, Thead, Tbody, PageHeader } from "@/components/ui";
import {
  createExpenseAction, approveExpenseAction, rejectExpenseAction, payExpenseAction,
} from "./actions";

export const dynamic = "force-dynamic";
const aed = (v: string, ccy = "AED") => `${ccy} ${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const TONE: Record<string, "neutral" | "navy" | "success" | "warning" | "danger"> = {
  draft: "neutral", submitted: "warning", approved: "navy", paid: "success", rejected: "danger",
};

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const lp = parseListParams(sp);
  const status = sp.status && (EXPENSE_STATUSES as readonly string[]).includes(sp.status) ? sp.status : undefined;
  const tenantId = await getTenantId();
  const [{ rows, total }, counts, categories, techs, canApprove] = await Promise.all([
    listExpensesPaged(tenantId, { q: lp.q, status, from: sp.from, to: sp.to, limit: lp.pageSize, offset: lp.offset }),
    getExpenseStatusCounts(tenantId),
    listExpenseCategories(tenantId),
    listTechnicians(tenantId),
    can("expense.approve"),
  ]);
  const totalAll = Object.values(counts).reduce((a, b) => a + b, 0);
  const statusHref = (s?: string) => {
    const p = new URLSearchParams(); if (lp.q) p.set("q", lp.q); if (s) p.set("status", s);
    const qs = p.toString(); return qs ? `/expenses?${qs}` : "/expenses";
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Expenses"
        description="Operational expense claims — food, fuel, vehicle, accommodation, supplies. Claims are approved before cash is allocated; that gate is enforced in the database."
      />

      <div className="flex flex-wrap gap-2">
        <Link href={statusHref(undefined)} className={`rounded-full border px-3 py-1 text-xs font-medium ${!status ? "border-brand bg-brand/5 text-brand" : "border-neutral-300 text-neutral-600 hover:bg-neutral-50"}`}>All <span className="text-neutral-400">({totalAll})</span></Link>
        {EXPENSE_STATUSES.map((s) => (
          <Link key={s} href={statusHref(s)} className={`rounded-full border px-3 py-1 text-xs font-medium capitalize ${status === s ? "border-brand bg-brand/5 text-brand" : "border-neutral-300 text-neutral-600 hover:bg-neutral-50"}`}>
            {s} <span className="text-neutral-400">({counts[s] ?? 0})</span>
          </Link>
        ))}
      </div>

      <ListToolbar basePath="/expenses" params={sp} showArchived={false} placeholder="Search description or category…" />

      <Card>
        <details open={total === 0}>
          <summary className="cursor-pointer p-4 font-medium sm:p-5">New expense claim</summary>
          <div className="border-t border-neutral-100 p-4 sm:p-5">
            <form action={createExpenseAction} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Category">
                <Select name="category_id"><option value="">—</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
              </Field>
              <Field label="Date"><Input name="expense_date" type="date" /></Field>
              <Field label="Amount (AED)"><Input name="amount" type="number" min="0" step="0.01" required /></Field>
              <Field label="Description"><Input name="description" placeholder="What was it for?" /></Field>
              <Field label="Incurred by (optional)">
                <Select name="technician_id"><option value="">—</option>{techs.map((t) => <option key={t.id} value={t.id}>{t.full_name ?? t.code}</option>)}</Select>
              </Field>
              <Field label="Payment method">
                <Select name="payment_method"><option value="">—</option>{PAYMENT_METHODS.map((m) => <option key={m} value={m} className="capitalize">{m.replace(/_/g, " ")}</option>)}</Select>
              </Field>
              <div className="sm:col-span-3"><Button type="submit">Submit claim</Button></div>
            </form>
          </div>
        </details>
      </Card>

      <TableWrap minWidth={820}>
        <Thead>
          <tr>
            <th className="px-4 py-2.5 font-medium">Date</th>
            <th className="px-4 py-2.5 font-medium">Category</th>
            <th className="px-4 py-2.5 font-medium">Description</th>
            <th className="px-4 py-2.5 font-medium">Incurred by</th>
            <th className="px-4 py-2.5 font-medium text-right">Amount</th>
            <th className="px-4 py-2.5 font-medium">Status</th>
            <th className="px-4 py-2.5 font-medium text-right">Actions</th>
          </tr>
        </Thead>
        <Tbody>
          {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-center text-neutral-500">{lp.q || status ? "No expenses match this filter." : "No expenses yet."}</td></tr>}
          {rows.map((e) => (
            <tr key={e.id}>
              <td className="px-4 py-2.5 whitespace-nowrap text-neutral-700">{e.expense_date ?? "—"}</td>
              <td className="px-4 py-2.5 text-neutral-700">{e.category ?? "—"}</td>
              <td className="px-4 py-2.5">
                <div>{e.description ?? "—"}</div>
                {e.status === "rejected" && e.decision_note && <div className="text-xs text-red-600">{e.decision_note}</div>}
              </td>
              <td className="px-4 py-2.5 text-neutral-600">{e.technician ?? "—"}</td>
              <td className="px-4 py-2.5 text-right font-medium">{aed(e.amount, e.currency)}</td>
              <td className="px-4 py-2.5"><Badge tone={TONE[e.status] ?? "neutral"}><span className="capitalize">{e.status}</span></Badge></td>
              <td className="px-4 py-2.5 text-right">
                {canApprove && e.status === "submitted" && (
                  <div className="flex items-center justify-end gap-2">
                    <form action={approveExpenseAction}><input type="hidden" name="id" value={e.id} />
                      <Button type="submit" size="sm" variant="secondary">Approve</Button></form>
                    <form action={rejectExpenseAction} className="flex items-center gap-1">
                      <input type="hidden" name="id" value={e.id} />
                      <input name="reason" placeholder="reason" className="w-24 rounded border border-neutral-300 px-2 py-1 text-xs" />
                      <button className="text-xs text-neutral-500 hover:text-red-600">reject</button></form>
                  </div>
                )}
                {canApprove && e.status === "approved" && (
                  <form action={payExpenseAction}><input type="hidden" name="id" value={e.id} />
                    <Button type="submit" size="sm">Mark paid</Button></form>
                )}
                {(!canApprove || !["submitted", "approved"].includes(e.status)) && <span className="text-xs text-neutral-400">—</span>}
              </td>
            </tr>
          ))}
        </Tbody>
      </TableWrap>

      <Pagination basePath="/expenses" params={sp} page={lp.page} pageSize={lp.pageSize} total={total} />
    </div>
  );
}
