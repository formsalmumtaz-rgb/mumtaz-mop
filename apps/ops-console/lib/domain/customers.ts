import "server-only";
import { scopedRead } from "../rls";
import { withTenantTx } from "./tx";
import { audit } from "./audit";
import type { ListParams } from "../list";

export interface Customer {
  required_info?: string | null;
  reconciliation_note?: string | null;
  reconciled_to_code?: string | null;
  place_of_supply?: string | null;
  contact_person?: string | null;
  whatsapp?: string | null;
  id: string;
  code: string | null;
  legal_name: string | null;
  trade_name: string | null;
  trn: string | null;
  trade_license: string | null;
  customer_type: string | null;
  emirate: string | null;
  is_assumed: boolean;
  is_active: boolean;
  archived_at?: string | null;
}

export interface CustomerInput {
  legal_name?: string;
  trade_name?: string;
  trn?: string;
  trade_license?: string;
  customer_type?: string; // '', 'B2B', 'B2G', 'B2C'
  emirate?: string;
  // Run 8: the rest of what the business needs to serve, bill and route a
  // customer. All optional — blank stays blank, nothing is invented.
  alias_name?: string;
  industry_category_id?: string;
  municipality_category_id?: string;
  trade_licence_no?: string;
  tl_expiry?: string;             // feeds the document-expiry engine, not a column
  contact_person?: string;
  contact_designation?: string;
  whatsapp?: string;
  preferred_shift?: string;       // day | night
  preferred_language?: string;    // EN | AR
  payment_terms?: string;         // cash_on_service | net_15 | net_30
  billing_frequency?: string;     // per_visit | monthly | quarterly | annual
  referred_by?: string;
  access_notes?: string;
  place_of_supply?: string;
  district?: string;
  po_box?: string;
  priority?: string;
  night_shift_service?: string;   // 'yes' | 'no' | ''
}

// The extended columns, written the same way by create and update so the two
// paths cannot drift. Order matters only in that it matches EXT_COLS.
const EXT_COLS = [
  "alias_name", "industry_category_id", "municipality_category_id", "trade_licence_no",
  "contact_person", "contact_designation", "whatsapp", "preferred_shift", "preferred_language",
  "payment_terms", "billing_frequency", "referred_by", "access_notes",
  "place_of_supply", "district", "po_box", "priority",
] as const;
// Night shift is a boolean column, so it is written separately from the text set.
const nightShift = (v?: string): boolean | null =>
  v === "yes" ? true : v === "no" ? false : null;
const UUID_COLS = new Set(["industry_category_id", "municipality_category_id"]);
const extValues = (d: CustomerInput): (string | null)[] =>
  EXT_COLS.map((k) => clean(d[k as keyof CustomerInput] as string | undefined));

const clean = (v?: string) => {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
};

// Active (non-archived) customers for dropdowns/pickers.
export async function listCustomers(tenantId: string, search?: string): Promise<Customer[]> {
  const term = (search ?? "").trim();
  const { rows } = await scopedRead(tenantId,
    `select id, code, legal_name, trade_name, trn, trade_license, customer_type, emirate, is_assumed, is_active, archived_at::text
       from customers
      where tenant_id = $1 and archived_at is null
        and ($2 = '' or trade_name ilike '%'||$2||'%' or legal_name ilike '%'||$2||'%' or code ilike '%'||$2||'%')
      order by created_at desc`,
    [tenantId, term],
  );
  return rows as Customer[];
}

// Paginated list for the customers page: search + include-archived + total count.
export async function listCustomersPaged(tenantId: string, p: ListParams): Promise<{ rows: Customer[]; total: number }> {
  const where = `where tenant_id = $1
        and ($2 = '' or trade_name ilike '%'||$2||'%' or legal_name ilike '%'||$2||'%' or code ilike '%'||$2||'%')
        and ($3 or archived_at is null)`;
  const { rows } = await scopedRead(tenantId,
    `select id, code, legal_name, trade_name, trn, trade_license, customer_type, emirate, is_assumed, is_active, archived_at::text
       from customers ${where}
      order by archived_at nulls first, created_at desc
      limit $4 offset $5`,
    [tenantId, p.q, p.includeArchived, p.pageSize, p.offset],
  );
  const { rows: cnt } = await scopedRead(tenantId, `select count(*)::int n from customers ${where}`, [tenantId, p.q, p.includeArchived]);
  return { rows: rows as Customer[], total: cnt[0].n as number };
}

