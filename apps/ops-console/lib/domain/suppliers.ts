import "server-only";
import { scopedRead } from "../rls";
import { withTenantTx } from "./tx";
import { audit } from "./audit";

// Suppliers — simple reference data, created inline from the purchase screen.
export interface Supplier {
  id: string;
  code: string | null;
  name: string;
  trn: string | null;
  is_assumed: boolean;
  assumed_note: string | null;
  is_active: boolean;
}

export async function listSuppliers(tenantId: string): Promise<Supplier[]> {
  const { rows } = await scopedRead(tenantId, 
    `select id, code, name, trn, is_assumed, assumed_note, is_active
       from suppliers where tenant_id = $1 and is_active order by name`,
    [tenantId],
  );
  return rows as Supplier[];
}

const clean = (v?: string) => {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
};

export async function createSupplier(
  tenantId: string,
  serviceLineId: string,
  d: { name: string; code?: string; trn?: string },
): Promise<string> {
  if (!d.name?.trim()) throw new Error("Supplier name is required");
  return withTenantTx(tenantId, async (c) => {
    const { rows } = await c.query(
      `insert into suppliers (tenant_id, service_line_id, code, name, trn, is_assumed)
       values ($1,$2,$3,$4,$5,false) returning id`,
      [tenantId, serviceLineId, clean(d.code), d.name.trim(), clean(d.trn)],
    );
    await audit(c, tenantId, {
      table: "suppliers", rowId: rows[0].id, action: "insert",
      newValue: d, note: "supplier created in admin console",
    });
    return rows[0].id as string;
  });
}
