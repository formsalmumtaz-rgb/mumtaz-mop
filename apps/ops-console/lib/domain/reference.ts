import "server-only";
import { scopedRead } from "../rls";

export interface Ref {
  id: string;
  code: string | null;
  name: string;
  is_assumed: boolean;
}

async function listRef(table: string, tenantId: string): Promise<Ref[]> {
  // table names are internal literals, never user input
  const { rows } = await scopedRead(tenantId, 
    `select id, code, name, is_assumed from ${table} where tenant_id = $1 and is_active order by name`,
    [tenantId],
  );
  return rows as Ref[];
}

export const listFrequencies = (t: string) => listRef("frequencies", t);
export const listPricingModels = (t: string) => listRef("pricing_models", t);
export const listFacilityTypes = (t: string) => listRef("facility_types", t);
export const listServiceTypes = (t: string) => listRef("service_types", t);
export const listJobSources = (t: string) => listRef("job_sources", t);
export const listTeams = (t: string) => listRef("teams", t);

export async function getServiceLineId(tenantId: string): Promise<string> {
  const { rows } = await scopedRead(tenantId, 
    `select id from service_lines where tenant_id = $1 and code = 'pest_control' limit 1`,
    [tenantId],
  );
  if (!rows[0]) throw new Error("pest_control service line not found (apply 010_seed)");
  return rows[0].id as string;
}