export async function archiveCustomer(tenantId: string, id: string): Promise<void> {
  await withTenantTx(tenantId, async (c) => {
    const r = await c.query(`update customers set archived_at=now(), archived_by=app_current_actor() where id=$1 and tenant_id=$2 and archived_at is null returning id`, [id, tenantId]);
    if (r.rowCount) await audit(c, tenantId, { table: "customers", rowId: id, action: "update", newValue: { archived: true }, note: "customer archived" });
  });
}

export async function restoreCustomer(tenantId: string, id: string): Promise<void> {
  await withTenantTx(tenantId, async (c) => {
    const r = await c.query(`update customers set archived_at=null, archived_by=null where id=$1 and tenant_id=$2 and archived_at is not null returning id`, [id, tenantId]);
    if (r.rowCount) await audit(c, tenantId, { table: "customers", rowId: id, action: "update", newValue: { archived: false }, note: "customer restored" });
  });
}

export async function getCustomer(tenantId: string, id: string): Promise<Customer | null> {
  const { rows } = await scopedRead(tenantId, 
    `select id, code, legal_name, trade_name, trn, trade_license, customer_type, emirate, is_assumed, is_active,
            required_info, reconciliation_note, place_of_supply, contact_person, whatsapp,
            (select r.code from customers r where r.id = c.reconciled_to_customer_id) as reconciled_to_code
       from customers c where id = $1 and tenant_id = $2`,
    [id, tenantId],
  );
  return (rows[0] as Customer) ?? null;
}

export async function createCustomer(
  tenantId: string,
  serviceLineId: string,
  data: CustomerInput,
): Promise<string> {
  return withTenantTx(tenantId, async (c) => {
    // Account numbers are permanent and never reused (Art. VII; DECISIONS §12).
    // The scheme is the master file's 5-digit number, digit 0 never used, and the
    // rule lives in fn_next_account_no (migration 097) rather than being restated
    // here — this is one of three call sites and they used to drift.
    const { rows: seq } = await c.query(`select fn_next_account_no($1) as code`, [tenantId]);
    const code = seq[0].code as string;
    const extCast = EXT_COLS.map((k, i) => `$${10 + i}${UUID_COLS.has(k) ? "::uuid" : ""}`).join(",");
    const { rows } = await c.query(
      `insert into customers
         (tenant_id, service_line_id, code, legal_name, trade_name, trn, trade_license, customer_type, emirate, is_assumed,
          ${EXT_COLS.join(", ")}, night_shift_service)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,false, ${extCast}, $${10 + EXT_COLS.length}::boolean)
       returning id`,
      [tenantId, serviceLineId, code, clean(data.legal_name), clean(data.trade_name), clean(data.trn),
       clean(data.trade_license), clean(data.customer_type), clean(data.emirate), ...extValues(data),
       nightShift(data.night_shift_service)],
    );
    // A trade licence with an expiry becomes a monitored document, so it lands in
    // the SAME expiry engine as vehicle and staff papers — one reminder path.
    const tlExpiry = clean(data.tl_expiry);
    if (tlExpiry) {
      await c.query(
        `insert into monitored_documents (tenant_id, service_line_id, kind, title, customer_id, expiry_date, notes)
         values ($1,$2,'customer_document',$3,$4,$5::date,'Trade licence — captured on customer registration')`,
        [tenantId, serviceLineId, `Trade licence ${clean(data.trade_licence_no) ?? ""}`.trim(), rows[0].id, tlExpiry]);
    }
    await audit(c, tenantId, {
      table: "customers", rowId: rows[0].id, action: "insert",
      newValue: { code, ...data }, note: "created in admin console",
    });
    return rows[0].id as string;
  });
}

