"use client";
import { useState } from "react";

interface TechOpt { id: string; name: string | null }
interface Initial {
  id?: string;
  code?: string | null;
  name?: string | null;
  registration_plate?: string | null;
  ownership_type?: string;
  monthly_depreciation?: string | null;
  monthly_lease_cost?: string | null;
  technician_id?: string | null;
}

const money = (v: string) => {
  const n = Number((v ?? "").trim());
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

// Per-vehicle ownership + monthly fixed cost, with a live preview. Depreciation
// applies to company-owned; lease/rental to leased/rented. The live figure equals
// the DB generated column monthly_fixed_cost. Management-accounting only — never in
// operational job profitability.
export function VehicleForm({
  action, technicians, defaultDepreciation, initial, submitLabel,
}: {
  action: (fd: FormData) => Promise<void>;
  technicians: TechOpt[];
  defaultDepreciation: string | null;
  initial?: Initial;
  submitLabel: string;
}) {
  const [ownership, setOwnership] = useState(initial?.ownership_type ?? "company_owned");
  const [dep, setDep] = useState(initial?.monthly_depreciation ?? (initial ? "" : defaultDepreciation ?? ""));
  const [lease, setLease] = useState(initial?.monthly_lease_cost ?? "");

  const isOwned = ownership === "company_owned";
  const fixed = isOwned ? money(dep) : money(lease);

  return (
    <form action={action} className="mt-3 space-y-4">
      {initial?.id && <input type="hidden" name="id" value={initial.id} />}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="text-sm">
          <span className="text-neutral-600">Code</span>
          <input name="code" defaultValue={initial?.code ?? ""} placeholder="e.g. VAN-01"
                 className="mt-1 w-full rounded border border-neutral-300 px-2 py-2" />
        </label>
        <label className="text-sm">
          <span className="text-neutral-600">Name</span>
          <input name="name" defaultValue={initial?.name ?? ""} className="mt-1 w-full rounded border border-neutral-300 px-2 py-2" />
        </label>
        <label className="text-sm">
          <span className="text-neutral-600">Registration plate</span>
          <input name="registration_plate" defaultValue={initial?.registration_plate ?? ""} className="mt-1 w-full rounded border border-neutral-300 px-2 py-2" />
        </label>
        <label className="text-sm">
          <span className="text-neutral-600">Ownership</span>
          <select name="ownership_type" value={ownership} onChange={(e) => setOwnership(e.target.value)}
                  className="mt-1 w-full rounded border border-neutral-300 px-2 py-2">
            <option value="company_owned">Company-owned</option>
            <option value="leased">Leased</option>
            <option value="rented">Rented</option>
          </select>
        </label>
        {isOwned ? (
          <label className="text-sm">
            <span className="text-neutral-600">Monthly depreciation (AED)</span>
            <input name="monthly_depreciation" type="number" min="0" step="any" value={dep} onChange={(e) => setDep(e.target.value)}
                   className="mt-1 w-full rounded border border-neutral-300 px-2 py-2" />
          </label>
        ) : (
          <label className="text-sm">
            <span className="text-neutral-600">Monthly lease/rental (AED)</span>
            <input name="monthly_lease_cost" type="number" min="0" step="any" value={lease} onChange={(e) => setLease(e.target.value)}
                   className="mt-1 w-full rounded border border-neutral-300 px-2 py-2" />
          </label>
        )}
        {/* keep the inactive field submitted (cleared server-side by ownership) */}
        {isOwned
          ? <input type="hidden" name="monthly_lease_cost" value="" />
          : <input type="hidden" name="monthly_depreciation" value="" />}
        <label className="text-sm">
          <span className="text-neutral-600">Assigned driver</span>
          <select name="technician_id" defaultValue={initial?.technician_id ?? ""} className="mt-1 w-full rounded border border-neutral-300 px-2 py-2">
            <option value="">—</option>
            {technicians.map((t) => <option key={t.id} value={t.id}>{t.name ?? "—"}</option>)}
          </select>
        </label>
      </div>

      <div className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-4 py-3 text-sm">
        Monthly fixed cost:{" "}
        <span className="font-semibold text-neutral-900">AED {fixed.toLocaleString(undefined, { maximumFractionDigits: 2 })}/mo</span>
        <span className="text-neutral-500"> · {isOwned ? "depreciation" : "lease/rental"} · management analytics only (not in job cost)</span>
      </div>

      <button className="w-full rounded bg-brand px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-dark sm:w-auto">{submitLabel}</button>
    </form>
  );
}
