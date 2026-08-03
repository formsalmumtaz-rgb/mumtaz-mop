import "server-only";
import { pool } from "../db";
import { withTenantTx } from "./tx";
import { audit } from "./audit";

export interface Contract {
  id: string;
  contract_number: string | null;
  lifecycle_status: string;
  contract_value: string | null;
  currency: string;
  start_date: string | null;
  end_date: string | null;
  frequency_id: string | null;
  frequency_name: string | null;
  pricing_model_id: string | null;
  pricing_model_name: string | null;
}

export interface ContractInput {
  contract_number?: string;
  frequency_id?: string;
  pricing_model_id?: string;
  contract_value?: string;
  currency?: string;
  start_date?: string;
  end_date?: string;
}

const clean = (v?: string) => {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
};

export async function listContracts(tenantId: string, customerId: string): Promise<Contract[]> {
  const { rows } = await pool.query(
    `select ct.id, ct.contract_number, ct.lifecycle_status, ct.contract_value::text as contract_value,
            ct.currency, ct.start_date::text as start_date, ct.end_date::text as end_date,
            ct.frequency_id, f.name as frequency_name,
            ct.pricing_model_id, p.name as pricing_model_name
       from contracts ct
       left join frequencies f on f.id = ct.frequency_id
       left join pricing_models p on p.id = ct.pricing_model_id
      where ct.tenant_id = $1 and ct.customer_id = $2
      order by ct.created_at desc`,
    [tenantId, customerId],
  );
  return rows as Contract[];
}

export interface ContractLine {
  id: string;
  service_type_name: string | null;
  pricing_model_name: string | null;
  unit_price: string | null;
  quantity: string;
  notes: string | null;
}

export interface ContractDetail extends Contract {
  customer_id: string;
  customer_name: string | null;
  service_line_id: string;
  source_estimate_id: string | null;
  lines: ContractLine[];
}

export async function getContract(tenantId: string, id: string): Promise<ContractDetail | null> {
  const { rows } = await pool.query(
    `select ct.id, ct.contract_number, ct.lifecycle_status, ct.contract_value::text as contract_value,
            ct.currency, ct.start_date::text as start_date, ct.end_date::text as end_date,
            ct.frequency_id, f.name as frequency_name, ct.pricing_model_id, p.name as pricing_model_name,
            ct.customer_id, cu.trade_name as customer_name, ct.service_line_id,
            (select e.id from estimates e where e.contract_id = ct.id limit 1) as source_estimate_id
       from contracts ct
       left join frequencies f on f.id = ct.frequency_id
       left join pricing_models p on p.id = ct.pricing_model_id
       left join customers cu on cu.id = ct.customer_id
      where ct.tenant_id = $1 and ct.id = $2`,
    [tenantId, id],
  );
  if (!rows[0]) return null;
  const { rows: lines } = await pool.query(
    `select cs.id, st.name as service_type_name, pm.name as pricing_model_name,
            cs.unit_price::text as unit_price, cs.quantity::text as quantity, cs.notes
       from contract_services cs
       left join service_types st on st.id = cs.service_type_id
       left join pricing_models pm on pm.id = cs.pricing_model_id
      where cs.tenant_id = $1 and cs.contract_id = $2 and cs.is_active
      order by cs.created_at`,
    [tenantId, id],
  );
  return { ...(rows[0] as ContractDetail), lines: lines as ContractLine[] };
}

export async function createContract(
  tenantId: string,
  serviceLineId: string,
  customerId: string,
  data: ContractInput,
): Promise<string> {
  return withTenantTx(tenantId, async (c) => {
    const { rows } = await c.query(
      `insert into contracts
         (tenant_id, service_line_id, customer_id, contract_number, frequency_id, pricing_model_id,
          contract_value, currency, start_date, end_date, lifecycle_status, is_assumed)
       values ($1,$2,$3,$4,$5,$6,$7,coalesce($8,'AED'),$9,$10,'draft',false)
       returning id`,
      [tenantId, serviceLineId, customerId, clean(data.contract_number), clean(data.frequency_id),
       clean(data.pricing_model_id), clean(data.contract_value), clean(data.currency),
       clean(data.start_date), clean(data.end_date)],
    );
    await audit(c, tenantId, {
      table: "contracts", rowId: rows[0].id, action: "insert",
      newValue: data, note: "contract created in admin console",
    });
    return rows[0].id as string;
  });
}

export interface ScheduleSummary {
  scheduleCount: number;
  firstDate: string | null;
  lastDate: string | null;
  jobsCount: number;
  remindersCount: number;
}

// What one activated contract produced — for the UI (demo moment #1).
export async function getScheduleSummary(tenantId: string, contractId: string): Promise<ScheduleSummary> {
  const { rows: s } = await pool.query(
    `select count(*)::int n, min(scheduled_date)::text f, max(scheduled_date)::text l
       from contract_schedule where tenant_id=$1 and contract_id=$2`,
    [tenantId, contractId],
  );
  const { rows: j } = await pool.query(
    `select count(*)::int n from jobs where tenant_id=$1 and contract_id=$2`, [tenantId, contractId]);
  const { rows: r } = await pool.query(
    `select count(*)::int n from reminders where tenant_id=$1 and entity_id=$2 and reminder_type='contract_renewal'`,
    [tenantId, contractId]);
  return { scheduleCount: s[0].n, firstDate: s[0].f, lastDate: s[0].l, jobsCount: j[0].n, remindersCount: r[0].n };
}

// Activate a contract and emit contract.activated in the SAME transaction
// (Art. VII §1). K2's consumers fan out from this event.
export async function activateContract(tenantId: string, id: string): Promise<void> {
  await withTenantTx(tenantId, async (c) => {
    const { rows } = await c.query(
      `select id, customer_id, service_line_id, frequency_id, lifecycle_status,
              start_date::text as start_date, end_date::text as end_date
         from contracts where id = $1 and tenant_id = $2 for update`,
      [id, tenantId],
    );
    const ct = rows[0];
    if (!ct) throw new Error("Contract not found");
    if (ct.lifecycle_status === "active") return; // idempotent

    await c.query(
      `update contracts set lifecycle_status = 'active', signed_at = coalesce(signed_at, current_date) where id = $1`,
      [id],
    );

    const payload = {
      contract_id: ct.id,
      customer_id: ct.customer_id,
      service_line_id: ct.service_line_id,
      start_date: ct.start_date,
      end_date: ct.end_date,
      frequency_id: ct.frequency_id,
    };
    await c.query(
      `insert into outbox_events (tenant_id, event_type, aggregate_type, entity_id, payload)
       values ($1, 'contract.activated', 'contract', $2, $3)`,
      [tenantId, ct.id, JSON.stringify(payload)],
    );

    await audit(c, tenantId, {
      table: "contracts", rowId: id, action: "update",
      oldValue: { lifecycle_status: ct.lifecycle_status }, newValue: { lifecycle_status: "active" },
      note: "contract activated — emitted contract.activated",
    });
  });
}
