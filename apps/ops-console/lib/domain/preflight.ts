import "server-only";
import { scopedRead, withRequest } from "../rls";

export interface ChecklistItem { kind: "ppe" | "equipment"; code: string; label: string; sort_order: number }

export async function getPreflightChecklist(tenantId: string): Promise<ChecklistItem[]> {
  const { rows } = await scopedRead(tenantId,
    `select kind, code, label, sort_order from preflight_checklist_items
      where tenant_id = $1 and is_active order by kind, sort_order`, [tenantId]);
  return rows as ChecklistItem[];
}

export async function getTodayPreflight(tenantId: string, technicianId: string): Promise<Record<string, unknown> | null> {
  const { rows } = await scopedRead(tenantId,
    `select id, check_date::text, present, vehicle_id, odometer_km, fuel_litres, fuel_amount, ppe, equipment, notes, time_suspect
       from preflight_checks where tenant_id = $1 and technician_id = $2 and check_date = current_date`,
    [tenantId, technicianId]);
  return rows[0] ?? null;
}

export interface PreflightInput {
  technicianId: string; serviceLineId: string | null; check_date?: string | null; present?: boolean;
  vehicle_id?: string | null; odometer_km?: number | null; fuel_litres?: number | null; fuel_amount?: number | null;
  ppe?: Record<string, boolean>; equipment?: Record<string, boolean>; notes?: string | null;
  client_uuid?: string | null; device_time?: string | null; time_suspect?: boolean;
}

// Idempotent by (tenant, technician, day): one record per shift, correctable the
// same day. Odometer/fuel are captured here AND posted to the fuel ledger
// (vehicle_fuel_purchases) exactly once per pre-flight (BLOCKED A7, mig 063):
// when a vehicle + positive fuel litres are present, a single fuel purchase is
// inserted keyed by preflight_check_id (ON CONFLICT DO NOTHING keeps the ledger
// append-only and re-sync-safe). A later same-day fuel *correction* updates the
// pre-flight but does not rewrite the posted purchase (append-only) — a correction
// would be a manual reversing fuel entry.
export async function upsertPreflight(tenantId: string, actorId: string, p: PreflightInput): Promise<void> {
  await withRequest({ tenantId, actorId }, async (c) => {
    const { rows } = await c.query(
      `insert into preflight_checks
         (tenant_id, service_line_id, technician_id, check_date, present, vehicle_id, odometer_km,
          fuel_litres, fuel_amount, ppe, equipment, notes, client_uuid, device_time, time_suspect, created_by)
       values ($1,$2,$3,coalesce($4::date,current_date),$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       on conflict (tenant_id, technician_id, check_date) do update set
         present=excluded.present, vehicle_id=excluded.vehicle_id, odometer_km=excluded.odometer_km,
         fuel_litres=excluded.fuel_litres, fuel_amount=excluded.fuel_amount, ppe=excluded.ppe,
         equipment=excluded.equipment, notes=excluded.notes, device_time=excluded.device_time,
         time_suspect=excluded.time_suspect, updated_by=excluded.created_by
       returning id`,
      [tenantId, p.serviceLineId, p.technicianId, p.check_date ?? null, p.present ?? true,
       p.vehicle_id ?? null, p.odometer_km ?? null, p.fuel_litres ?? null, p.fuel_amount ?? null,
       JSON.stringify(p.ppe ?? {}), JSON.stringify(p.equipment ?? {}), p.notes ?? null,
       p.client_uuid ?? null, p.device_time ?? null, p.time_suspect ?? false, actorId],
    );
    const preflightId = rows[0]?.id as string | undefined;

    // Post fuel to the ledger once per pre-flight. Guards match the table's CHECKs
    // (litres > 0, amount >= 0) and NOT NULL vehicle_id.
    const litres = p.fuel_litres ?? null;
    const amount = p.fuel_amount ?? null;
    if (preflightId && p.vehicle_id && litres != null && litres > 0 && amount != null && amount >= 0) {
      await c.query(
        `insert into vehicle_fuel_purchases
           (tenant_id, service_line_id, vehicle_id, purchase_date, litres, amount, odometer_km,
            preflight_check_id, client_uuid, source, note, created_by)
         values ($1,$2,$3,coalesce($4::date,current_date),$5,$6,$7,$8,$9,'preflight','Pre-flight fuel (auto)',$10)
         on conflict (preflight_check_id) where preflight_check_id is not null do nothing`,
        [tenantId, p.serviceLineId, p.vehicle_id, p.check_date ?? null, litres, amount,
         p.odometer_km ?? null, preflightId, p.client_uuid ?? null, actorId],
      );
    }
  });
}
