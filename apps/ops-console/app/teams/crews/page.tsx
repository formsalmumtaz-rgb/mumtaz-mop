import { getTenantId } from "@/lib/tenant";
import { getCrews } from "@/lib/domain/crews";
import { PageHeader } from "@/components/ui";
import { CrewBoard } from "./CrewBoard";
import { assignToCrewAction } from "./actions";

// §3.4 — the team assignment screen. Drag a technician or a van onto a crew.
// Assignments are date-effective, so they simply stay in force day after day
// until someone moves them; there is no daily re-rostering chore and no day where
// the crew is undefined. The technician app reads the same open assignment, so a
// change here is what that technician sees on their next sign-in.
export const dynamic = "force-dynamic";

export default async function CrewsPage() {
  const tenantId = await getTenantId();
  const { crews, unassignedTechs, unassignedVehicles } = await getCrews(tenantId);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Crews"
        description="Drag a technician or a van onto a crew. It stays that way until you change it — no daily re-rostering — and the technician app picks it up on their next sign-in."
      />
      {crews.length === 0 ? (
        <div className="rounded-lg border border-neutral-200 bg-white p-8 text-center text-neutral-500">
          No teams yet. Create one on the <a href="/teams" className="text-brand underline">Teams</a> page first.
        </div>
      ) : (
        <>
          <CrewBoard crews={crews} unassignedTechs={unassignedTechs}
                     unassignedVehicles={unassignedVehicles} assign={assignToCrewAction} />
          <p className="text-xs text-neutral-500">
            Moving someone closes their old assignment today and opens a new one — the record of who was on
            which crew on a given day survives, because service reports and attendance are read against it.
            On a tablet, use the dropdown under each card instead of dragging.
          </p>
        </>
      )}
    </div>
  );
}
