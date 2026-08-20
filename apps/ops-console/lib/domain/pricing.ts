import "server-only";
import { scopedRead } from "../rls";
import { withTenantTx } from "./tx";
import { audit } from "./audit";

// Pricing Model Engine (mig 028). Manage the typed pricing-model catalogue and
// which models each service supports. Price computation is the deterministic
// fn_price; formulas are structured (base + Σ measure×rate) — no free-text eval.

export const MODEL_TYPES = [
  "fixed", "per_hour", "per_day", "per_person", "per_month", "per_visit",
  "per_sqm", "per_apartment", "per_room", "per_floor", "per_duct",
  "per_linear_metre", "quantity_unit", "formula", "custom",
] as const;

export interface FormulaSpec { base?: number; terms?: { measure_key: string; rate: number }[] }
export interface PricingModel {
  is_advanced?: boolean;
  id: string;
  code: string | null;
  name: string;
  model_type: string;
  formula_spec: FormulaSpec;
  is_assumed: boolean;
  assumed_note: string | null;
  is_active?: boolean;
}

/**
 * The pricing picker.
 *
 * Scoped to the division (item 4) and to the everyday three (item 5): per
 * treatment, per month, per year. The other fourteen are real but rare, and a
 * 26-item dropdown is how a new person picks the wrong one — they are returned
 * only when `includeAdvanced` is set, for the screen that offers "advanced".
 */
export async function listPricingModels(
  tenantId: string,
  serviceLineId?: string | null,
  opts: { includeArchived?: boolean; includeAdvanced?: boolean } = {},
): Promise<PricingModel[]> {
  const { rows } = await scopedRead(tenantId,
    `select id, code, name, model_type, formula_spec, is_assumed, assumed_note, is_active, is_advanced
       from pricing_models
      where tenant_id=$1 and ($2 or is_active)
        and ($3::uuid is null or service_line_id = $3::uuid)
        and ($4 or not is_advanced)
      order by is_active desc, is_advanced, model_type, name`,
    [tenantId, !!opts.includeArchived, serviceLineId ?? null, !!opts.includeAdvanced],
  );
  return rows as PricingModel[];
}

export async function archivePricingModel(tenantId: string, id: string): Promise<void> {
  await withTenantTx(tenantId, async (c) => {
    const r = await c.query(`update pricing_models set is_active=false where id=$1 and tenant_id=$2 and is_active returning id`, [id, tenantId]);
    if (r.rowCount) await audit(c, tenantId, { table: "pricing_models", rowId: id, action: "update", oldValue: { is_active: true }, newValue: { is_active: false }, note: "pricing model archived (deactivated)" });
  });
}

export async function restorePricingModel(tenantId: string, id: string): Promise<void> {
  await withTenantTx(tenantId, async (c) => {
    const r = await c.query(`update pricing_models set is_active=true where id=$1 and tenant_id=$2 and not is_active returning id`, [id, tenantId]);
    if (r.rowCount) await audit(c, tenantId, { table: "pricing_models", rowId: id, action: "update", oldValue: { is_active: false }, newValue: { is_active: true }, note: "pricing model restored (reactivated)" });
  });
}

const clean = (v?: string) => { const t = (v ?? "").trim(); return t === "" ? null : t; };

// terms arrive as parallel arrays measure_key[]/rate[] from the form
function buildSpec(baseStr: string | undefined, keys: string[], rates: string[]): FormulaSpec {
  const base = Number((baseStr ?? "").trim() || "0");
  if (!Number.isFinite(base) || base < 0) throw new Error("Formula base must be ≥ 0");
  const terms: { measure_key: string; rate: number }[] = [];
  for (let i = 0; i < keys.length; i++) {
    const key = (keys[i] ?? "").trim();
    if (key === "") continue;
    const rate = Number((rates[i] ?? "").trim() || "0");
    if (!Number.isFinite(rate)) throw new Error(`Formula rate for "${key}" is not a number`);
    terms.push({ measure_key: key, rate });
  }
  return { base, terms };
}

export interface PricingModelInput {
  code?: string; name?: string; model_type?: string;
  formula_base?: string; formula_keys?: string[]; formula_rates?: string[];
}

