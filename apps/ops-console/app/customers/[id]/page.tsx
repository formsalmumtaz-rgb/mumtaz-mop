import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantId } from "@/lib/tenant";
import { getCustomer, getCustomerActivity } from "@/lib/domain/customers";
import { listBranches } from "@/lib/domain/branches";
import { listContacts } from "@/lib/domain/contacts";
import { listContracts, getScheduleSummary } from "@/lib/domain/contracts";
import { listSurveysForCustomer } from "@/lib/domain/survey";
import { listEstimatesForCustomer } from "@/lib/domain/estimation";
import { listFrequencies, listPricingModels, listFacilityTypes } from "@/lib/domain/reference";
import { AssumedBadge } from "@/components/AssumedBadge";
import { PinPicker } from "@/components/PinPicker";
import {
  updateCustomerAction, confirmCustomerAction, createBranchAction,
  updateBranchAction, archiveBranchAction, restoreBranchAction,
  createContactAction, updateContactAction, archiveContactAction, restoreContactAction,
  createContractAction, activateContractAction,
} from "./actions";

export const dynamic = "force-dynamic";

const EMIRATES = ["Abu Dhabi", "Dubai", "Sharjah", "Ajman", "Umm Al Quwain", "Ras Al Khaimah", "Fujairah"];

