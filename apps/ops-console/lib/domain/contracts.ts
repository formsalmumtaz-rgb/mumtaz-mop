import "server-only";
import { scopedRead } from "../rls";
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
  const { rows } = await scopedRead(tenantId, 
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

// Tenant-wide contract list (Release 1 item 1 — contracts previously had no list
// page and were unreachable except via a customer, an estimate, or billing).
export interface AllContractRow extends Contract {
  customer_id: string;
  customer_name: string | null;
  jobs_count: number;
}

export async function listAllContracts(tenantId: string): Promise<AllContractRow[]> {
  const { rows } = await scopedRead(tenantId,
    `select ct.id, ct.contract_number, ct.lifecycle_status, ct.contract_value::text as contract_value,
            ct.currency, ct.start_date::text as start_date, ct.end_date::text as end_date,
            ct.frequency_id, f.name as frequency_name,
            ct.pricing_model_id, p.name as pricing_model_name,
            ct.customer_id, cu.trade_name as customer_name,
            (select count(*)::int from jobs j where j.contract_id = ct.id) as jobs_count
       from contracts ct
       left join customers cu on cu.id = ct.customer_id
       left join frequencies f on f.id = ct.frequency_id
       left join pricing_models p on p.id = ct.pricing_model_id
      where ct.tenant_id = $1 and ct.archived_at is null
      order by (ct.lifecycle_status = 'active') desc, ct.end_date nulls last, ct.created_at desc`,
    [tenantId],
  );
  return rows as AllContractRow[];
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
  billing_frequency: string | null;
  billing_day: number | null;
  billing_interval_days: number | null;
  auto_generate_invoice: boolean;
  next_invoice_date: string | null;
  last_invoice_date: string | null;
  archived_at: string | null;
  // True once the contract has issued/paid tax invoices: its commercial terms are
  // then lifecycle-frozen (corrections flow through credit notes / reversals,
  // never edits). The UI renders those fields read-only with an explanation.
  financially_locked: boolean;
  lines: ContractLine[];
}

export async function getContract(tenantId: string, id: string): Promise<ContractDetail | null> {
  const { rows } = await scopedRead(tenantId, 
    `select ct.id, ct.contract_number, ct.lifecycle_status, ct.contract_value::text as contract_value,
            ct.currency, ct.start_date::text as start_date, ct.end_date::text as end_date,
            ct.frequency_id, f.name as frequency_name, ct.pricing_model_id, p.name as pricing_model_name,
            ct.customer_id, cu.trade_name as customer_name, ct.service_line_id,
            ct.billing_frequency, ct.billing_day, ct.billing_interval_days, ct.auto_generate_invoice,
            ct.next_invoice_date::text as next_invoice_date, ct.last_invoice_date::text as last_invoice_date,
            ct.archived_at::text as archived_at,
            exists(select 1 from invoices iv where iv.contract_id = ct.id
                     and iv.document_type = 'tax_invoice' and iv.status in ('issued','paid')) as financially_locked,
            (select e.id from estimates e where e.contract_id = ct.id limit 1) as source_estimate_id
       from contracts ct
       left join frequencies f on f.id = ct.frequency_id
       left join pricing_models p on p.id = ct.pricing_model_id
       left join customers cu on cu.id = ct.customer_id
      where ct.tenant_id = $1 and ct.id = $2`,
    [tenantId, id],
  );
  if (!rows[0]) return null;
  const { rows: lines } = await scopedRead(tenantId, 
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

// Edit commercial terms. Refused once the contract is financially locked (has
// issued invoices) — those terms are then frozen and corrected via credit
// notes/reversals. Editable while unlocked (draft, or active but not yet billed).
export async function updateContract(tenantId: string, id: string, data: ContractInput): Promise<void> {
  await withTenantTx(tenantId, async (c) => {
    const before = (await c.query(
      `select contract_number, frequency_id, pricing_model_id, contract_value::text as contract_value,
              currency, start_date::text as start_date, end_date::text as end_date,
              exists(select 1 from invoices iv where iv.contract_id=$1
                       and iv.document_type='tax_invoice' and iv.status in ('issued','paid')) as locked
         from contracts where id=$1 and tenant_id=$2 for update`, [id, tenantId],
    )).rows[0];
    if (!before) throw new Error("Contract not found");
    if (before.locked) throw new Error("Contract has issued invoices — commercial terms are locked. Extend the term instead, or correct via a credit note.");
    await c.query(
      `update contracts set contract_number=$1, frequency_id=$2, pricing_model_id=$3,
              contract_value=$4, currency=coalesce($5,'AED'), start_date=$6, end_date=$7 where id=$8`,
      [clean(data.contract_number), clean(data.frequency_id), clean(data.pricing_model_id),
       clean(data.contract_value), clean(data.currency), clean(data.start_date), clean(data.end_date), id],
    );
    await audit(c, tenantId, {
      table: "contracts", rowId: id, action: "update",
      oldValue: before, newValue: data, note: "contract terms edited in admin console",
    });
  });
}

// Extend (or clear) the contract end date. Always allowed — a forward-looking
// term change that does not touch any past billing, so it stays available even
// when the contract is financially locked.
export async function extendContractEndDate(tenantId: string, id: string, endDate: string): Promise<void> {
  const nd = clean(endDate);
  await withTenantTx(tenantId, async (c) => {
    const before = (await c.query(`select end_date::text as end_date from contracts where id=$1 and tenant_id=$2 for update`, [id, tenantId])).rows[0];
    if (!before) throw new Error("Contract not found");
    await c.query(`update contracts set end_date=$1 where id=$2`, [nd, id]);
    await audit(c, tenantId, {
      table: "contracts", rowId: id, action: "update",
      oldValue: { end_date: before.end_date }, newValue: { end_date: nd }, note: "contract term extended",
    });
  });
}

// Archive is a soft hide (never a hard delete, financial records untouched). An
// active contract must be handled through its lifecycle first, so archive is
// refused while active.
export async function archiveContract(tenantId: string, id: string): Promise<void> {
  await withTenantTx(tenantId, async (c) => {
    const cur = (await c.query(`select lifecycle_status from contracts where id=$1 and tenant_id=$2 and archived_at is null for update`, [id, tenantId])).rows[0];
    if (!cur) return;
    if (cur.lifecycle_status === "active") throw new Error("Cannot archive an active contract — end or cancel it first.");
    const r = await c.query(`update contracts set archived_at=now(), archived_by=app_current_actor() where id=$1 and tenant_id=$2 and archived_at is null returning id`, [id, tenantId]);
    if (r.rowCount) await audit(c, tenantId, { table: "contracts", rowId: id, action: "update", newValue: { archived: true }, note: "contract archived" });
  });
}

export async function restoreContract(tenantId: string, id: string): Promise<void> {
  await withTenantTx(tenantId, async (c) => {
    const r = await c.query(`update contracts set archived_at=null, archived_by=null where id=$1 and tenant_id=$2 and archived_at is not null returning id`, [id, tenantId]);
    if (r.rowCount) await audit(c, tenantId, { table: "contracts", rowId: id, action: "update", newValue: { archived: false }, note: "contract restored" });
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
  const { rows: s } = await scopedRead(tenantId, 
    `select count(*)::int n, min(scheduled_date)::text f, max(scheduled_date)::text l
       from contract_schedule where tenant_id=$1 and contract_id=$2`,
    [tenantId, contractId],
  );
  const { rows: j } = await scopedRead(tenantId, 
    `select count(*)::int n from jobs where tenant_id=$1 and contract_id=$2`, [tenantId, contractId]);
  const { rows: r } = await scopedRead(tenantId, 
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

// Flow item 8 — the WHY behind the contract's frequency, recomputed live from
// the municipality compliance matrix (mig 073). Returns null when the customer's
// premises category is unknown or the matrix has no sourced rule — the UI then
// says nothing rather than inventing a basis.
export interface FrequencyBasis {
  visits_per_year: number;
  emirate: string | null;
  facility: string | null;
  matches_contract: boolean; // contract's frequency annualises to the same count
}

export async function getFrequencyBasis(tenantId: string, contractId: string): Promise<FrequencyBasis | null> {
  const { rows } = await scopedRead(tenantId,
    `with ct as (
       select c.customer_id, c.service_line_id, c.frequency_id from contracts c
        where c.id = $2 and c.tenant_id = $1
     ), cust as (
       select cu.emirate,
              case cu.attributes->>'industry'
                when 'restaurant' then 'restaurant' when 'cafe' then 'restaurant'
                when 'supermarket' then 'supermarket' when 'office' then 'office'
                when 'warehouse' then 'warehouse' when 'medical' then 'clinic'
                when 'educational' then 'school' when 'worship' then 'mosque'
                when 'construction' then 'construction'
              end as ft_code
         from customers cu where cu.id = (select customer_id from ct)
     ), ft as (
       select id, name from facility_types
        where tenant_id = $1 and code = (select ft_code from cust) limit 1
     ), v as (
       select fn_visit_frequency($1, (select service_line_id from ct),
                (select emirate from cust), (select id from ft), 'general') as n
     )
     select v.n as visits_per_year, (select emirate from cust) as emirate,
            (select name from ft) as facility,
            coalesce((select round(case f.period_unit
                 when 'year'  then f.visits_per_period::numeric / f.period_count
                 when 'month' then f.visits_per_period * 12.0 / f.period_count
                 when 'week'  then f.visits_per_period * 52.0 / f.period_count
                 when 'day'   then f.visits_per_period * 365.0 / f.period_count
               end) = v.n
              from frequencies f where f.id = (select frequency_id from ct)), false) as matches_contract
       from v where v.n is not null`,
    [tenantId, contractId]);
  if (!rows[0]) return null;
  return {
    visits_per_year: Number(rows[0].visits_per_year),
    emirate: rows[0].emirate, facility: rows[0].facility,
    matches_contract: !!rows[0].matches_contract,
  };
}
