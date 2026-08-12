import "server-only";
import { scopedRead, withRequest } from "../rls";
import { audit } from "./audit";

// field_definitions admin (Release 1 item 8 — the highest-leverage gap in the
// workflow spec). The substrate has existed and been ENFORCED since mig 001: the
// attributes validator on customers/branches/contracts/jobs/service reports/items
// (and surveys, mig 032) rejects any key not declared here, and its error message
// literally says "declare it in field_definitions (admin console) first" — but no
// console screen ever read or wrote this table. This module + the screen turn the
// per-category question sets (spec Parts B/L) from a development task into data
// entry the owner can do.

export const ENTITY_TYPES = [
  "customer", "customer_branch", "contract", "job", "service_report", "item", "survey",
] as const;

export const DATA_TYPES = ["text", "number", "integer", "boolean", "date", "timestamptz", "enum"] as const;

export interface FieldDef {
  id: string;
  service_line_id: string | null;
  service_line_name: string | null;
  entity_type: string;
  field_key: string;
  label: string;
  data_type: string;
  is_required: boolean;
  enum_values: string[] | null;
  is_assumed: boolean;
  in_use: number; // rows currently carrying a value for this key (delete guard info)
}

export async function listFieldDefs(tenantId: string): Promise<FieldDef[]> {
  const { rows } = await scopedRead(tenantId,
    `select fd.id, fd.service_line_id, sl.name as service_line_name, fd.entity_type, fd.field_key,
            fd.label, fd.data_type, fd.is_required, fd.enum_values, fd.is_assumed,
            0::int as in_use
       from field_definitions fd
       left join service_lines sl on sl.id = fd.service_line_id
      where fd.tenant_id = $1
      order by fd.entity_type, sl.name nulls first, fd.field_key`,
    [tenantId],
  );
  return rows as FieldDef[];
}

export interface FieldDefInput {
  service_line_id?: string | null;
  entity_type: string;
  field_key: string;
  label: string;
  data_type: string;
  is_required: boolean;
  enum_values?: string[] | null;
  is_assumed?: boolean;
}

const KEY_RE = /^[a-z][a-z0-9_]{1,62}$/;

function validate(d: FieldDefInput): void {
  if (!(ENTITY_TYPES as readonly string[]).includes(d.entity_type)) throw new Error("Unknown entity type");
  if (!(DATA_TYPES as readonly string[]).includes(d.data_type)) throw new Error("Unknown data type");
  if (!KEY_RE.test(d.field_key)) throw new Error("Field key must be snake_case (a-z, 0-9, _), 2-63 chars");
  if (!d.label.trim()) throw new Error("Label is required");
  if (d.data_type === "enum" && !(d.enum_values && d.enum_values.length > 0)) {
    throw new Error("Enum fields need at least one option");
  }
}

export async function createFieldDef(tenantId: string, actorId: string | null, d: FieldDefInput): Promise<void> {
  validate(d);
  await withRequest({ tenantId, actorId }, async (c) => {
    const { rows } = await c.query(
      `insert into field_definitions
         (tenant_id, service_line_id, entity_type, field_key, label, data_type, is_required, enum_values, is_assumed, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
      [tenantId, d.service_line_id ?? null, d.entity_type, d.field_key, d.label.trim(), d.data_type,
       d.is_required, d.data_type === "enum" ? d.enum_values : null, d.is_assumed ?? false, actorId]);
    await audit(c, tenantId, { table: "field_definitions", rowId: rows[0].id, action: "insert", newValue: d, note: "field definition created", actorId });
  });
}

export async function updateFieldDef(tenantId: string, actorId: string | null, id: string, d: FieldDefInput): Promise<void> {
  validate(d);
  await withRequest({ tenantId, actorId }, async (c) => {
    const { rows: old } = await c.query(`select * from field_definitions where tenant_id=$1 and id=$2`, [tenantId, id]);
    if (!old[0]) throw new Error("Field definition not found");
    // entity_type + field_key are the identity existing attribute values hang off —
    // immutable here. Renaming a key would orphan stored values silently.
    await c.query(
      `update field_definitions
          set label=$3, data_type=$4, is_required=$5, enum_values=$6, service_line_id=$7,
              is_assumed=$8, updated_by=$9
        where tenant_id=$1 and id=$2`,
      [tenantId, id, d.label.trim(), d.data_type, d.is_required,
       d.data_type === "enum" ? d.enum_values : null, d.service_line_id ?? null, d.is_assumed ?? false, actorId]);
    await audit(c, tenantId, { table: "field_definitions", rowId: id, action: "update", oldValue: old[0], newValue: d, note: "field definition updated", actorId });
  });
}

export async function confirmFieldDef(tenantId: string, actorId: string | null, id: string): Promise<void> {
  await withRequest({ tenantId, actorId }, async (c) => {
    await c.query(
      `update field_definitions set is_assumed=false, confirmed_by=$3, confirmed_at=now() where tenant_id=$1 and id=$2`,
      [tenantId, id, actorId]);
    await audit(c, tenantId, { table: "field_definitions", rowId: id, action: "confirm", note: "field definition confirmed", actorId });
  });
}

// Deleting a definition makes the validator REJECT rows that still carry the key —
// so deletion refuses while any entity still has a value for it. (Reference data,
// not a transaction record: hard delete is legitimate once unused.)
export async function deleteFieldDef(tenantId: string, actorId: string | null, id: string): Promise<void> {
  await withRequest({ tenantId, actorId }, async (c) => {
    const { rows: def } = await c.query(`select * from field_definitions where tenant_id=$1 and id=$2`, [tenantId, id]);
    if (!def[0]) return;
    const tableFor: Record<string, string> = {
      customer: "customers", customer_branch: "customer_branches", contract: "contracts",
      job: "jobs", service_report: "service_reports", item: "items", survey: "surveys",
    };
    const tbl = tableFor[def[0].entity_type as string];
    if (tbl) {
      const { rows: used } = await c.query(
        `select count(*)::int as n from ${tbl} where tenant_id=$1 and attributes ? $2`,
        [tenantId, def[0].field_key]);
      if (used[0].n > 0) {
        throw new Error(`${used[0].n} ${def[0].entity_type} record(s) still carry "${def[0].field_key}" — cannot delete while in use`);
      }
    }
    await c.query(`delete from field_definitions where tenant_id=$1 and id=$2`, [tenantId, id]);
    await audit(c, tenantId, { table: "field_definitions", rowId: id, action: "soft_delete", oldValue: def[0], note: "field definition deleted (unused)", actorId });
  });
}
