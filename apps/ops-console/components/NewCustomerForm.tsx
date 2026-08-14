"use client";
import { useState } from "react";

// Walkthrough items 14–17:
//  14 — "legal name same as trade name" (default ON: same name is the common
//       case; one entry fills both).
//  15 — customer type defaults B2B; emirate defaults Sharjah. Both editable.
//  16 — the FIRST site is captured inline (address + premises type); the
//       separate "Add site" flow is for the second site onward. The pin is
//       geocoded server-side from the address (Art. XVII — never in the browser).
//  17 — Google Places autocomplete arrives when the browser key gains the
//       Places API (BLOCKED A21a); until then this plain address field is the
//       documented fallback.
const EMIRATES = ["Sharjah", "Dubai", "Ajman", "Abu Dhabi", "Umm Al Quwain", "Ras Al Khaimah", "Fujairah"];

export function NewCustomerForm({ action, facilityTypes }: {
  action: (fd: FormData) => Promise<void>;
  facilityTypes: { id: string; name: string | null }[];
}) {
  const [sameName, setSameName] = useState(true);
  const [trade, setTrade] = useState("");
  const ipt = "mt-1 w-full rounded border border-neutral-300 px-2 py-2";
  return (
    <form action={action} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
      <label className="text-sm">
        <span className="text-neutral-600">Trade name *</span>
        <input name="trade_name" required value={trade} onChange={(e) => setTrade(e.target.value)} className={ipt} />
      </label>
      <div className="text-sm">
        <span className="text-neutral-600">Legal name <span className="text-amber-600">(needed for tax invoices)</span></span>
        {sameName
          ? <input name="legal_name" value={trade} readOnly className={`${ipt} bg-neutral-50 text-neutral-500`} />
          : <input name="legal_name" className={ipt} />}
        <label className="mt-1 flex items-center gap-2 text-xs text-neutral-600">
          <input type="checkbox" checked={sameName} onChange={(e) => setSameName(e.target.checked)} />
          Same as trade name
        </label>
      </div>
      <label className="text-sm"><span className="text-neutral-600">TRN</span>
        <input name="trn" className={ipt} /></label>
      <label className="text-sm"><span className="text-neutral-600">Trade license</span>
        <input name="trade_license" className={ipt} /></label>
      <label className="text-sm"><span className="text-neutral-600">Customer type</span>
        <select name="customer_type" defaultValue="B2B" className={ipt}>
          <option value="B2B">B2B (company)</option>
          <option value="B2C">B2C (individual)</option>
          <option value="B2G">B2G (government)</option>
        </select></label>
      <label className="text-sm"><span className="text-neutral-600">Emirate</span>
        <select name="emirate" defaultValue="Sharjah" className={ipt}>
          {EMIRATES.map((e) => <option key={e} value={e}>{e}</option>)}
        </select></label>

      <fieldset className="rounded border border-dashed border-neutral-300 p-3 sm:col-span-2">
        <legend className="px-1 text-xs font-medium uppercase tracking-wide text-neutral-500">First site (most customers have exactly one — more sites can be added on the profile)</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="text-sm sm:col-span-2"><span className="text-neutral-600">Site address</span>
            <input name="site_address" placeholder="e.g. Shop 4, Al Wahda Street, Al Manakh" className={ipt} />
            <span className="mt-0.5 block text-xs text-neutral-400">The map pin is looked up from this address automatically.</span></label>
          <label className="text-sm"><span className="text-neutral-600">Premises type</span>
            <select name="site_facility_type_id" defaultValue="" className={ipt}>
              <option value="">—</option>
              {facilityTypes.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            <span className="mt-0.5 block text-xs text-neutral-400">Drives the municipality visit-frequency rules.</span></label>
        </div>
      </fieldset>

      <div className="sm:col-span-2">
        <button className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">Create customer</button>
      </div>
    </form>
  );
}
