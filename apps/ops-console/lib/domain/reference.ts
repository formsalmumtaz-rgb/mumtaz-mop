import "server-only";
import { scopedRead } from "../rls";
import { cache } from "react";

export interface Ref {
  default_frequency_id?: string | null;
  default_night_shift?: boolean | null;
  billing_category?: string | null;
  id: string;
  code: string | null;
  name: string;
  is_assumed: boolean;
}

// Item 4 — these lists are PER DIVISION. Unscoped, a pest control flow offered
// AC duct cleaning and facilities management, and the premises list showed
// "Cafeteria" three times because each division carries its own row. Scoping is
// the default; a caller wanting every division has to say so.
async function listRef(table: string, tenantId: string, serviceLineId?: string | null): Promise<Ref[]> {
  // table names are internal literals, never user input
  const { rows } = await scopedRead(tenantId,
    `select id, code, name, is_assumed,
            ${table === "service_types" || table === "facility_types" ? "sort_order" : "null::int as sort_order"},
            ${table === "facility_types" ? "default_frequency_id, default_night_shift, billing_category"
                                          : "null::uuid as default_frequency_id, null::boolean as default_night_shift, null::text as billing_category"}
       from ${table}
      where tenant_id = $1 and is_active
        and ($2::uuid is null or service_line_id = $2::uuid)
      order by sort_order nulls last, name`,
    [tenantId, serviceLineId ?? null],
  );
  return rows as Ref[];
}

export const listFrequencies = (t: string, sl?: string | null) => listRef("frequencies", t, sl);
export const listPricingModels = (t: string, sl?: string | null) => listRef("pricing_models", t, sl);
export const listFacilityTypes = (t: string, sl?: string | null) => listRef("facility_types", t, sl);
export const listServiceTypes = (t: string, sl?: string | null) => listRef("service_types", t, sl);
export const listJobSources = (t: string) => listRef("job_sources", t);
export const listTeams = (t: string) => listRef("teams", t);

export interface ServiceLine { id: string; code: string; name: string }

// Active divisions (service lines) the operator can switch between.
export async function listServiceLines(tenantId: string): Promise<ServiceLine[]> {
  const { rows } = await scopedRead(tenantId,
    `select id, code, name from service_lines where tenant_id = $1 and is_active order by name`,
    [tenantId],
  );
  return rows as ServiceLine[];
}

// The operator's currently-selected division (service-line code), from the
// mop_division cookie. Null when unset.
export async function getActiveServiceLineCode(): Promise<string | null> {
  const { cookies } = await import("next/headers");
  const v = (await cookies()).get("mop_division")?.value?.trim();
  return v || null;
}

// Resolve the ACTIVE division's service_line id (Art. XVIII — the app is
// service-driven, not hardcoded). Honours the mop_division cookie when it names
// an active line for this tenant; otherwise falls back to pest_control, then to
// the first active line. Same signature as before, so every caller is now
// division-aware with no change.
export async function getServiceLineId(tenantId: string): Promise<string> {
  return (await getActiveDivision(tenantId)).id;
}

// The full active division (id + code + name), resolved from the mop_division
// cookie (falls back to pest_control, then first active). Used both to scope
// division-aware queries and to show the operator which division is active.
export const getActiveDivision = cache(async (tenantId: string): Promise<ServiceLine> => {
  const code = await getActiveServiceLineCode();
  const { rows } = await scopedRead(tenantId,
    `select id, code, name from service_lines
      where tenant_id = $1 and is_active
      order by (code = $2) desc, (code = 'pest_control') desc, name
      limit 1`,
    [tenantId, code],
  );
  if (!rows[0]) throw new Error("No active service line found (apply 010_seed)");
  return rows[0] as ServiceLine;
});

// Run 8: reference lists for the customer registration question set. Both are
// editable data, not enums — the owner adds a category without a deploy.
export async function listIndustryCategories(tenantId: string): Promise<{ id: string; name: string | null }[]> {
  const { rows } = await scopedRead(tenantId,
    `select id, name from industry_categories
      where tenant_id = $1 and is_active order by sort_order, name`, [tenantId]);
  return rows as { id: string; name: string | null }[];
}

export async function listMunicipalityCategories(tenantId: string): Promise<{ id: string; name: string | null }[]> {
  const { rows } = await scopedRead(tenantId,
    `select id, name from municipality_categories where tenant_id = $1 order by code`, [tenantId]);
  return rows as { id: string; name: string | null }[];
}
