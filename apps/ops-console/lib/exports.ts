import "server-only";
import { scopedRead } from "./rls";

// One registry for every exportable console list. A dataset owns its columns
// AND its filter clauses, so the export route, the Excel sheet and the PDF all
// show exactly what the page shows — there is no second query to drift from the
// screen. Filters are whitelisted by key and always parameterised.

export interface ExportColumn { header: string; key: string; weight?: number; align?: "left" | "right"; width?: number }

export interface ExportDataset {
  title: string;
  permission: string;               // view permission required to export it
  columns: ExportColumn[];
  build(sp: Record<string, string | undefined>): { where: string[]; params: unknown[]; describe: string[] };
  sql(where: string): string;
}

// ── filter helpers ──────────────────────────────────────────────────────────
type Ctx = { where: string[]; params: unknown[]; describe: string[] };
const mk = (tenantAlias: string): Ctx => ({ where: [`${tenantAlias}.tenant_id = $1`], params: [], describe: [] });
const eq = (c: Ctx, sp: Record<string, string | undefined>, key: string, col: string, label = key) => {
  const v = (sp[key] ?? "").trim();
  if (!v) return;
  c.params.push(v);
  c.where.push(`${col} = $${c.params.length + 1}`);
  c.describe.push(`${label}: ${v}`);
};
const like = (c: Ctx, sp: Record<string, string | undefined>, key: string, cols: string[], label = "search") => {
  const v = (sp[key] ?? "").trim();
  if (!v) return;
  c.params.push(`%${v}%`);
  c.where.push(`(${cols.map((col) => `${col} ilike $${c.params.length + 1}`).join(" or ")})`);
  c.describe.push(`${label}: “${v}”`);
};
const dateRange = (c: Ctx, sp: Record<string, string | undefined>, col: string, label: string) => {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  const from = (sp.from ?? "").trim(), to = (sp.to ?? "").trim();
  if (iso.test(from)) { c.params.push(from); c.where.push(`${col} >= $${c.params.length + 1}`); c.describe.push(`${label} from ${from}`); }
  if (iso.test(to)) { c.params.push(to); c.where.push(`${col} <= $${c.params.length + 1}`); c.describe.push(`${label} to ${to}`); }
};

