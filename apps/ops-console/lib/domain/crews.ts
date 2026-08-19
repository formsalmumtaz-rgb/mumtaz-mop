import "server-only";
import type { PoolClient } from "pg";
import { scopedRead } from "../rls";
import { withTenantTx } from "./tx";
import { audit } from "./audit";

// §3.4 — who and what is on each team today.
//
// Both people and vehicles are DATE-EFFECTIVE: an open row (effective_to null) is
// in force until someone changes it. That is what "persists day-to-day
// automatically" means — there is no nightly job rolling assignments forward, and
// no day where the crew is undefined because a job did not run.
//
// Moving someone is a CLOSE + OPEN, never an update in place: the record of who
// was on which crew on a given day has to survive, because it is what a service
// report and an attendance line are read against later.
export interface CrewMember { id: string; full_name: string; phone: string | null; is_team_lead: boolean; since: string }
export interface CrewVehicle { id: string; name: string | null; code: string | null; plate: string | null; since: string }
export interface Crew {
  team_id: string; team_name: string; team_code: string | null;
  members: CrewMember[]; vehicles: CrewVehicle[];
}

export async function getCrews(tenantId: string): Promise<{
  crews: Crew[]; unassignedTechs: CrewMember[]; unassignedVehicles: CrewVehicle[];
}> {
  const [{ rows: teams }, { rows: techs }, { rows: vehicles }] = await Promise.all([
    scopedRead(tenantId, `select id, name, code from teams where tenant_id=$1 and is_active order by name`, [tenantId]),
    scopedRead(tenantId,
      `select t.id, t.full_name, t.phone, t.is_team_lead,
              a.team_id, a.effective_from::text as since
         from technicians t
         left join team_assignments a
           on a.technician_id = t.id and a.tenant_id = t.tenant_id and a.effective_to is null
        where t.tenant_id=$1 and t.is_active and t.archived_at is null
        order by t.is_team_lead desc, t.full_name`, [tenantId]),
    scopedRead(tenantId,
      `select v.id, v.name, v.code, v.registration_plate as plate,
              tv.team_id, tv.effective_from::text as since
         from vehicles v
         left join team_vehicles tv
           on tv.vehicle_id = v.id and tv.tenant_id = v.tenant_id and tv.effective_to is null
        where v.tenant_id=$1 and v.is_active and v.archived_at is null
        order by v.name nulls last, v.code`, [tenantId]),
  ]);

  const crews: Crew[] = (teams as { id: string; name: string; code: string | null }[]).map((t) => ({
    team_id: t.id, team_name: t.name, team_code: t.code,
    members: (techs as any[]).filter((x) => x.team_id === t.id).map(toMember),
    vehicles: (vehicles as any[]).filter((x) => x.team_id === t.id).map(toVehicle),
  }));
  return {
    crews,
    unassignedTechs: (techs as any[]).filter((x) => !x.team_id).map(toMember),
    unassignedVehicles: (vehicles as any[]).filter((x) => !x.team_id).map(toVehicle),
  };
}
const toMember = (r: any): CrewMember =>
  ({ id: r.id, full_name: r.full_name, phone: r.phone, is_team_lead: r.is_team_lead, since: r.since });
const toVehicle = (r: any): CrewVehicle =>
  ({ id: r.id, name: r.name, code: r.code, plate: r.plate, since: r.since });

// Move a technician onto a team, or off every team when teamId is null.
export async function assignTechnician(
  tenantId: string, serviceLineId: string, technicianId: string, teamId: string | null,
): Promise<void> {
  await withTenantTx(tenantId, async (c: PoolClient) => {
    const { rows: cur } = await c.query(
      `select team_id from team_assignments
        where tenant_id=$1 and technician_id=$2 and effective_to is null for update`, [tenantId, technicianId]);
    if (cur[0]?.team_id === teamId) return; // already there — nothing to record
    // Close today, so history says "on team X up to today", not "never was".
    await c.query(
      `update team_assignments set effective_to = current_date
        where tenant_id=$1 and technician_id=$2 and effective_to is null`, [tenantId, technicianId]);
    if (teamId) {
      await c.query(
        `insert into team_assignments (tenant_id, service_line_id, team_id, technician_id, role, effective_from)
         values ($1,$2,$3,$4,'technician',current_date)`, [tenantId, serviceLineId, teamId, technicianId]);
    }
    await audit(c, tenantId, {
      table: "team_assignments", rowId: technicianId, action: "update",
      oldValue: { team_id: cur[0]?.team_id ?? null }, newValue: { team_id: teamId },
      note: teamId ? "technician moved onto a team (office)" : "technician taken off every team (office)",
    });
  });
}

// Same for a vehicle.
export async function assignVehicle(
  tenantId: string, serviceLineId: string, vehicleId: string, teamId: string | null,
): Promise<void> {
  await withTenantTx(tenantId, async (c: PoolClient) => {
    const { rows: cur } = await c.query(
      `select team_id from team_vehicles
        where tenant_id=$1 and vehicle_id=$2 and effective_to is null for update`, [tenantId, vehicleId]);
    if (cur[0]?.team_id === teamId) return;
    await c.query(
      `update team_vehicles set effective_to = current_date
        where tenant_id=$1 and vehicle_id=$2 and effective_to is null`, [tenantId, vehicleId]);
    if (teamId) {
      await c.query(
        `insert into team_vehicles (tenant_id, service_line_id, team_id, vehicle_id, effective_from)
         values ($1,$2,$3,$4,current_date)`, [tenantId, serviceLineId, teamId, vehicleId]);
    }
    await audit(c, tenantId, {
      table: "team_vehicles", rowId: vehicleId, action: "update",
      oldValue: { team_id: cur[0]?.team_id ?? null }, newValue: { team_id: teamId },
      note: teamId ? "vehicle moved onto a team (office)" : "vehicle taken off every team (office)",
    });
  });
}
