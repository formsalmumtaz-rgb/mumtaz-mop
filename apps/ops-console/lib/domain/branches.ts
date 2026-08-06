import "server-only";
import { scopedRead } from "../rls";
import { withTenantTx } from "./tx";
import { audit } from "./audit";

export interface Branch {
  id: string;
  code: string | null;
  name: string | null;
  address: string | null;
  emirate: string | null;
  facility_type_id: string | null;
  facility_type_name: string | null;
  lat: number | null;
  lng: number | null;
}

export interface BranchInput {
  name?: string;
  address?: string;
  emirate?: string;
  facility_type_id?: string;
  lat?: number | null;
  lng?: number | null;
}

const clean = (v?: string) => {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
};

export async function listBranches(tenantId: string, customerId: string): Promise<Branch[]> {
  const { rows } = await scopedRead(tenantId, 
    `select b.id, b.code, b.name, b.address, b.emirate, b.facility_type_id,
            f.name as facility_type_name,
            ST_Y(b.location::geometry) as lat, ST_X(b.location::geometry) as lng
       from customer_branches b
       left join facility_types f on f.id = b.facility_type_id
      where b.tenant_id = $1 and b.customer_id = $2
      order by b.created_at`,
    [tenantId, customerId],
  );
  return rows as Branch[];
}

export async function createBranch(
  tenantId: string,
  serviceLineId: string,
  customerId: string,
  data: BranchInput,
): Promise<string> {
  return withTenantTx(tenantId, async (c) => {
    const { rows: cnt } = await c.query(`select count(*)::int n from customer_branches where tenant_id=$1`, [tenantId]);
    const code = "BR-" + String(cnt[0].n + 1).padStart(4, "0");
    const lat = data.lat ?? null;
    const lng = data.lng ?? null;
    const { rows } = await c.query(
      `insert into customer_branches
         (tenant_id, service_line_id, customer_id, code, name, address, emirate, facility_type_id, location)
       values ($1,$2,$3,$4,$5,$6,$7,$8,
         case when $9::float8 is null or $10::float8 is null then null
              else ST_SetSRID(ST_MakePoint($9,$10),4326)::geography end)
       returning id`,
      [tenantId, serviceLineId, customerId, code, clean(data.name), clean(data.address),
       clean(data.emirate), clean(data.facility_type_id), lng, lat],
    );
    await audit(c, tenantId, {
      table: "customer_branches", rowId: rows[0].id, action: "insert",
      newValue: { code, name: data.name, address: data.address, lat, lng },
      note: "branch created in admin console",
    });
    return rows[0].id as string;
  });
}