export const DATASETS: Record<string, ExportDataset> = {
  customers: {
    title: "Customers",
    permission: "customer.view",
    columns: [
      { header: "Code", key: "code", weight: 0.7, width: 12 },
      { header: "Trade name", key: "trade_name", weight: 1.6, width: 30 },
      { header: "Legal name", key: "legal_name", weight: 1.6, width: 30 },
      { header: "TRN", key: "trn", weight: 1, width: 18 },
      { header: "Emirate", key: "emirate", weight: 0.8, width: 14 },
      { header: "Type", key: "customer_type", weight: 0.8, width: 14 },
      { header: "Sites", key: "branches", weight: 0.5, width: 8, align: "right" },
      { header: "Status", key: "status", weight: 0.6, width: 12 },
    ],
    build: (sp) => {
      const c = mk("cu");
      like(c, sp, "q", ["cu.trade_name", "cu.legal_name", "cu.code"], "name or code");
      eq(c, sp, "emirate", "cu.emirate");
      eq(c, sp, "type", "cu.customer_type", "type");
      if (sp.archived !== "1") c.where.push("cu.archived_at is null");
      else c.describe.push("including archived");
      return c;
    },
    sql: (w) => `
      select cu.code, cu.trade_name, cu.legal_name, cu.trn, cu.emirate, cu.customer_type,
             (select count(*)::int from customer_branches b where b.customer_id = cu.id) as branches,
             case when cu.archived_at is null then 'active' else 'archived' end as status
        from customers cu where ${w} order by cu.trade_name nulls last`,
  },

  contracts: {
    title: "Contracts",
    permission: "contract.view",
    columns: [
      { header: "Contract", key: "contract_number", weight: 1, width: 18 },
      { header: "Customer", key: "customer", weight: 1.8, width: 30 },
      { header: "Division", key: "service_line", weight: 1, width: 20 },
      { header: "Status", key: "lifecycle_status", weight: 0.8, width: 14 },
      { header: "Start", key: "start_date", weight: 0.8, width: 12 },
      { header: "End", key: "end_date", weight: 0.8, width: 12 },
      { header: "Visits", key: "visits", weight: 0.5, width: 8, align: "right" },
      { header: "Value (AED)", key: "contract_value", weight: 0.9, width: 14, align: "right" },
    ],
    build: (sp) => {
      const c = mk("ct");
      like(c, sp, "q", ["ct.contract_number", "cu.trade_name"], "contract or customer");
      eq(c, sp, "status", "ct.lifecycle_status", "status");
      dateRange(c, sp, "ct.start_date", "start");
      return c;
    },
    sql: (w) => `
      select ct.contract_number, cu.trade_name as customer, sl.name as service_line,
             ct.lifecycle_status, ct.start_date::text, ct.end_date::text,
             (select count(*)::int from contract_schedule cs where cs.contract_id = ct.id) as visits,
             ct.contract_value::float8 as contract_value
        from contracts ct
        left join customers cu on cu.id = ct.customer_id
        left join service_lines sl on sl.id = ct.service_line_id
       where ${w} order by ct.start_date desc nulls last`,
  },

  jobs: {
    title: "Jobs",
    permission: "job.view",
    columns: [
      { header: "Date", key: "scheduled_date", weight: 0.8, width: 12 },
      { header: "Time", key: "scheduled_start", weight: 0.5, width: 8 },
      { header: "Customer", key: "customer", weight: 1.7, width: 28 },
      { header: "Site", key: "site", weight: 1.2, width: 22 },
      { header: "Division", key: "service_line", weight: 1, width: 18 },
      { header: "Team", key: "technicians", weight: 1.3, width: 24 },
      { header: "Status", key: "status", weight: 0.8, width: 14 },
    ],
    build: (sp) => {
      const c = mk("j");
      like(c, sp, "q", ["cu.trade_name"], "customer");
      eq(c, sp, "status", "j.status", "status");
      dateRange(c, sp, "j.scheduled_date", "scheduled");
      if (sp.unassigned === "1") {
        c.where.push("not exists (select 1 from job_assignments ja where ja.job_id = j.id)");
        c.describe.push("unassigned only");
      }
      return c;
    },
    sql: (w) => `
      select j.scheduled_date::text, to_char(j.scheduled_start,'HH24:MI') as scheduled_start,
             cu.trade_name as customer, b.name as site, sl.name as service_line, j.status,
             (select string_agg(coalesce(t.full_name, t.code), ', ')
                from job_assignments ja join technicians t on t.id = ja.technician_id
               where ja.job_id = j.id) as technicians
        from jobs j
        left join customers cu on cu.id = j.customer_id
        left join customer_branches b on b.id = j.branch_id
        left join service_lines sl on sl.id = j.service_line_id
       where ${w} order by j.scheduled_date desc nulls last, j.scheduled_start nulls last`,
  },

  invoices: {
    title: "Invoices",
    permission: "invoice.view",
    columns: [
      { header: "Invoice", key: "invoice_number", weight: 1, width: 16 },
      { header: "Date", key: "issue_date", weight: 0.8, width: 12 },
      { header: "Customer", key: "customer", weight: 1.8, width: 30 },
      { header: "Status", key: "status", weight: 0.8, width: 12 },
      { header: "Subtotal", key: "subtotal", weight: 0.8, width: 12, align: "right" },
      { header: "VAT", key: "vat_total", weight: 0.7, width: 10, align: "right" },
      { header: "Total", key: "total", weight: 0.8, width: 12, align: "right" },
      { header: "Balance", key: "balance", weight: 0.8, width: 12, align: "right" },
      { header: "Overdue days", key: "days_overdue", weight: 0.7, width: 12, align: "right" },
    ],
    build: (sp) => {
      const c = mk("i");
      like(c, sp, "q", ["i.invoice_number", "cu.trade_name"], "invoice or customer");
      eq(c, sp, "status", "i.status", "status");
      dateRange(c, sp, "i.issue_date", "invoice date");
      if (sp.unpaid === "1") { c.where.push("coalesce(ar.balance,0) > 0"); c.describe.push("unpaid only"); }
      return c;
    },
    sql: (w) => `
      select i.invoice_number, i.issue_date::text, cu.trade_name as customer, i.status,
             i.subtotal::float8, i.vat_total::float8, i.total::float8,
             coalesce(ar.balance,0)::float8 as balance, ar.days_overdue::int
        from invoices i
        left join customers cu on cu.id = i.customer_id
        left join invoice_ar ar on ar.invoice_id = i.id
       where ${w} order by i.issue_date desc nulls last`,
  },

  expenses: {
    title: "Expenses",
    permission: "expense.view",
    columns: [
      { header: "Date", key: "expense_date", weight: 0.8, width: 12 },
      { header: "Category", key: "category", weight: 1.2, width: 20 },
      { header: "Description", key: "description", weight: 2, width: 34 },
      { header: "Technician", key: "technician", weight: 1.2, width: 22 },
      { header: "Approved by", key: "approver", weight: 1.2, width: 22 },
      { header: "Amount", key: "amount", weight: 0.8, width: 12, align: "right" },
      { header: "Status", key: "status", weight: 0.8, width: 12 },
    ],
    build: (sp) => {
      const c = mk("e");
      like(c, sp, "q", ["e.description"], "description");
      eq(c, sp, "status", "e.status", "status");
      dateRange(c, sp, "e.expense_date", "expense date");
      return c;
    },
    sql: (w) => `
      select e.expense_date::text, ec.name as category, e.description,
             coalesce(t.full_name, t.code) as technician, e.approved_by_name as approver,
             e.amount::float8, e.status
        from expenses e
        left join expense_categories ec on ec.id = e.category_id
        left join technicians t on t.id = e.technician_id
       where ${w} order by e.expense_date desc nulls last`,
  },
};

// Run a dataset with the page's own query params. Read through the
// non-privileged RLS role — an export can never see more than the screen.
export async function runExport(
  tenantId: string, key: string, sp: Record<string, string | undefined>,
): Promise<{ title: string; columns: ExportColumn[]; rows: Record<string, unknown>[]; describe: string }> {
  const ds = DATASETS[key];
  if (!ds) throw new Error(`Unknown dataset: ${key}`);
  const { where, params, describe } = ds.build(sp);
  const { rows } = await scopedRead(tenantId, ds.sql(where.join(" and ")), [tenantId, ...params]);
  return {
    title: ds.title, columns: ds.columns, rows: rows as Record<string, unknown>[],
    describe: describe.length ? describe.join(" · ") : "no filters",
  };
}
