import type { PoolClient } from "pg";
import type { Consumer, ParsedEvent } from "./outbox";
import { resolveStrategy, postConsumptionValuation } from "./inventory";

// DEFECT 2B — the technician's recorded material use, landed and costed.
//
// Two things happen and they are deliberately separate:
//   1. the RECORD — expected and actual, both kept, append-only. This always
//      lands, even when the van holds no stock lot for the product. Losing what
//      the technician told us because the warehouse paperwork is behind would be
//      the worst possible trade.
//   2. the STOCK — a consumption movement off the van, FEFO, valued. This is
//      best-effort: no van, no lot, no cost => the record still stands and the
//      variance report still shows it.
//
// Idempotent twice over: the consumer claim (exactly-once) and the per-line
// client_uuid unique index, so a replayed event inserts nothing.
interface MaterialLine {
  client_uuid: string;
  item_id: string;
  recipe_version_id?: string | null;
  expected_qty?: number | null;
  actual_qty: number;
  mixes?: number | null;
  water_litres?: number | null;
  substituted_for_item_id?: string | null;
  over_expected_ack?: boolean | null;
  note?: string | null;
}

const materialsRecorder: Consumer = {
  name: "materials-recorder",
  eventTypes: ["job.materials_recorded"],
  handle: async (c: PoolClient, ev: ParsedEvent) => {
    if (ev.envelope.event_type !== "job.materials_recorded") return;
    const p = ev.payload as {
      job_id?: string; device_time?: string | null;
      lines?: MaterialLine[];
      equipment?: { client_uuid: string; equipment_code: string; note?: string | null }[] | null;
    };
    const jobId = p.job_id;
    if (!jobId) return;

    const job = (await c.query(
      `select tenant_id, service_line_id from jobs where id = $1`, [jobId],
    )).rows[0];
    if (!job) return;

    const actorId = ev.envelope.actor_id ?? null;
    const techId = (await c.query(
      `select technician_id from job_assignments where job_id = $1 limit 1`, [jobId],
    )).rows[0]?.technician_id ?? null;

    // the van, resolved once — the same location the pre-flight declaration counts
    const vanId = techId
      ? (await c.query(
          `select id from stock_locations
            where tenant_id = $1 and location_type = 'van' and technician_id = $2 and is_active
            order by created_at limit 1`, [job.tenant_id, techId])).rows[0]?.id ?? null
      : null;
    const strategy = vanId ? await resolveStrategy(c, job.tenant_id, job.service_line_id) : null;

    for (const l of p.lines ?? []) {
      if (!l?.item_id || !(Number(l.actual_qty) >= 0)) continue;

      const ins = await c.query(
        `insert into job_material_usage
           (tenant_id, job_id, item_id, recipe_version_id, expected_qty, actual_qty, unit_id,
            mixes, water_litres, substituted_for_item_id, over_expected_ack, note,
            client_uuid, device_time, created_by)
         values ($1,$2,$3,$4,$5,$6,(select base_unit_id from items where id=$3),
                 $7,$8,$9,$10,$11,$12,$13,$14)
         on conflict (client_uuid) do nothing
         returning id`,
        [job.tenant_id, jobId, l.item_id, l.recipe_version_id ?? null,
         l.expected_qty ?? null, Number(l.actual_qty),
         l.mixes ?? null, l.water_litres ?? null, l.substituted_for_item_id ?? null,
         l.over_expected_ack === true, l.note ?? null,
         l.client_uuid, p.device_time ?? null, actorId],
      );
      // Only a NEW record moves stock. A replay must not deduct twice.
      if (ins.rowCount !== 1 || Number(l.actual_qty) <= 0) continue;

      const batchId = vanId
        ? (await c.query(`select fn_alloc_batch($1,$2,$3,$4) as b`,
            [job.tenant_id, l.item_id, vanId, strategy])).rows[0]?.b ?? null
        : null;

      const mv = await c.query(
        `insert into stock_movements
           (tenant_id, service_line_id, item_id, batch_id, from_location_id, movement_type,
            quantity, unit_id, job_id, technician_id, client_uuid, snapshot)
         values ($1,$2,$3,$4,$5,'consumption',$6,(select base_unit_id from items where id=$3),
                 $7,$8,$9,$10)
         on conflict (tenant_id, client_uuid) do nothing
         returning id`,
        [job.tenant_id, job.service_line_id, l.item_id, batchId, vanId,
         Number(l.actual_qty), jobId, techId, l.client_uuid,
         JSON.stringify({ source: "job.materials_recorded", expected_qty: l.expected_qty ?? null,
                          actual_qty: Number(l.actual_qty),
                          substituted_for_item_id: l.substituted_for_item_id ?? null })],
      );
      if (mv.rowCount === 1 && batchId) {
        await postConsumptionValuation(c, {
          tenantId: job.tenant_id, serviceLineId: job.service_line_id, movementId: mv.rows[0].id,
        });
      }
    }

    for (const e of p.equipment ?? []) {
      if (!e?.equipment_code) continue;
      await c.query(
        `insert into job_equipment_usage
           (tenant_id, job_id, equipment_code, note, client_uuid, device_time, created_by)
         values ($1,$2,$3,$4,$5,$6,$7)
         on conflict (client_uuid) do nothing`,
        [job.tenant_id, jobId, e.equipment_code, e.note ?? null, e.client_uuid,
         p.device_time ?? null, actorId],
      );
    }
  },
};

export const materialConsumers: Consumer[] = [materialsRecorder];
