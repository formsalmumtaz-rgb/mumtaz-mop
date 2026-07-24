import Link from "next/link";
import { getTenantId } from "@/lib/tenant";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";

// Count ASSUMED rows across the key master-data tables so the owner sees the
// size of the "needs confirmation" backlog at a glance.
async function assumedCounts(tenantId: string) {
  const tables = ["technicians", "teams", "service_types", "pest_types", "treatment_methods", "frequencies", "facility_types", "pricing_models"];
  const parts = tables.map((t) => `select '${t}' as tbl, count(*) filter (where is_assumed)::int as n from ${t} where tenant_id = $1`);
  const { rows } = await pool.query(parts.join("\nunion all\n"), [tenantId]);
  return rows as { tbl: string; n: number }[];
}

export default async function Home() {
  const tenantId = await getTenantId();
  const counts = await assumedCounts(tenantId);
  const totalAssumed = counts.reduce((s, r) => s + r.n, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Master data</h1>
        <p className="text-neutral-600 mt-1">
          Maintain the platform&apos;s reference data. Values seeded as{" "}
          <span className="font-medium text-amber-700">ASSUMED</span> need your confirmation.
        </p>
      </div>

      <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <strong>{totalAssumed}</strong> assumed values await confirmation across master data.
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {counts.map((c) => (
          <div key={c.tbl} className="rounded-lg border border-neutral-200 bg-white px-4 py-3">
            <div className="text-sm text-neutral-500 capitalize">{c.tbl.replace(/_/g, " ")}</div>
            <div className="mt-1 text-lg font-semibold">
              {c.n > 0 ? <span className="text-amber-700">{c.n} assumed</span> : <span className="text-emerald-700">clear</span>}
            </div>
          </div>
        ))}
      </div>

      <p className="text-sm text-neutral-500">
        Start with{" "}
        <Link href="/technicians" className="text-brand underline">
          Technicians
        </Link>{" "}
        — confirm the 10 placeholder names.
      </p>
    </div>
  );
}
