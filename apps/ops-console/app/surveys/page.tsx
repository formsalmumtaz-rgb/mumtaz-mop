import Link from "next/link";
import { RowLink } from "@/components/RowLink";
import { ListToolbar } from "@/components/ListControls";
import { getTenantId } from "@/lib/tenant";
import { listCustomers } from "@/lib/domain/customers";
import { listTechnicians } from "@/lib/domain/technicians";
import { listSurveys } from "@/lib/domain/survey";
import { createSurveyAction } from "./actions";
import { canSeeProfit } from "@/lib/auth";
import { CustomerPicker } from "@/components/CustomerPicker";
import { LocationCapture } from "@/components/LocationCapture";
import { resolveLocationAction } from "@/app/customers/location-actions";
import { getServiceLineId, listFacilityTypes } from "@/lib/domain/reference";
import { listStaffForPicker } from "@/lib/domain/technicians";

export const dynamic = "force-dynamic";

const aed = (n: number) => "AED " + (n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
const STATUS_CLASS: Record<string, string> = {
  draft: "bg-neutral-100 text-neutral-700", completed: "bg-emerald-100 text-emerald-800", cancelled: "bg-red-100 text-red-700",
};

export default async function SurveysPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  // Release 1 item 4 — "Start survey →" from a customer profile preselects the
  // customer and opens the form, so the funnel carries forward.
  const preselect = (sp.customer ?? "").trim() || undefined;
  const showProfit = await canSeeProfit(); // DOCUMENT 9 §A
  const tenantId = await getTenantId();
  const sl = await getServiceLineId(tenantId);
  const [allSurveys, customers, technicians, facilityTypes] = await Promise.all([
    listSurveys(tenantId), listCustomers(tenantId),
    // Item 2 — the surveyor list is the whole staff list, office roles first:
    // a survey is usually booked by whoever is at a desk, not by a technician.
    listStaffForPicker(tenantId), listFacilityTypes(tenantId),
  ]);
  // Search by NUMBER first, then account number, then customer name (§3.2).
  const q = (sp.q ?? "").trim().toLowerCase();
  const surveys = q
    ? allSurveys.filter((s) =>
        (s.survey_number ?? "").toLowerCase().includes(q)
        || (s.customer_code ?? "").toLowerCase().includes(q)
        || (s.customer ?? "").toLowerCase().includes(q))
    : allSurveys;
  // Arriving from a customer profile: that customer IS the customer. The form
  // must not offer a picker that can be blanked, and must not offer to create a
  // different customer — the survey never re-asks who the customer is (§3.2).
  const carried = preselect ? customers.find((c) => c.id === preselect) ?? null : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Surveys</h1>
        <p className="mt-1 text-sm text-neutral-600">Site visit → measurements → profit preview → seed an estimate. Prices with the same engine as estimates (deterministic).</p>
      </div>

      <ListToolbar basePath="/surveys" params={sp} placeholder="Survey no., account no. or customer" showArchived={false} />

      <details className="rounded-lg border border-neutral-200 bg-white p-4" open={surveys.length === 0 || !!preselect}>
        <summary className="cursor-pointer font-medium">New survey</summary>
        <form action={createSurveyAction} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {carried ? (
            <div className="text-sm sm:col-span-2">
              <span className="text-neutral-600">Customer</span>
              <div className="mt-1 flex flex-wrap items-center gap-2 rounded border border-brand/30 bg-brand/[0.04] px-3 py-2">
                <span className="font-mono text-xs text-neutral-600">{carried.code}</span>
                <span className="font-medium text-neutral-900">{carried.trade_name ?? carried.legal_name}</span>
                <input type="hidden" name="customer_id" value={carried.id} />
                <Link href="/surveys" className="ml-auto text-xs text-brand underline">Survey a different customer</Link>
              </div>
            </div>
          ) : (
            <div className="sm:col-span-2"><CustomerPicker customers={customers} /></div>
          )}
          {!carried && <fieldset className="rounded-lg border border-dashed border-neutral-300 p-4 sm:col-span-2">
            <legend className="px-1 text-xs font-medium uppercase tracking-wide text-neutral-500">…or a new customer, without leaving the flow</legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="text-sm sm:col-span-2"><span className="text-xs font-medium text-muted">Trade name</span>
                <input name="new_customer_name" placeholder="e.g. Al Noor Restaurant" className="mt-1 w-full rounded-lg border border-line px-3 py-2" /></label>
              <label className="text-sm"><span className="text-xs font-medium text-muted">Emirate</span>
                <select name="new_customer_emirate" defaultValue="Sharjah" className="mt-1 w-full rounded-lg border border-line px-3 py-2">
                  {["Sharjah","Dubai","Ajman","Abu Dhabi","Umm Al Quwain","Ras Al Khaimah","Fujairah"].map((e) => <option key={e}>{e}</option>)}
                </select></label>

              {/* The three that are mandatory: without a person to call, a new
                  customer is a name nobody can act on. */}
              <label className="text-sm"><span className="text-xs font-medium text-muted">Contact person *</span>
                <input name="new_contact_name" className="mt-1 w-full rounded-lg border border-line px-3 py-2" /></label>
              <label className="text-sm"><span className="text-xs font-medium text-muted">Contact phone *</span>
                <input name="new_contact_phone" inputMode="tel" placeholder="05x xxx xxxx" className="mt-1 w-full rounded-lg border border-line px-3 py-2" /></label>
              <label className="text-sm"><span className="text-xs font-medium text-muted">Contact email *</span>
                <input name="new_contact_email" type="email" className="mt-1 w-full rounded-lg border border-line px-3 py-2" /></label>

              <label className="text-sm"><span className="text-xs font-medium text-muted">Customer email (accounts)</span>
                <input name="new_customer_email" type="email" className="mt-1 w-full rounded-lg border border-line px-3 py-2" /></label>
              <label className="text-sm sm:col-span-2"><span className="text-xs font-medium text-muted">Address (paste it)</span>
                <input name="new_customer_address" placeholder="paste the address as you have it" className="mt-1 w-full rounded-lg border border-line px-3 py-2" /></label>

              {/* Item 3 — the premises, not the billing bucket. */}
              <label className="text-sm sm:col-span-3"><span className="text-xs font-medium text-muted">Property type</span>
                <select name="new_facility_type_id" defaultValue="" className="mt-1 w-full rounded-lg border border-line px-3 py-2">
                  <option value="">—</option>
                  {facilityTypes.map((f: { id: string; name: string | null }) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select></label>

              {/* Item 2c / item 12 — the pin, captured HERE, because a job
                  without one is a technician outside a building they cannot find. */}
              <div className="sm:col-span-3">
                <span className="text-xs font-medium text-muted">Pin the location</span>
                <div className="mt-1"><LocationCapture resolve={resolveLocationAction} /></div>
              </div>
            </div>
            <input type="hidden" name="new_customer_type" value="B2B" />
            <p className="mt-3 text-xs text-neutral-500">Leave the customer picker empty and fill this instead. Starred fields are required; the rest of the profile is completed later.</p>
          </fieldset>}
          <label className="text-sm"><span className="text-neutral-600">Surveyor</span>
            <select name="surveyor_id" className="mt-1 w-full rounded border border-neutral-300 px-2 py-2">
              <option value="">—</option>
              {technicians.filter((t) => t.is_office).length > 0 && (
                <optgroup label="Office">
                  {technicians.filter((t) => t.is_office).map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                </optgroup>
              )}
              <optgroup label="Technicians">
                {technicians.filter((t) => !t.is_office).map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
              </optgroup>
            </select></label>
          <label className="text-sm"><span className="text-neutral-600">Survey date</span>
            <input type="date" name="survey_date" className="mt-1 w-full rounded border border-neutral-300 px-2 py-2" /></label>
          <label className="text-sm"><span className="text-neutral-600">Property type</span>
            <select name="facility_type_id" defaultValue="" className="mt-1 w-full rounded border border-neutral-300 px-2 py-2">
              <option value="">—</option>
              {facilityTypes.map((f: { id: string; name: string | null }) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            <span className="mt-1 block text-[11px] text-neutral-500">What the premises IS. The billing category (residential / commercial / industrial) follows from it.</span>
          </label>
          <label className="text-sm sm:col-span-2"><span className="text-neutral-600">Notes</span>
            <input name="notes" className="mt-1 w-full rounded border border-neutral-300 px-2 py-2" /></label>
          <div className="sm:col-span-2"><button className="w-full rounded bg-brand px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-dark sm:w-auto">Create survey</button></div>
        </form>
      </details>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-neutral-100 text-left text-neutral-600">
            <tr>
              <th className="px-3 py-2 font-medium">Survey #</th><th className="px-3 py-2 font-medium">Account no.</th>
              <th className="px-3 py-2 font-medium">Customer</th><th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">Surveyor</th><th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Lines</th>
              <th className="px-3 py-2 font-medium text-right">Revenue</th>{showProfit && <th className="px-3 py-2 font-medium text-right">Gross profit</th>}
              <th className="px-3 py-2 font-medium">Estimate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {surveys.length === 0 && <tr><td colSpan={10} className="px-3 py-6 text-center text-neutral-500">No surveys yet — create one above.</td></tr>}
            {surveys.map((s) => (
              <RowLink key={s.id} href={`/surveys/${s.id}`}>
                <td className="px-3 py-2 font-mono text-xs font-medium text-brand">{s.survey_number ?? "—"}</td>
                <td className="px-3 py-2 font-mono text-xs text-neutral-700">{s.customer_code ?? "—"}</td>
                <td className="px-3 py-2 text-neutral-700">{s.customer ?? "(no customer)"}</td>
                <td className="px-3 py-2 text-neutral-600">{s.survey_date}</td>
                <td className="px-3 py-2 text-neutral-600">{s.surveyor ?? "—"}</td>
                <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[s.status] ?? ""}`}>{s.status}</span></td>
                <td className="px-3 py-2 text-neutral-600">{s.line_count ?? 0}</td>
                <td className="px-3 py-2 text-right">{aed(s.revenue)}</td>
                {showProfit && <td className="px-3 py-2 text-right font-medium">{aed(s.gross_profit)}</td>}
                <td className="px-3 py-2">{s.estimate_id ? <Link href={`/estimates/${s.estimate_id}`} className="text-brand underline">view</Link> : "—"}</td>
              </RowLink>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