export default async function CustomerDetail({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const includeArchived = sp.archived === "1";
  const tenantId = await getTenantId();
  const customer = await getCustomer(tenantId, id);
  if (!customer) notFound();

  const [branches, contacts, contracts, frequencies, pricingModels, facilityTypes, surveys, estimates, activity] = await Promise.all([
    listBranches(tenantId, id, includeArchived),
    listContacts(tenantId, id, includeArchived),
    listContracts(tenantId, id),
    listFrequencies(tenantId),
    listPricingModels(tenantId),
    listFacilityTypes(tenantId),
    listSurveysForCustomer(tenantId, id),
    listEstimatesForCustomer(tenantId, id),
    getCustomerActivity(tenantId, id),
  ]);
  const aed = (n: number) => "AED " + (n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
  const summaries = new Map(
    await Promise.all(contracts.map(async (ct) => [ct.id, await getScheduleSummary(tenantId, ct.id)] as const)),
  );

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link href="/customers" className="text-sm text-neutral-500 hover:underline">← Customers</Link>
          <h1 className="mt-1 flex items-center gap-3 text-2xl font-semibold">
            {customer.trade_name ?? "(no name)"}
            <span className="font-mono text-sm text-neutral-400">{customer.code}</span>
            {customer.is_assumed && <AssumedBadge />}
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* Release 1 item 4 — the front of the funnel: carry a customer straight
              into a survey instead of making the user find the Surveys module. */}
          <Link href={`/surveys?customer=${customer.id}`}
                className="rounded bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark">
            Start survey →
          </Link>
          <Link href={includeArchived ? `/customers/${customer.id}` : `/customers/${customer.id}?archived=1`}
                className={`rounded border px-3 py-1.5 text-sm ${includeArchived ? "border-brand bg-brand/5 text-brand" : "border-neutral-300 hover:bg-neutral-50"}`}>
            {includeArchived ? "✓ Showing archived sites & contacts" : "Show archived"}
          </Link>
        </div>
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
        <h2 className="mb-4 font-medium">Branches / sites <span className="text-neutral-400">({branches.filter((b) => !b.archived_at).length})</span></h2>
        <div className="mb-4 overflow-hidden rounded border border-neutral-200">
          <table className="w-full text-sm">
            <thead className="bg-neutral-100 text-left text-neutral-600">
              <tr><th className="px-3 py-2">Code</th><th className="px-3 py-2">Name</th><th className="px-3 py-2">Address</th><th className="px-3 py-2">Facility</th><th className="px-3 py-2">GPS pin</th><th className="px-3 py-2 text-right">Actions</th></tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {branches.length === 0 && <tr><td colSpan={6} className="px-3 py-4 text-center text-neutral-500">No sites yet.</td></tr>}
              {branches.map((b) => (
                <tr key={b.id} className={`align-top ${b.archived_at ? "opacity-60" : ""}`}>
                  <td className="px-3 py-2 font-mono text-xs text-neutral-500">{b.code}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      {b.name ?? "—"}
                      {b.archived_at && <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-xs text-neutral-600">archived</span>}
                    </div>
                    {!b.archived_at && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs text-brand">Edit</summary>
                        <form action={updateBranchAction} className="mt-3 space-y-4">
                          <input type="hidden" name="customer_id" value={customer.id} />
                          <input type="hidden" name="id" value={b.id} />
                          <div className="grid grid-cols-2 gap-4">
                            <Field label="Site name" name="name" defaultValue={b.name} />
                            <Field label="Address" name="address" defaultValue={b.address} />
                            <label className="text-sm">
                              <span className="text-neutral-600">Emirate</span>
                              <select name="emirate" defaultValue={b.emirate ?? ""} className="mt-1 w-full rounded border border-neutral-300 px-2 py-1">
                                <option value="">—</option>{EMIRATES.map((e) => <option key={e}>{e}</option>)}
                              </select>
                            </label>
                            <label className="text-sm">
                              <span className="text-neutral-600">Facility type</span>
                              <select name="facility_type_id" defaultValue={b.facility_type_id ?? ""} className="mt-1 w-full rounded border border-neutral-300 px-2 py-1">
                                <option value="">—</option>
                                {facilityTypes.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                              </select>
                            </label>
                          </div>
                          <p className="text-xs text-neutral-500">Re-pin only if the location changed — leaving the pin untouched keeps the existing GPS.</p>
                          <PinPicker name="location" initialLat={b.lat ?? undefined} initialLng={b.lng ?? undefined} />
                          <button className="rounded bg-neutral-800 px-4 py-1.5 text-sm text-white hover:bg-neutral-700">Save changes</button>
                        </form>
                      </details>
                    )}
                  </td>
                  <td className="px-3 py-2 text-neutral-600">{b.address ?? "—"}</td>
                  <td className="px-3 py-2 text-neutral-600">{b.facility_type_name ?? "—"}</td>
                  <td className="px-3 py-2">
                    {b.lat != null
                      ? <span className="font-mono text-xs text-emerald-700">{b.lat.toFixed(5)}, {b.lng!.toFixed(5)}</span>
                      : <span className="text-amber-600 text-xs">no pin</span>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {b.archived_at ? (
                      <form action={restoreBranchAction}><input type="hidden" name="customer_id" value={customer.id} /><input type="hidden" name="id" value={b.id} />
                        <button className="text-xs text-brand hover:underline">restore</button></form>
                    ) : (
                      <form action={archiveBranchAction}><input type="hidden" name="customer_id" value={customer.id} /><input type="hidden" name="id" value={b.id} />
                        <button className="text-xs text-neutral-500 hover:text-red-600">archive</button></form>
                    )}
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

      {/* Contacts */}
      <section className="rounded-lg border border-neutral-200 bg-white p-5">
        <h2 className="mb-4 font-medium">Contacts <span className="text-neutral-400">({contacts.filter((c) => !c.archived_at).length})</span></h2>
        <div className="mb-4 overflow-hidden rounded border border-neutral-200">
          <table className="w-full text-sm">
            <thead className="bg-neutral-100 text-left text-neutral-600">
              <tr><th className="px-3 py-2">Name</th><th className="px-3 py-2">Phone</th><th className="px-3 py-2">Email</th><th className="px-3 py-2">Role / site</th><th className="px-3 py-2 text-right">Actions</th></tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {contacts.length === 0 && <tr><td colSpan={5} className="px-3 py-4 text-center text-neutral-500">No contacts yet.</td></tr>}
              {contacts.map((ct) => (
                <tr key={ct.id} className={`align-top ${ct.archived_at ? "opacity-60" : ""}`}>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{ct.name ?? "—"}</span>
                      {ct.is_primary && <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand">primary</span>}
                      {ct.is_assumed && <AssumedBadge note={ct.assumed_note} />}
                      {ct.archived_at && <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-xs text-neutral-600">archived</span>}
                    </div>
                    {!ct.archived_at && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs text-brand">Edit</summary>
                        <ContactForm action={updateContactAction} customerId={customer.id} branches={branches} initial={ct} submitLabel="Save changes" />
                      </details>
                    )}
                  </td>
                  <td className="px-3 py-2 text-neutral-600">{ct.phone ?? "—"}</td>
                  <td className="px-3 py-2 text-neutral-600">{ct.email ?? "—"}</td>
                  <td className="px-3 py-2 text-neutral-600">{[ct.role, ct.branch_name].filter(Boolean).join(" · ") || "—"}</td>
                  <td className="px-3 py-2 text-right">
                    {ct.archived_at ? (
                      <form action={restoreContactAction}><input type="hidden" name="customer_id" value={customer.id} /><input type="hidden" name="id" value={ct.id} />
                        <button className="text-xs text-brand hover:underline">restore</button></form>
                    ) : (
                      <form action={archiveContactAction}><input type="hidden" name="customer_id" value={customer.id} /><input type="hidden" name="id" value={ct.id} />
                        <button className="text-xs text-neutral-500 hover:text-red-600">archive</button></form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <details className="rounded border border-neutral-200 p-4" open={contacts.length === 0}>
          <summary className="cursor-pointer text-sm font-medium">Add a contact</summary>
          <ContactForm action={createContactAction} customerId={customer.id} branches={branches} submitLabel="Add contact" />
        </details>
      </section>

      {/* Surveys */}
      <section className="rounded-lg border border-neutral-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-medium">Surveys <span className="text-neutral-400">({surveys.length})</span></h2>
          <Link href="/surveys" className="text-sm text-brand underline">+ New survey</Link>
        </div>
        <div className="space-y-2">
          {surveys.length === 0 && <p className="text-sm text-neutral-500">No surveys yet.</p>}
          {surveys.map((s) => (
            <Link key={s.id} href={`/surveys/${s.id}`} className="flex items-center justify-between rounded border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50">
              <span>{s.survey_date} · <span className="text-neutral-500">{s.surveyor ?? "—"}</span> · {s.line_count ?? 0} lines</span>
              <span className="flex items-center gap-3">
                <span className="text-neutral-600">{aed(s.revenue)}</span>
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs">{s.status}</span>
                {s.estimate_id && <span className="text-xs text-emerald-700">→ estimate</span>}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Estimates */}
      <section className="rounded-lg border border-neutral-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-medium">Estimates <span className="text-neutral-400">({estimates.length})</span></h2>
          <Link href="/estimates" className="text-sm text-brand underline">+ New estimate</Link>
        </div>
        <div className="space-y-2">
          {estimates.length === 0 && <p className="text-sm text-neutral-500">No estimates yet.</p>}
          {estimates.map((e) => {
            const margin = e.revenue > 0 ? ((e.gross_profit / e.revenue) * 100).toFixed(0) + "%" : "—";
            return (
              <Link key={e.id} href={`/estimates/${e.id}`} className="flex items-center justify-between rounded border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50">
                <span>{e.line_count ?? 0} lines · margin {margin}</span>
                <span className="flex items-center gap-3">
                  <span className="text-neutral-600">{aed(e.revenue)}</span>
                  <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs">{e.status}</span>
                  {e.contract_id && <span className="text-xs text-emerald-700">→ contract</span>}
                </span>
              </Link>
            );
          })}
        </div>
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
                  <Link href={`/contracts/${ct.id}`} className="font-medium text-brand underline">{ct.contract_number ?? "(no number)"}</Link>
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

      {/* Money — Release 1 item 3: the profile previously showed no financials. */}
      <section className="rounded-lg border border-neutral-200 bg-white p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium">
            Money
            {activity.outstanding > 0 && (
              <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-sm font-semibold text-red-700">
                {aed(activity.outstanding)} outstanding
              </span>
            )}
          </h2>
          <Link href={`/receipts/new?customer=${customer.id}`}
                className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">
            Record payment →
          </Link>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-medium text-neutral-600">Invoices</h3>
            {activity.invoices.length === 0 ? <p className="text-sm text-neutral-500">No invoices.</p> : (
              <table className="w-full text-sm">
                <tbody className="divide-y divide-neutral-100">
                  {activity.invoices.map((i) => (
                    <tr key={i.id}>
                      <td className="py-1.5 pr-2"><Link href={`/invoices/${i.id}`} className="font-mono text-xs text-brand underline">{i.invoice_number ?? "(draft)"}</Link></td>
                      <td className="py-1.5 pr-2 text-neutral-500">{i.issue_date ?? "—"}</td>
                      <td className="py-1.5 pr-2 text-right">{aed(i.total)}</td>
                      <td className="py-1.5 text-right">
                        {i.status !== "issued" ? <span className="text-xs text-neutral-500">{i.status}</span>
                          : i.open_amount <= 0 ? <span className="text-xs font-medium text-emerald-700">paid</span>
                          : <span className="text-xs font-medium text-red-600">{aed(i.open_amount)} open</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div>
            <h3 className="mb-2 text-sm font-medium text-neutral-600">Payments received</h3>
            {activity.receipts.length === 0 ? <p className="text-sm text-neutral-500">No receipts.</p> : (
              <table className="w-full text-sm">
                <tbody className="divide-y divide-neutral-100">
                  {activity.receipts.map((r) => (
                    <tr key={r.id} className={r.reversed ? "opacity-50" : ""}>
                      <td className="py-1.5 pr-2"><Link href={`/receipts/${r.id}`} className="font-mono text-xs text-brand underline">{r.receipt_number ?? "—"}</Link></td>
                      <td className="py-1.5 pr-2 text-neutral-500">{r.receipt_date ?? "—"}</td>
                      <td className="py-1.5 pr-2 text-neutral-500">{r.method ?? "—"}</td>
                      <td className="py-1.5 text-right">{aed(r.amount)}{r.reversed && <span className="ml-1 text-xs text-red-600">reversed</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </section>

      {/* Visit history — every job, with its service report when one exists. */}
      <section className="rounded-lg border border-neutral-200 bg-white p-5">
        <h2 className="mb-4 font-medium">Visit history <span className="text-neutral-400">({activity.visits.length})</span></h2>
        {activity.visits.length === 0 ? <p className="text-sm text-neutral-500">No jobs yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="text-left text-neutral-500">
                <tr><th className="py-1 pr-3 font-medium">Date</th><th className="py-1 pr-3 font-medium">Site</th>
                    <th className="py-1 pr-3 font-medium">Service</th><th className="py-1 pr-3 font-medium">Status</th>
                    <th className="py-1 font-medium">Service report</th></tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {activity.visits.map((v) => (
                  <tr key={v.id}>
                    <td className="py-1.5 pr-3"><Link href={`/jobs/${v.id}`} className="text-brand underline">{v.scheduled_date ?? "(unscheduled)"}</Link></td>
                    <td className="py-1.5 pr-3 text-neutral-600">{v.branch ?? "—"}</td>
                    <td className="py-1.5 pr-3 text-neutral-600">{v.service_type ?? "—"}</td>
                    <td className="py-1.5 pr-3"><StatusPill status={v.status} /></td>
                    <td className="py-1.5">
                      {v.report_id
                        ? <Link href={`/service-reports/${v.report_id}`} className="text-brand underline">{v.report_number ?? "report"}{v.report_approved && <span className="ml-1 text-xs text-neutral-500">({v.report_approved})</span>}</Link>
                        : <span className="text-neutral-400">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function ContactForm({ action, customerId, branches, initial, submitLabel }: {
  action: (fd: FormData) => Promise<void>;
  customerId: string;
  branches: { id: string; name: string | null; archived_at?: string | null }[];
  initial?: { id: string; name: string | null; phone: string | null; email: string | null; role: string | null; is_primary: boolean; branch_id: string | null };
  submitLabel: string;
}) {
  return (
    <form action={action} className="mt-3 space-y-4">
      <input type="hidden" name="customer_id" value={customerId} />
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <div className="grid grid-cols-2 gap-4">
        <Field label="Name" name="name" defaultValue={initial?.name} />
        <Field label="Role / title" name="role" defaultValue={initial?.role} />
        <Field label="Phone" name="phone" defaultValue={initial?.phone} />
        <Field label="Email" name="email" type="email" defaultValue={initial?.email} />
        <label className="text-sm">
          <span className="text-neutral-600">Site (optional)</span>
          <select name="branch_id" defaultValue={initial?.branch_id ?? ""} className="mt-1 w-full rounded border border-neutral-300 px-2 py-1">
            <option value="">Customer level</option>
            {branches.filter((b) => !b.archived_at).map((b) => <option key={b.id} value={b.id}>{b.name ?? "(unnamed site)"}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 self-end text-sm">
          <input type="checkbox" name="is_primary" defaultChecked={initial?.is_primary ?? false} className="rounded border-neutral-300" />
          <span className="text-neutral-600">Primary contact</span>
        </label>
      </div>
      <button className="rounded bg-brand px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-dark">{submitLabel}</button>
    </form>
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
