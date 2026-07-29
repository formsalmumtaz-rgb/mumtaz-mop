import { getTenantId } from "@/lib/tenant";
import { getCostRates, listCostAccounts, getReadiness } from "@/lib/domain/costconfig";
import { listEmployeeCosts } from "@/lib/domain/employeecost";
import { AssumedBadge } from "@/components/AssumedBadge";
import { EmployeeCostForm } from "./EmployeeCostForm";
import { saveRatesAction, confirmAccountAction, saveEmployeeCostAction, runBacklogAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function CostConfigPage() {
  const tenantId = await getTenantId();
  const [rates, accounts, readiness, employees] = await Promise.all([
    getCostRates(tenantId),
    listCostAccounts(tenantId),
    getReadiness(tenantId),
    listEmployeeCosts(tenantId),
  ]);
  // Only labour/vehicle accounts gate unless overhead is on.
  const shownAccounts = rates.overhead_enabled ? accounts : accounts.filter((a) => !a.key.includes("overhead"));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Cost setup</h1>
        <p className="mt-1 text-sm text-neutral-600">Standard rates, GL accounts and per-technician employment cost. The costing engine stays off until these are confirmed.</p>
      </div>

      {/* Readiness */}
      {readiness.ready ? (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4">
          <p className="font-medium text-emerald-900">✓ Costing configured — profitability is live.</p>
          {readiness.uncosted_jobs > 0 ? (
            <form action={runBacklogAction} className="mt-3">
              <p className="text-sm text-emerald-800">{readiness.uncosted_jobs} completed job(s) done before configuration are not yet costed.</p>
              <button className="mt-2 rounded bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800">
                Cost {readiness.uncosted_jobs} job(s) now
              </button>
            </form>
          ) : (
            <p className="mt-1 text-sm text-emerald-800">All completed jobs are costed.</p>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
          <p className="font-medium text-amber-900">Costing not yet configured — {readiness.unconfirmed} value(s) require confirmation.</p>
          <ul className="mt-2 list-inside list-disc text-sm text-amber-800">
            {readiness.items.map((i) => <li key={i}>{i}</li>)}
          </ul>
          <p className="mt-2 text-sm text-amber-800">
            No profitability figures are produced until these are set — no half-real margins.
            Confirming them unlocks per-job profitability{readiness.uncosted_jobs > 0 ? ` and retroactively costs ${readiness.uncosted_jobs} completed job(s)` : ""}.
          </p>
        </div>
      )}

      {/* Standard rates */}
      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="font-medium">Standard rates</h2>
        <form action={saveRatesAction} className="mt-3 space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="text-sm">
              <span className="text-neutral-600">Labour rate (AED/hr) {rates.labour_assumed && <AssumedBadge />}</span>
              <input name="labour_rate" type="number" min="0" step="any" defaultValue={rates.labour_rate ?? ""} className="mt-1 w-full rounded border border-neutral-300 px-2 py-2" />
            </label>
            <label className="text-sm">
              <span className="text-neutral-600">Vehicle rate (AED/km) {rates.vehicle_assumed && <AssumedBadge />}</span>
              <input name="vehicle_rate" type="number" min="0" step="any" defaultValue={rates.vehicle_rate ?? ""} className="mt-1 w-full rounded border border-neutral-300 px-2 py-2" />
            </label>
            <label className="text-sm">
              <span className="text-neutral-600">Overhead rate (AED/labour-hr) {rates.overhead_assumed && <AssumedBadge />}</span>
              <input name="overhead_rate" type="number" min="0" step="any" defaultValue={rates.overhead_rate ?? ""} className="mt-1 w-full rounded border border-neutral-300 px-2 py-2" />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="overhead_enabled" defaultChecked={rates.overhead_enabled} />
            <span className="text-neutral-700">Absorb overhead into job cost (off = overhead excluded, and reports say so)</span>
          </label>
          <button className="w-full rounded bg-brand px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-dark sm:w-auto">Save rates</button>
        </form>
      </div>

      {/* GL accounts */}
      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="font-medium">GL account codes</h2>
        <p className="mt-1 text-sm text-neutral-600">Confirm each against your chart of accounts. Editing the code updates the mapping.</p>
        <div className="mt-3 grid grid-cols-1 gap-2">
          {shownAccounts.map((a) => (
            <form key={a.key} action={confirmAccountAction} className="flex flex-wrap items-end gap-2 border-b border-neutral-100 pb-2">
              <input type="hidden" name="key" value={a.key} />
              <div className="w-40 text-sm text-neutral-700">{a.label}</div>
              <label className="text-sm">
                <span className="text-neutral-500 text-xs">Code</span>
                <input name="code" defaultValue={a.code ?? ""} className="mt-0.5 w-24 rounded border border-neutral-300 px-2 py-1 font-mono" />
              </label>
              <label className="text-sm flex-1 min-w-[10rem]">
                <span className="text-neutral-500 text-xs">Name</span>
                <input name="name" defaultValue={a.account_name ?? ""} className="mt-0.5 w-full rounded border border-neutral-300 px-2 py-1" />
              </label>
              {a.is_assumed ? <AssumedBadge /> : <span className="text-xs font-medium text-emerald-700">✓ confirmed</span>}
              <button className="rounded border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-50">{a.is_assumed ? "Confirm" : "Update"}</button>
            </form>
          ))}
        </div>
      </div>

      {/* Employee cost */}
      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="font-medium">Employee cost <span className="text-sm text-neutral-500">({employees.length} technicians)</span></h2>
        <p className="mt-1 text-sm text-neutral-600">Enter each technician's components; the fully-loaded hourly cost updates live. Saving opens a new immutable version.</p>
        <div className="mt-3 grid grid-cols-1 gap-3">
          {employees.map((e) => (
            <div key={e.technician_id} className="rounded border border-neutral-200 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{e.full_name ?? e.code}</span>
                {e.hourly_cost != null
                  ? <span className="text-sm text-neutral-700">AED {Number(e.hourly_cost).toLocaleString(undefined, { maximumFractionDigits: 4 })}/hr · v{e.version_no}</span>
                  : <span className="text-sm text-amber-600">no cost set</span>}
              </div>
              <details className="mt-2">
                <summary className="cursor-pointer text-sm text-brand">{e.version_id ? "Edit (new version)" : "Set up"}</summary>
                <EmployeeCostForm
                  action={saveEmployeeCostAction}
                  technicianId={e.technician_id}
                  initial={{
                    basic_salary: e.basic_salary, accommodation_monthly: e.accommodation_monthly,
                    transport_allowance_monthly: e.transport_allowance_monthly, medical_insurance_annual: e.medical_insurance_annual,
                    air_ticket_annual: e.air_ticket_annual, visa_cost: e.visa_cost, emirates_id_cost: e.emirates_id_cost,
                    visa_eid_amortisation_months: e.visa_eid_amortisation_months, gratuity_days_per_year: e.gratuity_days_per_year,
                    productive_hours_month: e.productive_hours_month,
                  }}
                />
              </details>
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs text-neutral-500">Every change is audit-logged. Employee cost edits create a new version; prior versions stay frozen so past job costs are unchanged.</p>
    </div>
  );
}
