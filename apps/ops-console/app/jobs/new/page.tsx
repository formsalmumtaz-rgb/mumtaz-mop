import { getTenantId } from "@/lib/tenant";
import { listCustomers } from "@/lib/domain/customers";
import { listJobSources, listServiceTypes, listTeams, getServiceLineId } from "@/lib/domain/reference";
import { QuickLocation } from "@/components/QuickLocation";
import { createJobAction } from "./actions";

export const dynamic = "force-dynamic";

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default async function NewJobPage({ searchParams }: { searchParams: Promise<{ created?: string; error?: string }> }) {
  const { created, error } = await searchParams;
  const tenantId = await getTenantId();
  const sl = await getServiceLineId(tenantId);   // item 4 — pickers are division-scoped
  const [customers, jobSources, serviceTypes, teams] = await Promise.all([
    listCustomers(tenantId),
    listJobSources(tenantId),
    listServiceTypes(tenantId, sl),
    listTeams(tenantId),
  ]);

  return (
    <div className="mx-auto max-w-md space-y-5">
      <h1 className="text-2xl font-semibold">Create job</h1>

      {created && (
        <div className="rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          ✓ Job created. <a href="/jobs/new" className="underline">Create another</a>.
        </div>
      )}
      {error === "customer" && (
        <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          Pick an existing customer or type a new name.
        </div>
      )}

      <form action={createJobAction} className="space-y-4">
        <div className="rounded-lg border border-neutral-200 bg-white p-4 space-y-3">
          <label className="block text-sm">
            <span className="text-neutral-600">Customer</span>
            <select name="customer_id" className="mt-1 w-full rounded border border-neutral-300 px-2 py-2">
              <option value="">— pick existing —</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.trade_name ?? c.code}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-neutral-600">…or new customer name</span>
            <input name="new_customer_name" className="mt-1 w-full rounded border border-neutral-300 px-2 py-2" placeholder="e.g. Al Noor Cafeteria" />
          </label>
        </div>

        <div className="rounded-lg border border-neutral-200 bg-white p-4 space-y-3">
          <label className="block text-sm">
            <span className="text-neutral-600">Why (job source)</span>
            <select name="job_source_id" className="mt-1 w-full rounded border border-neutral-300 px-2 py-2">
              {jobSources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-neutral-600">Service type</span>
            <select name="service_type_id" className="mt-1 w-full rounded border border-neutral-300 px-2 py-2">
              <option value="">—</option>
              {serviceTypes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-neutral-600">Assign team</span>
            <select name="team_id" className="mt-1 w-full rounded border border-neutral-300 px-2 py-2">
              <option value="">—</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-neutral-600">Date</span>
            <input name="scheduled_date" type="date" defaultValue={today()} className="mt-1 w-full rounded border border-neutral-300 px-2 py-2" />
          </label>
        </div>

        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <span className="text-sm text-neutral-600">Location</span>
          <div className="mt-2"><QuickLocation name="location" /></div>
        </div>

        <button className="w-full rounded bg-brand px-4 py-3 text-base font-medium text-white hover:bg-brand-dark">
          Create job
        </button>
      </form>
    </div>
  );
}