export async function createPricingModel(tenantId: string, serviceLineId: string, d: PricingModelInput): Promise<string> {
  const name = d.name?.trim();
  if (!name) throw new Error("Name is required");
  const mt = d.model_type ?? "fixed";
  if (!MODEL_TYPES.includes(mt as (typeof MODEL_TYPES)[number])) throw new Error("Invalid model type");
  const spec = mt === "formula" ? buildSpec(d.formula_base, d.formula_keys ?? [], d.formula_rates ?? []) : {};
  return withTenantTx(tenantId, async (c) => {
    const { rows } = await c.query(
      `insert into pricing_models(tenant_id, service_line_id, code, name, model_type, formula_spec, is_assumed)
       values ($1,$2,$3,$4,$5,$6,false) returning id`,
      [tenantId, serviceLineId, clean(d.code), name, mt, JSON.stringify(spec)],
    );
    await audit(c, tenantId, { table: "pricing_models", rowId: rows[0].id, action: "insert", newValue: { ...d, model_type: mt, formula_spec: spec }, note: "pricing model created" });
    return rows[0].id as string;
  });
}

export async function updatePricingModel(tenantId: string, id: string, d: PricingModelInput): Promise<void> {
  const name = d.name?.trim();
  if (!name) throw new Error("Name is required");
  const mt = d.model_type ?? "fixed";
  if (!MODEL_TYPES.includes(mt as (typeof MODEL_TYPES)[number])) throw new Error("Invalid model type");
  const spec = mt === "formula" ? buildSpec(d.formula_base, d.formula_keys ?? [], d.formula_rates ?? []) : {};
  await withTenantTx(tenantId, async (c) => {
    const before = (await c.query(`select name, model_type, formula_spec from pricing_models where id=$1 and tenant_id=$2 for update`, [id, tenantId])).rows[0];
    if (!before) throw new Error("Pricing model not found");
    await c.query(`update pricing_models set name=$1, model_type=$2, formula_spec=$3, is_assumed=false where id=$4`,
      [name, mt, JSON.stringify(spec), id]);
    await audit(c, tenantId, { table: "pricing_models", rowId: id, action: "update", oldValue: before, newValue: { ...d, model_type: mt, formula_spec: spec }, note: "pricing model edited" });
  });
}

export interface ServiceModelMap { service_type_id: string; service_name: string; model_ids: string[]; default_id: string | null }

export async function listServiceModelMap(tenantId: string): Promise<ServiceModelMap[]> {
  const { rows: sts } = await scopedRead(tenantId, 
    `select id, name from service_types where tenant_id=$1 and is_active order by name`, [tenantId]);
  const { rows: links } = await scopedRead(tenantId, 
    `select service_type_id, pricing_model_id, is_default from service_pricing_models where tenant_id=$1 and is_active`, [tenantId]);
  return sts.map((s: { id: string; name: string }) => {
    const mine = links.filter((l: { service_type_id: string }) => l.service_type_id === s.id);
    return {
      service_type_id: s.id, service_name: s.name,
      model_ids: mine.map((l: { pricing_model_id: string }) => l.pricing_model_id),
      default_id: mine.find((l: { is_default: boolean }) => l.is_default)?.pricing_model_id ?? null,
    };
  });
}

// Replace a service's supported models (mutable junction) in one transaction.
export async function setServiceModels(tenantId: string, serviceLineId: string, serviceTypeId: string, modelIds: string[], defaultId: string | null): Promise<void> {
  await withTenantTx(tenantId, async (c) => {
    await c.query(`delete from service_pricing_models where tenant_id=$1 and service_type_id=$2`, [tenantId, serviceTypeId]);
    for (const mid of modelIds) {
      await c.query(
        `insert into service_pricing_models(tenant_id, service_line_id, service_type_id, pricing_model_id, is_default)
         values ($1,$2,$3,$4,$5)`,
        [tenantId, serviceLineId, serviceTypeId, mid, mid === defaultId],
      );
    }
    await audit(c, tenantId, { table: "service_pricing_models", rowId: serviceTypeId, action: "update", newValue: { model_ids: modelIds, default_id: defaultId }, note: "service supported pricing models set" });
  });
}