export async function updateCustomer(tenantId: string, id: string, data: CustomerInput): Promise<void> {
  await withTenantTx(tenantId, async (c) => {
    const { rows } = await c.query(
      `select legal_name, trade_name, trn, trade_license, customer_type, emirate
         from customers where id = $1 and tenant_id = $2 for update`,
      [id, tenantId],
    );
    if (!rows[0]) throw new Error("Customer not found");
    const extSet = EXT_COLS.map((k, i) => `${k}=$${7 + i}${UUID_COLS.has(k) ? "::uuid" : ""}`).join(", ");
    await c.query(
      `update customers set legal_name=$1, trade_name=$2, trn=$3, trade_license=$4,
              customer_type=$5, emirate=$6, is_assumed=false, ${extSet}
        where id=$${7 + EXT_COLS.length}`,
      [clean(data.legal_name), clean(data.trade_name), clean(data.trn), clean(data.trade_license),
       clean(data.customer_type), clean(data.emirate), ...extValues(data), id],
    );
    await audit(c, tenantId, {
      table: "customers", rowId: id, action: "update",
      oldValue: rows[0], newValue: data, note: "edited in admin console",
    });
  });
}

export async function confirmCustomer(tenantId: string, id: string): Promise<void> {
  await withTenantTx(tenantId, async (c) => {
    const { rows } = await c.query(`select is_assumed from customers where id=$1 and tenant_id=$2 for update`, [id, tenantId]);
    if (!rows[0] || !rows[0].is_assumed) return;
    await c.query(`update customers set is_assumed=false, confirmed_at=now() where id=$1`, [id]);
    await audit(c, tenantId, { table: "customers", rowId: id, action: "confirm", oldValue: { is_assumed: true }, newValue: { is_assumed: false } });
  });
}

// Release 1 item 3 — the customer profile previously showed no money and no visit
// history. One consolidated activity reader: outstanding balance, recent invoices,
// recent receipts, visit history (jobs + their service reports). Pure joins of data
// already in the DB, via scopedRead (RLS live).
export interface CustomerActivity {
  outstanding: number;
  invoices: { id: string; invoice_number: string | null; status: string; issue_date: string | null; total: number; open_amount: number }[];
  receipts: { id: string; receipt_number: string | null; receipt_date: string | null; method: string | null; amount: number; reversed: boolean }[];
  visits: { id: string; scheduled_date: string | null; status: string; service_type: string | null; branch: string | null;
            report_id: string | null; report_number: string | null; report_approved: string | null }[];
}

export async function getCustomerActivity(tenantId: string, customerId: string): Promise<CustomerActivity> {
  const [inv, rcp, vis] = await Promise.all([
    // invoice_ar is the authoritative AR view (mig 035/042): balance nets non-reversed
    // receipt allocations; payment_status/days_overdue come with it.
    scopedRead(tenantId,
      `select ar.invoice_id as id, ar.invoice_number, ar.status, ar.issue_date::text as issue_date,
              ar.total::numeric as total, ar.balance::numeric as open_amount
         from invoice_ar ar
        where ar.tenant_id = $1 and ar.customer_id = $2 and ar.status <> 'cancelled'
        order by ar.issue_date desc nulls last, ar.invoice_id desc limit 12`,
      [tenantId, customerId]),
    scopedRead(tenantId,
      `select r.id, r.receipt_number, r.receipt_date::text as receipt_date, r.method,
              r.amount::numeric as amount,
              exists (select 1 from receipt_reversals rr where rr.receipt_id = r.id) as reversed
         from receipts r
        where r.tenant_id = $1 and r.customer_id = $2
        order by r.receipt_date desc nulls last, r.created_at desc limit 12`,
      [tenantId, customerId]),
    scopedRead(tenantId,
      `select j.id, j.scheduled_date::text as scheduled_date, j.status,
              st.name as service_type, b.name as branch,
              sr.id as report_id, sr.report_number,
              (select rv.action from service_report_reviews rv
                where rv.service_report_id = sr.id order by rv.created_at desc limit 1) as report_approved
         from jobs j
         left join service_types st on st.id = j.service_type_id
         left join customer_branches b on b.id = j.branch_id
         left join service_reports sr on sr.job_id = j.id
        where j.tenant_id = $1 and j.customer_id = $2
        order by j.scheduled_date desc nulls last, j.created_at desc limit 25`,
      [tenantId, customerId]),
  ]);
  const outstanding = (inv.rows as { open_amount: string; status: string }[])
    .filter((r) => r.status === "issued")
    .reduce((s, r) => s + Number(r.open_amount), 0);
  return {
    outstanding,
    invoices: inv.rows.map((r: Record<string, unknown>) => ({ ...r, total: Number(r.total), open_amount: Number(r.open_amount) })) as CustomerActivity["invoices"],
    receipts: rcp.rows.map((r: Record<string, unknown>) => ({ ...r, amount: Number(r.amount) })) as CustomerActivity["receipts"],
    visits: vis.rows as CustomerActivity["visits"],
  };
}

