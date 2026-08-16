import Link from "next/link";
import { getTenantId } from "@/lib/tenant";
import { listCustomersPaged } from "@/lib/domain/customers";
import { listFacilityTypes } from "@/lib/domain/reference";
import { parseListParams } from "@/lib/list";
import { ListToolbar, Pagination, ExportButtons, FilterChips } from "@/components/ListControls";
import { NewCustomerForm } from "@/components/NewCustomerForm";
import { createCustomerAction, archiveCustomerAction, restoreCustomerAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function CustomersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const params = parseListParams(sp);
  const tenantId = await getTenantId();
  const [{ rows: customers, total }, facilityTypes] = await Promise.all([
    listCustomersPaged(tenantId, params),
    listFacilityTypes(tenantId),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Customers</h1>
          <p className="mt-1 text-sm text-neutral-600">{total} customer(s)</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ListToolbar basePath="/customers" params={sp} placeholder="Search name or code" />
          <ExportButtons dataset="customers" params={sp} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <FilterChips basePath="/customers" params={sp} name="emirate" allLabel="All emirates"
          options={["Sharjah", "Dubai", "Abu Dhabi", "Ajman"].map((e) => ({ value: e, label: e }))} />
        <FilterChips basePath="/customers" params={sp} name="type" allLabel="All types"
          options={[{ value: "b2b", label: "B2B" }, { value: "b2c", label: "B2C" }]} />
      </div>

      {/* Create — items 14-17: same-name checkbox, B2B/Sharjah defaults,
          inline first site with server-side geocoded pin */}
      <details className="rounded-lg border border-neutral-200 bg-white p-4" open={customers.length === 0}>
        <summary className="cursor-pointer font-medium">New customer</summary>
        <NewCustomerForm action={createCustomerAction}
          facilityTypes={facilityTypes.map((f: { id: string; name: string | null }) => ({ id: f.id, name: f.name }))} />
      </details>

      {/* List */}
      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-100 text-left text-neutral-600">
            <tr>
              <th className="px-4 py-2 font-medium">Code</th>
              <th className="px-4 py-2 font-medium">Trade name</th>
              <th className="px-4 py-2 font-medium">Legal name / TRN</th>
              <th className="px-4 py-2 font-medium">Emirate</th>
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {customers.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-neutral-500">No customers found.</td></tr>
            )}
            {customers.map((c) => (
              <tr key={c.id} className={c.archived_at ? "bg-neutral-50 text-neutral-400" : ""}>
                <td className="px-4 py-2 font-mono text-xs text-neutral-500">{c.code}</td>
                <td className="px-4 py-2">
                  <Link href={`/customers/${c.id}`} className="text-brand underline">{c.trade_name ?? "(no name)"}</Link>
                  {c.archived_at && <span className="ml-2 rounded-full bg-neutral-200 px-2 py-0.5 text-xs text-neutral-600">archived</span>}
                </td>
                <td className="px-4 py-2 text-neutral-600">
                  {c.legal_name ?? <span className="text-amber-600">legal name missing</span>}
                  {" · "}
                  {c.trn ?? <span className="text-amber-600">TRN missing</span>}
                </td>
                <td className="px-4 py-2 text-neutral-600">{c.emirate ?? "—"}</td>
                <td className="px-4 py-2 text-neutral-600">{c.customer_type ?? "—"}</td>
                <td className="px-4 py-2 text-right">
                  {c.archived_at ? (
                    <form action={restoreCustomerAction}><input type="hidden" name="id" value={c.id} />
                      <button className="text-xs text-brand hover:underline">restore</button></form>
                  ) : (
                    <form action={archiveCustomerAction}><input type="hidden" name="id" value={c.id} />
                      <button className="text-xs text-neutral-500 hover:text-red-600">archive</button></form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination basePath="/customers" params={sp} page={params.page} pageSize={params.pageSize} total={total} />
    </div>
  );
}
