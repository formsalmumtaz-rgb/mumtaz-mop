import "server-only";
import { scopedRead } from "../rls";
import { withTenantTx } from "./tx";
import { audit } from "./audit";

// Category Engine (mig 044). Configurable, per-service categories carrying the
// deterministic operational assumptions (crew, duration, buffer, material cost,
// pricing recommendation) that feed estimation. Reference data: archive =
// deactivate (is_active). The derived numbers are snapshotted onto estimate/
// survey lines at line creation, so editing a category never rewrites history.
export const PROPERTY_TYPES = ["residential", "commercial", "industrial"] as const;

export interface ServiceCategory {
  id: string;
  code: string | null;
  name: string;
  property_type: string | null;
  crew_size: number;
  est_duration_hours: string | null;
  buffer_minutes: number;
  est_material_cost: string | null;
  default_pricing_model_id: string | null;
  default_pricing_model_name: string | null;
  default_measure: string | null;
  default_unit_price: string | null;
  recommended_price: string | null;
  notes: string | null;
  is_active: boolean;
  is_assumed: boolean;
  assumed_note: string | null;
}

export interface CategoryInput {
  code?: string;
  name?: string;
  property_type?: string;
  crew_size?: string;
  est_duration_hours?: string;
  buffer_minutes?: string;
  est_material_cost?: string;
  default_pricing_model_id?: string;
  default_measure?: string;
  default_unit_price?: string;
  recommended_price?: string;
  notes?: string;
}

const clean = (v?: string) => { const t = (v ?? "").trim(); return t === "" ? null : t; };
const numOrNull = (v: string | undefined, label: string): number | null => {
  const t = (v ?? "").trim(); if (t === "") return null;
  const n = Number(t); if (!Number.isFinite(n) || n < 0) throw new Error(`${label} must be a number ≥ 0`);
  return n;
};
const num0 = (v: string | undefined, label: string): number => numOrNull(v, label) ?? 0;
const intMin = (v: string | undefined, label: string, min: number): number => {
  const t = (v ?? "").trim(); const n = t === "" ? min : Number(t);
  if (!Number.isInteger(n) || n < min) throw new Error(`${label} must be a whole number ≥ ${min}`);
  return n;
};
const propType = (v?: string): string | null => {
  const t = (v ?? "").trim(); if (t === "") return null;
  if (!(PROPERTY_TYPES as readonly string[]).includes(t)) throw new Error("Invalid property type");
  return t;
};

const SELECT = `
  select c.id, c.code, c.name, c.property_type, c.crew_size,
         c.est_duration_hours::text, c.buffer_minutes, c.est_material_cost::text,
         c.default_pricing_model_id, pm.name as default_pricing_model_name,
         c.default_measure::text, c.default_unit_price::text, c.recommended_price::text,
         c.notes, c.is_active, c.is_assumed, c.assumed_note
    from service_categories c
    left join pricing_models pm on pm.id = c.default_pricing_model_id`;

export async function listCategories(tenantId: string, serviceLineId: string, includeArchived = false): Promise<ServiceCategory[]> {
  const { rows } = await scopedRead(tenantId,
    `${SELECT} where c.tenant_id=$1 and c.service_line_id=$2 and ($3 or c.is_active)
      order by c.is_active desc, c.property_type nulls last, c.name`,
    [tenantId, serviceLineId, includeArchived]);
  return rows as ServiceCategory[];
}

export async function createCategory(tenantId: string, serviceLineId: string, d: CategoryInput): Promise<string> {
  if (!clean(d.code)) throw new Error("A code is required");
  if (!clean(d.name)) throw new Error("A name is required");
  return withTenantTx(tenantId, async (c) => {
    const { rows } = await c.query(
      `insert into service_categories
         (tenant_id, service_line_id, code, name, property_type, crew_size, est_duration_hours,
          buffer_minutes, est_material_cost, default_pricing_model_id, default_measure,
          default_unit_price, recommended_price, notes, is_assumed)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,false) returning id`,
      [tenantId, serviceLineId, clean(d.code), (d.name ?? "").trim(), propType(d.property_type),
       intMin(d.crew_size, "Crew size", 1), num0(d.est_duration_hours, "Duration"),
       intMin(d.buffer_minutes, "Buffer", 0), num0(d.est_material_cost, "Material cost"),
       clean(d.default_pricing_model_id), num0(d.default_measure, "Measure"),
       num0(d.default_unit_price, "Unit price"), numOrNull(d.recommended_price, "Recommended price"), clean(d.notes)],
    );
    await audit(c, tenantId, { table: "service_categories", rowId: rows[0].id, action: "insert", newValue: d, note: "service category created" });
    return rows[0].id as string;
  });
}

export async function updateCategory(tenantId: string, id: string, d: CategoryInput): Promise<void> {
  if (!clean(d.code)) throw new Error("A code is required");
  if (!clean(d.name)) throw new Error("A name is required");
  await withTenantTx(tenantId, async (c) => {
    const before = (await c.query(`select code, name, property_type, crew_size, est_duration_hours::text, buffer_minutes,
             est_material_cost::text, default_pricing_model_id, default_measure::text, default_unit_price::text,
             recommended_price::text, notes, is_assumed
        from service_categories where id=$1 and tenant_id=$2 for update`, [id, tenantId])).rows[0];
    if (!before) throw new Error("Category not found");
    await c.query(
      `update service_categories set code=$1, name=$2, property_type=$3, crew_size=$4, est_duration_hours=$5,
              buffer_minutes=$6, est_material_cost=$7, default_pricing_model_id=$8, default_measure=$9,
              default_unit_price=$10, recommended_price=$11, notes=$12
              ${before.is_assumed ? ", is_assumed=false, confirmed_at=now()" : ""} where id=$13`,
      [clean(d.code), (d.name ?? "").trim(), propType(d.property_type), intMin(d.crew_size, "Crew size", 1),
       num0(d.est_duration_hours, "Duration"), intMin(d.buffer_minutes, "Buffer", 0), num0(d.est_material_cost, "Material cost"),
       clean(d.default_pricing_model_id), num0(d.default_measure, "Measure"), num0(d.default_unit_price, "Unit price"),
       numOrNull(d.recommended_price, "Recommended price"), clean(d.notes), id],
    );
    await audit(c, tenantId, { table: "service_categories", rowId: id, action: "update", oldValue: before, newValue: d, note: "service category edited" });
  });
}

export async function archiveCategory(tenantId: string, id: string): Promise<void> {
  await withTenantTx(tenantId, async (c) => {
    const r = await c.query(`update service_categories set is_active=false where id=$1 and tenant_id=$2 and is_active returning id`, [id, tenantId]);
    if (r.rowCount) await audit(c, tenantId, { table: "service_categories", rowId: id, action: "update", oldValue: { is_active: true }, newValue: { is_active: false }, note: "service category archived (deactivated)" });
  });
}

export async function restoreCategory(tenantId: string, id: string): Promise<void> {
  await withTenantTx(tenantId, async (c) => {
    const r = await c.query(`update service_categories set is_active=true where id=$1 and tenant_id=$2 and not is_active returning id`, [id, tenantId]);
    if (r.rowCount) await audit(c, tenantId, { table: "service_categories", rowId: id, action: "update", oldValue: { is_active: false }, newValue: { is_active: true }, note: "service category restored (reactivated)" });
  });
}