// Flow items 6+7 — shared by the survey and estimate creation flows.
// Inline "new customer" creates a REAL customer through the exact same path as
// the full form (same code sequence, same audit), and reports what it made so
// the screen can say so. The default site is inherited automatically: if the
// customer has exactly one active branch, that is the site — never re-asked.
export interface ResolvedCustomer { id: string; created: boolean; code: string | null; name: string | null }

export async function resolveOrCreateInlineCustomer(
  tenantId: string, serviceLineId: string, fd: FormData,
): Promise<ResolvedCustomer> {
  const existing = String(fd.get("customer_id") ?? "").trim();
  if (existing) {
    const { rows } = await scopedRead(tenantId,
      `select code, coalesce(trade_name, legal_name) as name from customers where id = $1 and tenant_id = $2`,
      [existing, tenantId]);
    return { id: existing, created: false, code: rows[0]?.code ?? null, name: rows[0]?.name ?? null };
  }
  const name = String(fd.get("new_customer_name") ?? "").trim();
  if (!name) throw new Error("Pick a customer or enter a new customer name");

  const str = (k: string) => String(fd.get(k) ?? "").trim();
  // Item 2 — the contact person is mandatory, and the form marks it so. Checked
  // HERE as well, because the form is not the boundary: a customer with nobody
  // to ring is a name that cannot be acted on, and it is far cheaper to refuse
  // it now than to chase it after a technician is already at the door.
  const contactName = str("new_contact_name");
  const contactPhone = str("new_contact_phone") || str("new_customer_phone");
  const contactEmail = str("new_contact_email");
  const missing = [!contactName && "contact person name", !contactPhone && "contact phone",
                   !contactEmail && "contact email"].filter(Boolean);
  if (missing.length) {
    throw new Error(`A new customer needs ${missing.join(", ")} — those are the details someone will need to reach them.`);
  }

  // The geocode's emirate beats the dropdown: it came from the actual pin, and
  // the dropdown is a default nobody changed.
  const emirate = str("geocoded_emirate") || str("new_customer_emirate") || "Sharjah";
  const customerId = await createCustomer(tenantId, serviceLineId, {
    trade_name: name,
    customer_type: str("new_customer_type") || "B2B",
    emirate,
  } as CustomerInput);

  const { withRequest } = await import("../rls");
  await withRequest({ tenantId }, async (c) => {
    await c.query(
      `insert into contacts (tenant_id, service_line_id, customer_id, name, phone, email, is_primary, is_assumed, assumed_note)
       values ($1,$2,$3,$4,$5,$6,true,true,'Captured inline at survey/estimate — confirm on the profile')`,
      [tenantId, serviceLineId, customerId, contactName, contactPhone, contactEmail || null]);

    // The ACCOUNTS mailbox is a different thing from the person: invoices go to
    // one, questions about a job go to the other. There is no customers.email
    // column — company addresses live on contacts — so it is a second contact
    // rather than a field quietly dropped on the way in.
    const accountsEmail = str("new_customer_email");
    if (accountsEmail && accountsEmail.toLowerCase() !== contactEmail.toLowerCase()) {
      await c.query(
        `insert into contacts (tenant_id, service_line_id, customer_id, name, email, is_primary, is_assumed, assumed_note)
         values ($1,$2,$3,'Accounts',$4,false,true,'Captured inline at survey/estimate — confirm on the profile')`,
        [tenantId, serviceLineId, customerId, accountsEmail]);
    }

    // Item 2c / item 12 — the pin, stored on the SITE at creation. A job with no
    // site pin is a technician outside a building they cannot find, and the
    // cheapest moment to have it is now, while someone is looking at the map.
    const lat = Number(str("site_lat")), lng = Number(str("site_lng"));
    const hasPin = Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0);
    const address = str("site_address") || str("new_customer_address") || null;
    const facilityTypeId = str("new_facility_type_id") || null;
    await c.query(
      `insert into customer_branches
         (tenant_id, service_line_id, customer_id, name, address, emirate, facility_type_id, location, is_active)
       values ($1,$2,$3,'Main site',$4,$5,$6::uuid,
               case when $7::boolean then ST_SetSRID(ST_MakePoint($9::float8, $8::float8), 4326)::geography end,
               true)`,
      [tenantId, serviceLineId, customerId, address, emirate, facilityTypeId, hasPin, lat || null, lng || null]);
  });

  const { rows } = await scopedRead(tenantId,
    `select code from customers where id = $1 and tenant_id = $2`, [customerId, tenantId]);
  return { id: customerId, created: true, code: rows[0]?.code ?? null, name };
}

