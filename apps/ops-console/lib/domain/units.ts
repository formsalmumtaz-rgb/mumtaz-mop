import "server-only";
import { scopedRead } from "../rls";

// Units with their conversion factor, for UoM/pack pickers and the live
// unit-cost preview on the purchase form (mig 016 added base_unit_id/to_base_factor).
export interface Unit {
  id: string;
  code: string | null;
  name: string;
  dimension: string;
  to_base_factor: string; // numeric-as-text (e.g. "1000" for litre->ml)
  base_unit_id: string | null;
}

export async function listUnits(tenantId: string): Promise<Unit[]> {
  const { rows } = await scopedRead(tenantId, 
    `select id, code, name, dimension, to_base_factor::text as to_base_factor, base_unit_id
       from units
      where tenant_id = $1 and is_active
      order by dimension, to_base_factor`,
    [tenantId],
  );
  return rows as Unit[];
}
