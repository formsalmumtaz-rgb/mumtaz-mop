import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantId } from "@/lib/tenant";
import { getContract, getScheduleSummary } from "@/lib/domain/contracts";
import { listFrequencies, listPricingModels } from "@/lib/domain/reference";
import {
  activateContractAction, setContractBillingAction,
  updateContractAction, extendContractAction, archiveContractAction, restoreContractAction,
} from "./actions";

const FREQS = ["per_visit", "weekly", "monthly", "quarterly", "half_yearly", "yearly", "custom"];

export const dynamic = "force-dynamic";
const aed = (n: string | null, ccy = "AED") => (n == null ? "—" : `${ccy} ${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`);
const ipt = "mt-1 w-full rounded border border-neutral-300 px-2 py-2";

export default async function ContractDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenantId = await getTenantId();
  const ct = await getContract(tenantId, id);
  if (!ct) notFound();
  const [sum, frequencies, pricingModels] = await Promise.all([
    getScheduleSummary(tenantId, id),
    listFrequencies(tenantId),
    listPricingModels(tenantId),
  ]);
  const isActive = ct.lifecycle_status === "active";
  const locked = ct.financially_locked;
  const archived = !!ct.archived_at;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Link href={`/customers/${ct.customer_id}`} className="text-sm text-brand underline">← {ct.customer_name ?? "Customer"}</Link>
          <h1 className="mt-1 flex items-center gap-3 text-2xl font-semibold">
            {ct.contract_number ?? "(no number)"}
            <StatusPill status={ct.lifecycle_status} />
            {archived && <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-xs text-neutral-600">archived</span>}
          </h1>
          <p className="mt-1 text-sm text-neutral-600">
            {aed(ct.contract_value, ct.currency)}
            {ct.frequency_name && <> · {ct.frequency_name}</>}
            {ct.start_date && <> · {ct.start_date} → {ct.end_date ?? "?"}</>}
            {ct.source_estimate_id && <> · from <Link href={`/estimates/${ct.source_estimate_id}`} className="text-brand underline">estimate</Link></>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a href={`/contracts/${ct.id}/agreement`}
             className="rounded border border-neutral-300 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50">
            Agreement (Word) ↓
          </a>
          {!isActive && !archived && (
            <form action={activateContractAction}>
              <input type="hidden" name="contract_id" value={ct.id} />
              <button className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">Activate ▶</button>
            </form>
          )}
          {archived ? (
            <form action={restoreContractAction}><input type="hidden" name="contract_id" value={ct.id} />
              <button className="rounded border border-neutral-300 px-3 py-2 text-sm text-brand hover:bg-neutral-50">Restore</button></form>
          ) : !isActive && (
            <form action={archiveContractAction}><input type="hidden" name="contract_id" value={ct.id} />
              <button className="rounded border border-neutral-300 px-3 py-2 text-sm text-neutral-600 hover:text-red-600">Archive</button></form>
          )}
        </div>
      </div>

      {/* Contract terms — editable while unlocked; frozen once invoiced */}
      <section className="rounded-lg border border-neutral-200 bg-white p-5">
        <h2 className="mb-1 font-medium">Contract terms</h2>
        {locked ? (
          <>
            <div className="mb-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              This contract has issued invoices, so its commercial terms are locked and shown read-only. Correct billed amounts with a <Link href="/credit-notes" className="font-medium underline">credit note</Link>; the term can still be extended below.
            </div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
              {[["Contract number", ct.contract_number ?? "—"], ["Frequency", ct.frequency_name ?? "—"],
                ["Pricing model", ct.pricing_model_name ?? "—"], ["Value", aed(ct.contract_value, ct.currency)],
                ["Start", ct.start_date ?? "—"], ["End", ct.end_date ?? "—"]].map(([k, v]) => (
                <div key={k}><dt className="text-neutral-500">{k}</dt><dd className="font-medium text-neutral-800">{v}</dd></div>
              ))}
            </dl>
            <form action={extendContractAction} className="mt-4 flex flex-wrap items-end gap-3 border-t border-neutral-100 pt-4">
              <input type="hidden" name="contract_id" value={ct.id} />
              <label className="text-sm"><span className="text-neutral-600">Extend end date</span>
                <input name="end_date" type="date" defaultValue={ct.end_date ?? ""} className={ipt} /></label>
              <button className="rounded bg-neutral-800 px-4 py-2 text-sm text-white hover:bg-neutral-700">Save end date</button>
            </form>
          </>
        ) : (
          <>
            <p className="mb-4 text-sm text-neutral-600">
              {isActive
                ? "This contract is active but not yet invoiced — terms are still editable. Note a schedule may already have been generated on activation."
                : "Draft — terms are fully editable until the first invoice is issued."}
            </p>
            <form action={updateContractAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <input type="hidden" name="contract_id" value={ct.id} />
              <label className="text-sm"><span className="text-neutral-600">Contract number</span>
                <input name="contract_number" defaultValue={ct.contract_number ?? ""} className={ipt} /></label>
              <label className="text-sm"><span className="text-neutral-600">Frequency</span>
                <select name="frequency_id" defaultValue={ct.frequency_id ?? ""} className={ipt}>
                  <option value="">—</option>{frequencies.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select></label>
              <label className="text-sm"><span className="text-neutral-600">Pricing model</span>
                <select name="pricing_model_id" defaultValue={ct.pricing_model_id ?? ""} className={ipt}>
                  <option value="">—</option>{pricingModels.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select></label>
              <label className="text-sm"><span className="text-neutral-600">Value</span>
                <div className="mt-1 flex gap-2">
                  <input name="contract_value" type="number" step="0.01" defaultValue={ct.contract_value ?? ""} className="w-full rounded border border-neutral-300 px-2 py-2" />
                  <input name="currency" defaultValue={ct.currency ?? "AED"} className="w-20 rounded border border-neutral-300 px-2 py-2" />
                </div></label>
              <label className="text-sm"><span className="text-neutral-600">Start date</span>
                <input name="start_date" type="date" defaultValue={ct.start_date ?? ""} className={ipt} /></label>
              <label className="text-sm"><span className="text-neutral-600">End date</span>
                <input name="end_date" type="date" defaultValue={ct.end_date ?? ""} className={ipt} /></label>
              <div className="sm:col-span-2 lg:col-span-3"><button className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">Save contract terms</button></div>
            </form>
          </>
        )}
      </section>

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

      {/* Recurring billing */}
      <section className="rounded-lg border border-neutral-200 bg-white p-5">
        <h2 className="mb-1 font-medium">Recurring billing</h2>
        <p className="mb-4 text-sm text-neutral-600">
          {ct.auto_generate_invoice && ct.billing_frequency && ct.billing_frequency !== "per_visit"
            ? <>Auto-billing <b>{ct.billing_frequency}</b> · next {ct.next_invoice_date ?? "—"}{ct.last_invoice_date && <> · last {ct.last_invoice_date}</>}. Managed on the <Link href="/billing" className="text-brand underline">billing page</Link>.</>
            : <>Not on recurring billing. Per-visit contracts bill from service reports; set a frequency below to auto-generate invoices.</>}
        </p>
        <form action={setContractBillingAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input type="hidden" name="contract_id" value={ct.id} />
          <label className="text-sm"><span className="text-neutral-600">Billing frequency</span>
            <select name="billing_frequency" defaultValue={ct.billing_frequency ?? ""} className="mt-1 w-full rounded border border-neutral-300 px-2 py-2">
              <option value="">—</option>{FREQS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select></label>
          <label className="text-sm"><span className="text-neutral-600">Billing day (month-based)</span>
            <input name="billing_day" type="number" min="1" max="31" defaultValue={ct.billing_day ?? ""} className="mt-1 w-full rounded border border-neutral-300 px-2 py-2" /></label>
          <label className="text-sm"><span className="text-neutral-600">Custom interval (days)</span>
            <input name="billing_interval_days" type="number" min="1" defaultValue={ct.billing_interval_days ?? ""} className="mt-1 w-full rounded border border-neutral-300 px-2 py-2" /></label>
          <label className="text-sm"><span className="text-neutral-600">Next invoice date</span>
            <input name="next_invoice_date" type="date" defaultValue={ct.next_invoice_date ?? ""} className="mt-1 w-full rounded border border-neutral-300 px-2 py-2" /></label>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="auto_generate_invoice" defaultChecked={ct.auto_generate_invoice} className="h-4 w-4" />
            <span>Auto-generate invoices on schedule</span></label>
          <div className="sm:col-span-2 lg:col-span-4"><button className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">Save billing settings</button></div>
        </form>
      </section>
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