// The customer's default site: their only active branch (most customers have
// exactly one). Ambiguous (0 or 2+) → null, the caller leaves it unset.
export async function defaultBranchId(tenantId: string, customerId: string): Promise<string | null> {
  const { rows } = await scopedRead(tenantId,
    `select id from customer_branches where tenant_id = $1 and customer_id = $2 and is_active limit 2`,
    [tenantId, customerId]);
  return rows.length === 1 ? rows[0].id : null;
}

// ── REQUIRED_INFO: the flags that complete a record through daily use ────────
// The master file recorded, per customer, what it could NOT tell us — "ASK: EMAIL;
// ASK: PHONE/MOBILE". 555 of the 599 live customers carry at least one. Rather
// than a data-cleanup project, the profile asks for exactly those fields the first
// time anyone opens the customer, and each answer clears its own flag.
export interface RequiredFlag { token: string; label: string; fields: string[]; }

const FLAG_MAP: { match: RegExp; label: string; fields: string[] }[] = [
  { match: /^ASK:\s*EMAIL$/i,                    label: "Email address",            fields: ["contact_email"] },
  { match: /^ASK:\s*PHONE\/MOBILE$/i,            label: "Phone or mobile",          fields: ["contact_phone", "contact_mobile"] },
  { match: /^ASK:\s*TRN$/i,                      label: "Tax registration number",  fields: ["trn"] },
  { match: /^ASK:\s*ADDRESS$/i,                  label: "Address",                  fields: ["site_address"] },
  { match: /^ASK:\s*EMIRATE\/PLACE_OF_SUPPLY$/i, label: "Emirate / place of supply", fields: ["emirate", "place_of_supply"] },
  { match: /^ASK:\s*LOCATION_PIN$/i,             label: "Map pin",                  fields: [] },
  { match: /^ASK:\s*NAME$/i,                     label: "Customer name",            fields: ["trade_name"] },
];

// Parse the stored string into flags. An unrecognised flag — the free-text
// questions reconciliation writes, e.g. "ASK: which legacy record …" — is kept and
// shown as a question to answer, never silently dropped.
export function parseRequiredInfo(raw: string | null | undefined): RequiredFlag[] {
  return (raw ?? "").split(";").map((t) => t.trim()).filter(Boolean).map((token) => {
    const hit = FLAG_MAP.find((f) => f.match.test(token));
    return hit
      ? { token, label: hit.label, fields: hit.fields }
      : { token, label: token.replace(/^ASK:\s*/i, ""), fields: [] };
  });
}

// Remove the flags the office has just answered. Everything not named survives —
// answering "email" must never quietly clear "TRN".
export async function clearRequiredFlags(
  tenantId: string, customerId: string, answered: string[],
): Promise<void> {
  if (!answered.length) return;
  await withTenantTx(tenantId, async (c) => {
    const { rows } = await c.query(
      `select required_info from customers where id=$1 and tenant_id=$2 for update`, [customerId, tenantId]);
    const remaining = parseRequiredInfo(rows[0]?.required_info)
      .filter((f) => !answered.includes(f.token))
      .map((f) => f.token);
    await c.query(
      `update customers set required_info = nullif($2,''), updated_at = now() where id=$1`,
      [customerId, remaining.join("; ")]);
    await audit(c, tenantId, {
      table: "customers", rowId: customerId, action: "update",
      oldValue: { required_info: rows[0]?.required_info }, newValue: { required_info: remaining.join("; ") || null },
      note: `captured on the customer profile: ${answered.join("; ")}`,
    });
  });
}
