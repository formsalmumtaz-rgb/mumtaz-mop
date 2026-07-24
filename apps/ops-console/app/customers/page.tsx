import Link from "next/link";
import { getTenantId } from "@/lib/tenant";
import { listCustomers } from "@/lib/domain/customers";
import { createCustomerAction } from "./actions";

export const dynamic = "force-dynamic";

const EMIRATES = ["Abu Dhabi", "Dubai", "Sharjah", "Ajman", "Umm Al Quwain", "Ras Al Khaimah", "Fujairah"];

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const tenantId = await getTenantId();
  const customers = await listCustomers(tenantId, q);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Customers</h1>
          <p className="mt-1 text-sm text-neutral-600">{customers.length} customer(s)</p>
        </div>
        <form className="flex gap-2" action="/customers" method="get">
          <input name="q" defaultValue={q ?? ""} placeholder="Search name or code"
                 className="w-64 rounded border border-neutral-300 px-3 py-1.5 text-sm" />
          <button className="rounded border border-neutral-300 px-3 py-1.5 text-sm">Search</button>
        </form>
      </div>

      {/* Create */}
      <details className="rounded-lg border border-neutral-200 bg-white p-4" open={customers.length === 0}>
        <summary className="cursor-pointer font-medium">New customer</summary>
        <form action={createCustomerAction} className="mt-4 grid grid-cols-2 gap-4">
          <label className="text-sm">
            <span className="text-neutral-600">Trade name *</span>
            <input name="trade_name" required className="mt-1 w-full rounded border border-neutral-300 px-2 py-1" />
          </label>
          <label className="text-sm">
            <span className="text-neutral-600">Legal name <span className="text-amber-600">(needed for tax invoices)</span></span>
            <input name="legal_name" className="mt-1 w-full rounded border border-neutral-300 px-2 py-1" />
          </label>
          <label className="text-sm">
            <span className="text-neutral-600">TRN</span>
            <input name="trn" className="mt-1 w-full rounded border border-neutral-300 px-2 py-1" />
          </label>
          <label className="text-sm">
            <span className="text-neutral-600">Trade license</span>
            <input name="trade_license" className="mt-1 w-full rounded border border-neutral-300 px-2 py-1" />
          </label>
          <label className="text-sm">
            <span className="text-neutral-600">Customer type</span>
            <select name="customer_type" className="mt-1 w-full rounded border border-neutral-300 px-2 py-1">
              <option value="">—</option>
              <option value="B2B">B2B</option>
              <option value="B2G">B2G</option>
              <option value="B2C">B2C</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="text-neutral-600">Emirate</span>
            <select name="emirate" className="mt-1 w-full rounded border border-neutral-300 px-2 py-1">
              <option value="">—</option>
              {EMIRATES.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
          </label>
          <div className="col-span-2">
            <button className="rounded bg-brand px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-dark">
              Create customer
            </button>
          </div>
        </form>
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
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {customers.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-neutral-500">No customers yet — create one above.</td></tr>
            )}
            {customers.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-2 font-mono text-xs text-neutral-500">{c.code}</td>
                <td className="px-4 py-2">
                  <Link href={`/customers/${c.id}`} className="text-brand underline">{c.trade_name ?? "(no name)"}</Link>
                </td>
                <td className="px-4 py-2 text-neutral-600">
                  {c.legal_name ?? <span className="text-amber-600">legal name missing</span>}
                  {" · "}
                  {c.trn ?? <span className="text-amber-600">TRN missing</span>}
                </td>
                <td className="px-4 py-2 text-neutral-600">{c.emirate ?? "—"}</td>
                <td className="px-4 py-2 text-neutral-600">{c.customer_type ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
