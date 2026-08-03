import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantId } from "@/lib/tenant";
import { getContract, getScheduleSummary } from "@/lib/domain/contracts";
import { activateContractAction } from "./actions";

export const dynamic = "force-dynamic";
const aed = (n: string | null, ccy = "AED") => (n == null ? "—" : `${ccy} ${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`);

export default async function ContractDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenantId = await getTenantId();
  const ct = await getContract(tenantId, id);
  if (!ct) notFound();
  const sum = await getScheduleSummary(tenantId, id);
  const isActive = ct.lifecycle_status === "active";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Link href={`/customers/${ct.customer_id}`} className="text-sm text-brand underline">← {ct.customer_name ?? "Customer"}</Link>
          <h1 className="mt-1 flex items-center gap-3 text-2xl font-semibold">
            {ct.contract_number ?? "(no number)"}
            <StatusPill status={ct.lifecycle_status} />
          </h1>
          <p className="mt-1 text-sm text-neutral-600">
            {aed(ct.contract_value, ct.currency)}
            {ct.frequency_name && <> · {ct.frequency_name}</>}
            {ct.start_date && <> · {ct.start_date} → {ct.end_date ?? "?"}</>}
            {ct.source_estimate_id && <> · from <Link href={`/estimates/${ct.source_estimate_id}`} className="text-brand underline">estimate</Link></>}
          </p>
        </div>
        {!isActive && (
          <form action={activateContractAction}>
            <input type="hidden" name="contract_id" value={ct.id} />
            <button className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">Activate ▶</button>
          </form>
        )}
      </div>

      {/* Contract services */}
      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-neutral-100 text-left text-neutral-600">
            <tr>
              <th className="px-3 py-2 font-medium">Service</th><th className="px-3 py-2 font-medium">Pricing model</th>
              <th className="px-3 py-2 font-medium text-right">Unit price</th><th className="px-3 py-2 font-medium text-right">Qty</th>
              <th className="px-3 py-2 font-medium">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {ct.lines.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-neutral-500">No service lines.</td></tr>}
            {ct.lines.map((l) => (
              <tr key={l.id}>
                <td className="px-3 py-2">{l.service_type_name ?? "—"}</td>
                <td className="px-3 py-2 text-neutral-600">{l.pricing_model_name ?? "—"}</td>
                <td className="px-3 py-2 text-right">{aed(l.unit_price, ct.currency)}</td>
                <td className="px-3 py-2 text-right">{Number(l.quantity).toLocaleString()}</td>
                <td className="px-3 py-2 text-neutral-500">{l.notes ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Fan-out summary */}
      {isActive && sum.scheduleCount > 0 ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          Auto-generated on activation: <b>{sum.scheduleCount}</b> scheduled visits
          {sum.firstDate && <> ({sum.firstDate} → {sum.lastDate})</>} · <b>{sum.jobsCount}</b> jobs · <b>{sum.remindersCount}</b> renewal reminder.
        </div>
      ) : (
        <p className="text-sm text-neutral-500">
          {isActive
            ? "Active — no schedule rows found yet."
            : "Draft. Activating emits "}
          {!isActive && <code className="rounded bg-neutral-100 px-1">contract.activated</code>}
          {!isActive && " — K2 fans out the schedule + jobs."}
        </p>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-emerald-100 text-emerald-800 ring-emerald-300",
    draft: "bg-neutral-100 text-neutral-700 ring-neutral-300",
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${map[status] ?? map.draft}`}>{status}</span>;
}
