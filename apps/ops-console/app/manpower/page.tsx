import { getTenantId } from "@/lib/tenant";
import { listManpowerAgreements, listContractsWithoutManpower, listTimesheets, BILLING_BASES, BASIS_LABEL, type ManpowerTimesheet } from "@/lib/domain/manpower";
import { AssumedBadge } from "@/components/AssumedBadge";
import { Card, CardBody, Badge, Button, Field, Input, Select, TableWrap, Thead, Tbody, PageHeader } from "@/components/ui";
import { setupManpowerAction, updateManpowerAction, addTimesheetAction } from "./actions";

export const dynamic = "force-dynamic";
const aed = (v: string | null) => (v == null ? "—" : "AED " + Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

function BasisFields({ a }: { a?: { billing_basis: string | null; personnel_count: number | null; rate: string | null; salary_cost_per_person_monthly: string | null; accommodation_cost_monthly: string | null; other_cost_monthly: string | null } }) {
  return (
    <>
      <Field label="Billing basis">
        <Select name="billing_basis" defaultValue={a?.billing_basis ?? "per_person_month"}>
          {BILLING_BASES.map((b) => <option key={b} value={b}>{BASIS_LABEL[b]}</option>)}
        </Select>
      </Field>
      <Field label="Personnel"><Input name="personnel_count" type="number" min="1" step="1" defaultValue={a?.personnel_count ?? 1} /></Field>
      <Field label="Rate (per basis, AED)"><Input name="rate" type="number" min="0" step="any" defaultValue={a?.rate ?? ""} /></Field>
      <Field label="Salary cost / person / mo"><Input name="salary_cost_per_person_monthly" type="number" min="0" step="any" defaultValue={a?.salary_cost_per_person_monthly ?? ""} /></Field>
      <Field label="Accommodation / mo"><Input name="accommodation_cost_monthly" type="number" min="0" step="any" defaultValue={a?.accommodation_cost_monthly ?? ""} /></Field>
      <Field label="Other cost / mo"><Input name="other_cost_monthly" type="number" min="0" step="any" defaultValue={a?.other_cost_monthly ?? ""} /></Field>
    </>
  );
}

function MonthTable({ sheets }: { sheets: ManpowerTimesheet[] }) {
  const tot = sheets.reduce((s, t) => ({ r: s.r + Number(t.revenue), c: s.c + Number(t.cost), p: s.p + Number(t.profit) }), { r: 0, c: 0, p: 0 });
  return (
    <TableWrap minWidth={560}>
      <Thead><tr>
        <th className="px-3 py-2 font-medium">Month</th><th className="px-3 py-2 font-medium text-right">Personnel</th>
        <th className="px-3 py-2 font-medium text-right">Hours</th><th className="px-3 py-2 font-medium text-right">Revenue</th>
        <th className="px-3 py-2 font-medium text-right">Cost</th><th className="px-3 py-2 font-medium text-right">Profit</th>
      </tr></Thead>
      <Tbody>
        {sheets.length === 0 && <tr><td colSpan={6} className="px-3 py-4 text-center text-neutral-500">No months entered yet.</td></tr>}
        {sheets.map((t) => (
          <tr key={t.id}>
            <td className="px-3 py-2 font-medium">{t.period.slice(0, 7)}</td>
            <td className="px-3 py-2 text-right">{t.personnel_count}</td>
            <td className="px-3 py-2 text-right text-neutral-600">{Number(t.hours_worked) > 0 ? t.hours_worked : "—"}</td>
            <td className="px-3 py-2 text-right">{aed(t.revenue)}</td>
            <td className="px-3 py-2 text-right text-neutral-600">{aed(t.cost)}</td>
            <td className={`px-3 py-2 text-right font-medium ${Number(t.profit) < 0 ? "text-red-600" : "text-emerald-700"}`}>{aed(t.profit)}</td>
          </tr>
        ))}
        {sheets.length > 0 && (
          <tr className="bg-neutral-50 font-medium">
            <td className="px-3 py-2" colSpan={3}>Total</td>
            <td className="px-3 py-2 text-right">{aed(String(tot.r))}</td>
            <td className="px-3 py-2 text-right">{aed(String(tot.c))}</td>
            <td className={`px-3 py-2 text-right ${tot.p < 0 ? "text-red-600" : "text-emerald-700"}`}>{aed(String(tot.p))}</td>
          </tr>
        )}
      </Tbody>
    </TableWrap>
  );
}

export default async function ManpowerPage() {
  const tenantId = await getTenantId();
  const [agreements, candidates] = await Promise.all([
    listManpowerAgreements(tenantId),
    listContractsWithoutManpower(tenantId),
  ]);
  const sheetsByContract = new Map<string, ManpowerTimesheet[]>(
    await Promise.all(agreements.map(async (a) => [a.contract_id, await listTimesheets(tenantId, a.contract_id)] as const)),
  );
  const thisMonth = new Date().toISOString().slice(0, 7);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Manpower"
        description="Manpower-supply engagements and their monthly profitability. Revenue and cost are computed deterministically from the agreement and each month's actuals — no AI in the numbers."
      />

      {/* Set up */}
      <Card>
        <details open={agreements.length === 0}>
          <summary className="cursor-pointer p-4 font-medium sm:p-5">Set up a manpower agreement on a contract</summary>
          <div className="border-t border-neutral-100 p-4 sm:p-5">
            {candidates.length === 0 ? (
              <p className="text-sm text-neutral-500">No eligible contracts. Create a contract first (Customers → contract), then attach a manpower agreement here.</p>
            ) : (
              <form action={setupManpowerAction} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="sm:col-span-3">
                  <Field label="Contract">
                    <Select name="contract_id" required><option value="">Select a contract…</option>{candidates.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</Select>
                  </Field>
                </div>
                <BasisFields />
                <div className="sm:col-span-3"><Button type="submit">Create agreement</Button></div>
              </form>
            )}
          </div>
        </details>
      </Card>

      {/* Agreements */}
      {agreements.length === 0 && (
        <Card><CardBody><p className="text-center text-neutral-500">No manpower agreements yet.</p></CardBody></Card>
      )}
      {agreements.map((a) => {
        const sheets = sheetsByContract.get(a.contract_id) ?? [];
        return (
          <Card key={a.contract_id}>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 px-4 py-3">
              <div>
                <span className="font-medium">{a.customer ?? "—"}</span>
                <span className="ml-2 font-mono text-xs text-neutral-400">{a.contract_number ?? "(no number)"}</span>
                {a.is_assumed && <span className="ml-2"><AssumedBadge /></span>}
              </div>
              <div className="text-sm text-neutral-600">
                <Badge tone="navy">{BASIS_LABEL[a.billing_basis ?? ""] ?? a.billing_basis}</Badge>
                <span className="ml-2">{a.personnel_count} personnel · {aed(a.rate)}</span>
              </div>
            </div>
            <CardBody className="space-y-4">
              <MonthTable sheets={sheets} />
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <details className="rounded-md border border-neutral-200 p-3">
                  <summary className="cursor-pointer text-sm font-medium">Enter a month</summary>
                  <form action={addTimesheetAction} className="mt-3 grid grid-cols-2 gap-3">
                    <input type="hidden" name="contract_id" value={a.contract_id} />
                    <Field label="Month"><Input name="period" type="month" defaultValue={thisMonth} required /></Field>
                    <Field label="Personnel"><Input name="personnel_count" type="number" min="0" step="1" defaultValue={a.personnel_count ?? 0} /></Field>
                    <Field label="Hours worked"><Input name="hours_worked" type="number" min="0" step="any" placeholder="for per-hour basis" /></Field>
                    <div className="self-end"><Button type="submit">Save month</Button></div>
                  </form>
                </details>
                <details className="rounded-md border border-neutral-200 p-3">
                  <summary className="cursor-pointer text-sm font-medium">Edit agreement</summary>
                  <form action={updateManpowerAction} className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <input type="hidden" name="contract_id" value={a.contract_id} />
                    <BasisFields a={a} />
                    <div className="sm:col-span-3"><Button type="submit" variant="secondary">Save agreement</Button></div>
                  </form>
                </details>
              </div>
            </CardBody>
          </Card>
        );
      })}
    </div>
  );
}
