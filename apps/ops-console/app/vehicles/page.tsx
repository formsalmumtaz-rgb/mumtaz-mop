import { getTenantId } from "@/lib/tenant";
import { listTechnicians } from "@/lib/domain/technicians";
import { listVehicles, getDefaultMonthlyDepreciation } from "@/lib/domain/vehicles";
import { AssumedBadge } from "@/components/AssumedBadge";
import { VehicleForm } from "./VehicleForm";
import Link from "next/link";
import { createVehicleAction, updateVehicleAction, archiveVehicleAction, restoreVehicleAction } from "./actions";

export const dynamic = "force-dynamic";

const aed = (v: string | null) =>
  v == null ? "—" : "AED " + Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 });
const OWN_LABEL: Record<string, string> = { company_owned: "Company-owned", leased: "Leased", rented: "Rented" };

export default async function VehiclesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const includeArchived = sp.archived === "1";
  const tenantId = await getTenantId();
  const [vehicles, techs, defaultDep] = await Promise.all([
    listVehicles(tenantId, includeArchived),
    listTechnicians(tenantId),
    getDefaultMonthlyDepreciation(tenantId),
  ]);
  const techOpts = techs.map((t) => ({ id: t.id, name: t.full_name ?? t.code }));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Vehicles</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Ownership and monthly depreciation/lease. <span className="font-medium">Management analytics only</span> — depreciation/lease never affects operational job profitability, technician KPIs, or job cost.
          </p>
        </div>
        <Link href={includeArchived ? "/vehicles" : "/vehicles?archived=1"}
              className={`shrink-0 rounded border px-3 py-1.5 text-sm ${includeArchived ? "border-brand bg-brand/5 text-brand" : "border-neutral-300 hover:bg-neutral-50"}`}>
          {includeArchived ? "✓ Including archived" : "Include archived"}
        </Link>
      </div>

      {/* Create */}
      <details className="rounded-lg border border-neutral-200 bg-white p-4" open={vehicles.length === 0}>
        <summary className="cursor-pointer font-medium">New vehicle</summary>
        <VehicleForm action={createVehicleAction} technicians={techOpts} defaultDepreciation={defaultDep} submitLabel="Create vehicle" />
        {defaultDep && <p className="mt-2 text-xs text-neutral-500">New company-owned vehicles pre-fill the default depreciation (AED {Number(defaultDep).toLocaleString()}/mo) as a fallback — edit per vehicle.</p>}
      </details>

      {/* List */}
      <div className="grid grid-cols-1 gap-3">
        {vehicles.length === 0 && (
          <p className="rounded-lg border border-neutral-200 bg-white px-4 py-6 text-center text-neutral-500">No vehicles yet — add one above.</p>
        )}
        {vehicles.map((v) => (
          <div key={v.id} className={`rounded-lg border border-neutral-200 bg-white p-4 ${v.archived_at ? "opacity-60" : ""}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{v.name ?? v.code ?? "(unnamed)"}</span>
                  {v.registration_plate && <span className="text-sm text-neutral-500">{v.registration_plate}</span>}
                  {v.is_assumed && <AssumedBadge note={v.assumed_note} />}
                  {v.archived_at && <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-xs text-neutral-600">archived</span>}
                </div>
                <div className="mt-1 text-sm text-neutral-600">
                  {OWN_LABEL[v.ownership_type] ?? v.ownership_type}
                  {" · "}fixed cost <span className="font-medium text-neutral-800">{aed(v.monthly_fixed_cost)}/mo</span>
                  {v.technician_name && <span> · driver {v.technician_name}</span>}
                </div>
              </div>
              {v.archived_at ? (
                <form action={restoreVehicleAction}><input type="hidden" name="id" value={v.id} />
                  <button className="text-xs text-brand hover:underline">restore</button></form>
              ) : (
                <form action={archiveVehicleAction}><input type="hidden" name="id" value={v.id} />
                  <button className="text-xs text-neutral-500 hover:text-red-600">archive</button></form>
              )}
            </div>
            <details className="mt-3">
              <summary className="cursor-pointer text-sm text-brand">Edit</summary>
              <VehicleForm
                action={updateVehicleAction}
                technicians={techOpts}
                defaultDepreciation={defaultDep}
                submitLabel="Save changes"
                initial={{
                  id: v.id, code: v.code, name: v.name, registration_plate: v.registration_plate,
                  ownership_type: v.ownership_type, monthly_depreciation: v.monthly_depreciation,
                  monthly_lease_cost: v.monthly_lease_cost, technician_id: v.technician_id,
                }}
              />
            </details>
          </div>
        ))}
      </div>

      <p className="text-xs text-neutral-500">Every create and edit is audit-logged. Depreciation/lease feeds Management Net Profit only.</p>
    </div>
  );
}
