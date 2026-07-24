import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantId } from "@/lib/tenant";
import { getCustomer } from "@/lib/domain/customers";
import { listBranches } from "@/lib/domain/branches";
import { listContracts, getScheduleSummary } from "@/lib/domain/contracts";
import { listFrequencies, listPricingModels, listFacilityTypes } from "@/lib/domain/reference";
import { AssumedBadge } from "@/components/AssumedBadge";
import { PinPicker } from "@/components/PinPicker";
import {
  updateCustomerAction, confirmCustomerAction, createBranchAction,
  createContractAction, activateContractAction,
} from "./actions";

export const dynamic = "force-dynamic";

const EMIRATES = ["Abu Dhabi", "Dubai", "Sharjah", "Ajman", "Umm Al Quwain", "Ras Al Khaimah", "Fujairah"];

export default async function CustomerDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenantId = await getTenantId();
  const customer = await getCustomer(tenantId, id);
  if (!customer) notFound();

  const [branches, contracts, frequencies, pricingModels, facilityTypes] = await Promise.all([
    listBranches(tenantId, id),
    listContracts(tenantId, id),
    listFrequencies(tenantId),
    listPricingModels(tenantId),
    listFacilityTypes(tenantId),
  ]);
  const summaries = new Map(
    await Promise.all(contracts.map(async (ct) => [ct.id, await getScheduleSummary(tenantId, ct.id)] as const)),
  );

  return (
    <div className="space-y-8">
      <div>
        <Link href="/customers" className="text-sm text-neutral-500 hover:underline">← Customers</Link>
        <h1 className="mt-1 flex items-center gap-3 text-2xl font-semibold">
          {customer.trade_name ?? "(no name)"}
          <span className="font-mono text-sm text-neutral-400">{customer.code}</span>
          {customer.is_assumed && <AssumedBadge />}
        </h1>
      </div>

      {/* Edit customer */}
      <section className="rounded-lg border border-neutral-200 bg-white p-5">
        <h2 className="mb-4 font-medium">Details</h2>
        <form action={updateCustomerAction} className="grid grid-cols-2 gap-4">
          <input type="hidden" name="id" value={customer.id} />
          <Field label="Trade name" name="trade_name" defaultValue={customer.trade_name} />
          <Field label="Legal name (tax invoices)" name="legal_name" defaultValue={customer.legal_name} highlight={!customer.legal_name} />
          <Field label="TRN" name="trn" defaultValue={customer.trn} highlight={!customer.trn} />
          <Field label="Trade license" name="trade_license" defaultValue={customer.trade_license} />
          <label className="text-sm">
            <span className="text-neutral-600">Customer type</span>
            <select name="customer_type" defaultValue={customer.customer_type ?? ""} className="mt-1 w-full rounded border border-neutral-300 px-2 py-1">
              <option value="">—</option><option>B2B</option><option>B2G</option><option>B2C</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="text-neutral-600">Emirate</span>
            <select name="emirate" defaultValue={customer.emirate ?? ""} className="mt-1 w-full rounded border border-neutral-300 px-2 py-1">
              <option value="">—</option>{EMIRATES.map((e) => <option key={e}>{e}</option>)}
            </select>
          </label>
          <div className="col-span-2 flex gap-3">
            <button className="rounded bg-neutral-800 px-4 py-1.5 text-sm text-white hover:bg-neutral-700">Save</button>
          </div>
        </form>
        {customer.is_assumed && (
          <form action={confirmCustomerAction} className="mt-3">
            <input type="hidden" name="id" value={customer.id} />
            <button className="rounded border border-amber-400 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100">
              I confirm this value
            </button>
          </form>
        )}
      </section>

      {/* Branches */}
      <section className="rounded-lg border border-neutral-200 bg-white p-5">
        <h2 className="mb-4 font-medium">Branches / sites <span className="text-neutral-400">({branches.length})</span></h2>
        <div className="mb-4 overflow-hidden rounded border border-neutral-200">
          <table className="w-full text-sm">
            <thead className="bg-neutral-100 text-left text-neutral-600">
              <tr><th className="px-3 py-2">Code</th><th className="px-3 py-2">Name</th><th className="px-3 py-2">Address</th><th className="px-3 py-2">Facility</th><th className="px-3 py-2">GPS pin</th></tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {branches.length === 0 && <tr><td colSpan={5} className="px-3 py-4 text-center text-neutral-500">No sites yet.</td></tr>}
              {branches.map((b) => (
                <tr key={b.id}>
                  <td className="px-3 py-2 font-mono text-xs text-neutral-500">{b.code}</td>
                  <td className="px-3 py-2">{b.name ?? "—"}</td>
                  <td className="px-3 py-2 text-neutral-600">{b.address ?? "—"}</td>
                  <td className="px-3 py-2 text-neutral-600">{b.facility_type_name ?? "—"}</td>
                  <td className="px-3 py-2">
                    {b.lat != null
                      ? <span className="font-mono text-xs text-emerald-700">{b.lat.toFixed(5)}, {b.lng!.toFixed(5)}</span>
                      : <span className="text-amber-600 text-xs">no pin</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <details className="rounded border border-neutral-200 p-4" open={branches.length === 0}>
          <summary className="cursor-pointer text-sm font-medium">Add a site (with GPS pin)</summary>
          <form action={createBranchAction} className="mt-4 space-y-4">
            <input type="hidden" name="customer_id" value={customer.id} />
            <div className="grid grid-cols-2 gap-4">
              <Field label="Site name" name="name" />
              <Field label="Address" name="address" />
              <label className="text-sm">
                <span className="text-neutral-600">Emirate</span>
                <select name="emirate" className="mt-1 w-full rounded border border-neutral-300 px-2 py-1">
                  <option value="">—</option>{EMIRATES.map((e) => <option key={e}>{e}</option>)}
                </select>
              </label>
              <label className="text-sm">
                <span className="text-neutral-600">Facility type</span>
                <select name="facility_type_id" className="mt-1 w-full rounded border border-neutral-300 px-2 py-1">
                  <option value="">—</option>
                  {facilityTypes.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </label>
            </div>
            <PinPicker name="location" />
            <button className="rounded bg-brand px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-dark">Add site</button>
          </form>
        </details>
      </section>

      {/* Contracts */}
      <section className="rounded-lg border border-neutral-200 bg-white p-5">
        <h2 className="mb-4 font-medium">Contracts <span className="text-neutral-400">({contracts.length})</span></h2>
        <div className="mb-4 space-y-2">
          {contracts.length === 0 && <p className="text-sm text-neutral-500">No contracts yet.</p>}
          {contracts.map((ct) => {
            const sum = summaries.get(ct.id);
            return (
            <div key={ct.id} className="rounded border border-neutral-200 px-3 py-2 text-sm">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium">{ct.contract_number ?? "(no number)"}</span>
                  <span className="ml-2 text-neutral-500">
                    {ct.frequency_name ?? "no frequency"} · {ct.contract_value ? `${ct.contract_value} ${ct.currency}` : "no value"} · {ct.start_date ?? "?"}→{ct.end_date ?? "?"}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <StatusPill status={ct.lifecycle_status} />
                  {ct.lifecycle_status !== "active" && (
                    <form action={activateContractAction}>
                      <input type="hidden" name="customer_id" value={customer.id} />
                      <input type="hidden" name="contract_id" value={ct.id} />
                      <button className="rounded bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700">
                        Activate ▶
                      </button>
                    </form>
                  )}
                </div>
              </div>
              {sum && sum.scheduleCount > 0 && (
                <div className="mt-2 rounded bg-emerald-50 px-2 py-1 text-xs text-emerald-800">
                  Auto-generated: <b>{sum.scheduleCount}</b> scheduled visits
                  {sum.firstDate && <> ({sum.firstDate} → {sum.lastDate})</>} ·{" "}
                  <b>{sum.jobsCount}</b> jobs created · <b>{sum.remindersCount}</b> renewal reminder
                </div>
              )}
            </div>
            );
          })}
        </div>

        <details className="rounded border border-neutral-200 p-4" open={contracts.length === 0}>
          <summary className="cursor-pointer text-sm font-medium">New contract</summary>
          <form action={createContractAction} className="mt-4 grid grid-cols-2 gap-4">
            <input type="hidden" name="customer_id" value={customer.id} />
            <Field label="Contract number" name="contract_number" />
            <label className="text-sm">
              <span className="text-neutral-600">Frequency</span>
              <select name="frequency_id" className="mt-1 w-full rounded border border-neutral-300 px-2 py-1">
                <option value="">—</option>{frequencies.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </label>
            <label className="text-sm">
              <span className="text-neutral-600">Pricing model</span>
              <select name="pricing_model_id" className="mt-1 w-full rounded border border-neutral-300 px-2 py-1">
                <option value="">—</option>{pricingModels.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label className="text-sm">
              <span className="text-neutral-600">Value</span>
              <div className="mt-1 flex gap-2">
                <input name="contract_value" type="number" step="0.01" className="w-full rounded border border-neutral-300 px-2 py-1" />
                <input name="currency" defaultValue="AED" className="w-20 rounded border border-neutral-300 px-2 py-1" />
              </div>
            </label>
            <Field label="Start date" name="start_date" type="date" />
            <Field label="End date" name="end_date" type="date" />
            <div className="col-span-2">
              <button className="rounded bg-brand px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-dark">Create contract</button>
            </div>
          </form>
        </details>
        <p className="mt-3 text-xs text-neutral-500">
          Activating a contract emits <code className="rounded bg-neutral-100 px-1">contract.activated</code> — the event K2 fans out from (schedule + jobs).
        </p>
      </section>
    </div>
  );
}

function Field({ label, name, defaultValue, type = "text", highlight = false }:
  { label: string; name: string; defaultValue?: string | null; type?: string; highlight?: boolean }) {
  return (
    <label className="text-sm">
      <span className={highlight ? "text-amber-700" : "text-neutral-600"}>{label}</span>
      <input name={name} type={type} defaultValue={defaultValue ?? ""}
             className="mt-1 w-full rounded border border-neutral-300 px-2 py-1" />
    </label>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-emerald-100 text-emerald-800 ring-emerald-300",
    draft: "bg-neutral-100 text-neutral-700 ring-neutral-300",
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${map[status] ?? map.draft}`}>{status}</span>;
}
