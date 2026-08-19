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
    `select id, check_date::text, present, vehicle_id, odometer_km, fuel_litres, fuel_amount, fuel_band, ppe, equipment, attendance, notes, time_suspect
       from preflight_checks where tenant_id = $1 and technician_id = $2 and check_date = current_date`,
    [tenantId, technicianId]);
  return rows[0] ?? null;
}

export interface PreflightInput {
  technicianId: string; serviceLineId: string | null; check_date?: string | null; present?: boolean;
  vehicle_id?: string | null; odometer_km?: number | null; fuel_litres?: number | null; fuel_amount?: number | null;
  ppe?: Record<string, boolean>; equipment?: Record<string, boolean>; notes?: string | null;
  // Per-member attendance with uniform/hygiene flags (mig 088) and the tank
  // fuel band 0/25/50/75/100 — bands, never free entry.
  attendance?: Record<string, { present: boolean; uniform_ok: boolean; hygiene_ok: boolean }>;
  fuel_band?: number | null;
  client_uuid?: string | null; device_time?: string | null; time_suspect?: boolean;
  // Declared van stock (DOCUMENT 8 Part E, mig 072): what the team physically
  // holds, in the item's base unit. Recorded and compared against the issued
  // ledger (preflight_stock_variance) — never blocks, never rejects a figure.
  stock?: { item_id: string; qty_base: number; note?: string | null }[];
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
          fuel_litres, fuel_amount, fuel_band, ppe, equipment, attendance, notes, client_uuid, device_time, time_suspect, created_by)
       values ($1,$2,$3,coalesce($4::date,current_date),$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       on conflict (tenant_id, technician_id, check_date) do update set
         present=excluded.present, vehicle_id=excluded.vehicle_id, odometer_km=excluded.odometer_km,
         fuel_litres=excluded.fuel_litres, fuel_amount=excluded.fuel_amount, fuel_band=excluded.fuel_band,
         ppe=excluded.ppe, equipment=excluded.equipment, attendance=excluded.attendance,
         notes=excluded.notes, device_time=excluded.device_time,
         time_suspect=excluded.time_suspect, updated_by=excluded.created_by
       returning id`,
      [tenantId, p.serviceLineId, p.technicianId, p.check_date ?? null, p.present ?? true,
       p.vehicle_id ?? null, p.odometer_km ?? null, p.fuel_litres ?? null, p.fuel_amount ?? null,
       p.fuel_band ?? null,
       JSON.stringify(p.ppe ?? {}), JSON.stringify(p.equipment ?? {}), JSON.stringify(p.attendance ?? {}),
       p.notes ?? null,
       p.client_uuid ?? null, p.device_time ?? null, p.time_suspect ?? false, actorId],
    );
    const preflightId = rows[0]?.id as string | undefined;

    // Post fuel to the ledger once per pre-flight. Guards match the table's CHECKs
    // (litres > 0, amount >= 0) and NOT NULL vehicle_id.
    // Declared stock (upsert per item; same-day corrections replace the figure).
    if (preflightId && p.stock) {
      for (const s of p.stock) {
        if (!s.item_id || !(s.qty_base >= 0)) continue; // never reject — just skip garbage
        await c.query(
          `insert into preflight_stock_declarations
             (tenant_id, preflight_check_id, item_id, declared_qty_base, note, created_by)
           values ($1,$2,$3,$4,$5,$6)
           on conflict (preflight_check_id, item_id)
             do update set declared_qty_base = excluded.declared_qty_base, note = excluded.note`,
          [tenantId, preflightId, s.item_id, s.qty_base, s.note ?? null, actorId]);
      }
    }

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

// ── §3.7 — the technician's OWN day ─────────────────────────────────────────
// Separate from the pre-flight above, which only a team lead may submit. This is
// the individual's record of themselves and they write it themselves.
export interface TechnicianDayInput {
  technicianId: string;
  work_date?: string | null;
  present?: boolean;
  uniform?: Record<string, boolean> | null;
  time_in?: string | null;
  time_out?: string | null;
  client_uuid?: string | null;
  device_time?: string | null;
}

export async function upsertTechnicianDay(
  tenantId: string, actorId: string, p: TechnicianDayInput,
): Promise<{ time_in: string | null; time_out: string | null; hours: string | null }> {
  return withRequest({ tenantId, actorId }, async (c) => {
    const { rows } = await c.query(
      `insert into technician_day
         (tenant_id, technician_id, work_date, present, uniform, time_in, time_out, client_uuid, device_time)
       values ($1,$2,coalesce($3::date,current_date),$4,$5::jsonb,$6,$7,$8::uuid,$9)
       on conflict (tenant_id, technician_id, work_date) do update set
         present  = excluded.present,
         uniform  = coalesce(excluded.uniform, technician_day.uniform),
         -- TIME IN is set ONCE. Re-opening the app at 09:30 must not move a 07:05
         -- start, or an hour and a half of pay quietly disappears.
         time_in  = coalesce(technician_day.time_in, excluded.time_in),
         time_out = coalesce(excluded.time_out, technician_day.time_out),
         device_time = coalesce(excluded.device_time, technician_day.device_time),
         updated_at = now()
       returning time_in::text, time_out::text`,
      [tenantId, p.technicianId, p.work_date ?? null, p.present ?? true,
       p.uniform ? JSON.stringify(p.uniform) : null, p.time_in ?? null, p.time_out ?? null,
       p.client_uuid ?? null, p.device_time ?? null]);
    const { rows: h } = await c.query(
      `select hours::text from technician_working_hours
        where technician_id = $1 and check_date = coalesce($2::date, current_date)`,
      [p.technicianId, p.work_date ?? null]);
    return { time_in: rows[0]?.time_in ?? null, time_out: rows[0]?.time_out ?? null, hours: h[0]?.hours ?? null };
  });
}
