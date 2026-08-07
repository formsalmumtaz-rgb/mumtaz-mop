import Link from "next/link";
import { getTenantId } from "@/lib/tenant";
import { listTechnicians } from "@/lib/domain/technicians";
import { AssumedBadge } from "@/components/AssumedBadge";
import { confirmAction, updateNameAction, archiveTechnicianAction, restoreTechnicianAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function TechniciansPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const includeArchived = sp.archived === "1";
  const tenantId = await getTenantId();
  const techs = await listTechnicians(tenantId, includeArchived);
  const assumed = techs.filter((t) => t.is_assumed).length;

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Technicians</h1>
          <p className="text-neutral-600 mt-1 text-sm">
            {techs.length} total · {assumed > 0 ? `${assumed} placeholder names to confirm` : "all confirmed"}
          </p>
        </div>
        <Link href={includeArchived ? "/technicians" : "/technicians?archived=1"}
              className={`rounded border px-3 py-1.5 text-sm ${includeArchived ? "border-brand bg-brand/5 text-brand" : "border-neutral-300 hover:bg-neutral-50"}`}>
          {includeArchived ? "✓ Including archived" : "Include archived"}
        </Link>
      </div>

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-100 text-left text-neutral-600">
            <tr>
              <th className="px-4 py-2 font-medium">Code</th>
              <th className="px-4 py-2 font-medium">Full name</th>
              <th className="px-4 py-2 font-medium">Phone</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {techs.map((t) => (
              <tr key={t.id} className={`align-middle ${t.archived_at ? "opacity-60" : ""}`}>
                <td className="px-4 py-2 font-mono text-xs text-neutral-500">{t.code}</td>
                <td className="px-4 py-2">
                  <form action={updateNameAction} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={t.id} />
                    <input
                      name="full_name"
                      defaultValue={t.full_name ?? ""}
                      className="w-56 rounded border border-neutral-300 px-2 py-1"
                      placeholder="Enter real name"
                    />
                    <button className="rounded bg-neutral-800 px-2 py-1 text-xs text-white hover:bg-neutral-700">
                      Save
                    </button>
                  </form>
                </td>
                <td className="px-4 py-2 text-neutral-600">{t.phone ?? "—"}</td>
                <td className="px-4 py-2">
                  {t.is_assumed ? (
                    <AssumedBadge note={t.assumed_note} />
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 ring-1 ring-emerald-300">
                      ✓ confirmed
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="flex items-center justify-end gap-2">
                    {t.is_assumed && (
                      <form action={confirmAction} className="inline">
                        <input type="hidden" name="id" value={t.id} />
                        <button className="rounded border border-amber-400 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100">
                          I confirm this value
                        </button>
                      </form>
                    )}
                    {t.archived_at ? (
                      <form action={restoreTechnicianAction}><input type="hidden" name="id" value={t.id} />
                        <button className="text-xs text-brand hover:underline">restore</button></form>
                    ) : (
                      <form action={archiveTechnicianAction}><input type="hidden" name="id" value={t.id} />
                        <button className="text-xs text-neutral-500 hover:text-red-600">archive</button></form>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-neutral-500">
        Editing a name or confirming clears the ASSUMED flag and writes an entry to the audit log.
      </p>
    </div>
  );
}
