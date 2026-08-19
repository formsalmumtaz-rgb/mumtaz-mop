import "server-only";
import type { PoolClient } from "pg";
import { scopedRead } from "../rls";
import { withTenantTx } from "./tx";
import { audit } from "./audit";

// Bulk customer import (Art. VII §5). CSV → staging → validation → dry-run
// report → owner approval → commit. Live tables are NEVER written by an upload;
// the commit step is a separate, explicit action, and it inserts the same way
// the CLI importer does, so a batch staged from the browser and a batch staged
// from the /merge CSVs commit identically.

export interface BatchSummary {
  id: string; kind: string; source: string; status: string;
  created_at: string; committed_at: string | null;
  customers: number; clean: number; held: number; rejected: number; matched: number;
}

export async function listImportBatches(tenantId: string): Promise<BatchSummary[]> {
  const { rows } = await scopedRead(tenantId,
    `select b.id, b.kind, b.source, b.status, b.created_at::text, b.committed_at::text,
            count(s.id)::int as customers,
            count(*) filter (where s.disposition='clean')::int as clean,
            count(*) filter (where s.disposition='held')::int as held,
            count(*) filter (where s.disposition='rejected')::int as rejected,
            count(*) filter (where s.disposition in ('matched_live','committed'))::int as matched
       from import_batches b
       left join staging_customers s on s.batch_id = b.id
      where b.tenant_id = $1
      group by b.id order by b.created_at desc`, [tenantId]);
  return rows as BatchSummary[];
}

export interface BatchDetail {
  batch: { id: string; kind: string; source: string; status: string; created_at: string; committed_at: string | null; report: unknown };
  breakdown: { table: string; disposition: string; reason: string; n: number }[];
  rows: { source_row_id: string; name: string | null; trn: string | null; emirate: string | null; disposition: string; reason: string | null }[];
}

export async function getImportBatch(tenantId: string, id: string): Promise<BatchDetail | null> {
  const { rows: b } = await scopedRead(tenantId,
    `select id, kind, source, status, created_at::text, committed_at::text, report
       from import_batches where tenant_id=$1 and id=$2`, [tenantId, id]);
  if (!b[0]) return null;
  const breakdown: BatchDetail["breakdown"] = [];
  for (const [tbl, label] of [["staging_customers", "customers"], ["staging_contacts", "contacts"],
                              ["staging_branches", "sites"], ["staging_contracts", "contracts"]] as const) {
    const { rows } = await scopedRead(tenantId,
      `select disposition, coalesce(reason,'') as reason, count(*)::int as n
         from ${tbl} where tenant_id=$1 and batch_id=$2 group by 1,2 order by 1, 3 desc`, [tenantId, id]);
    for (const r of rows as { disposition: string; reason: string; n: number }[]) {
      breakdown.push({ table: label, ...r });
    }
  }
  const { rows: sample } = await scopedRead(tenantId,
    `select source_row_id, coalesce(trade_name, legal_name) as name, trn, emirate, disposition, reason
       from staging_customers where tenant_id=$1 and batch_id=$2
      order by case disposition when 'rejected' then 0 when 'held' then 1 when 'clean' then 2 else 3 end,
               source_row_id
      limit 400`, [tenantId, id]);
  return { batch: b[0] as BatchDetail["batch"], breakdown, rows: sample as BatchDetail["rows"] };
}

// ── CSV parsing (RFC4180-ish: quotes, embedded commas and newlines) ──────────
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", inQuotes = false;
  const src = text.replace(/^﻿/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += ch;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

// Customer_Master_v2 column set. The importer maps BY HEADER NAME, so the owner
// can reorder columns, omit any of them, or add their own — unknown headers are
// reported, never silently dropped. Aliases exist because the master file uses
// the business's own names (ACCOUNT_NO, CUSTOMER_NAME) and the form uses ours.
export const IMPORT_TEMPLATE_COLUMNS = [
  "account_no", "customer_name", "legal_name", "alias", "customer_group",
  "customer_type", "industry_category", "municipality_category",
  "legacy_codes", "contract_numbers", "contract_sl_nos",
  "emirate", "place_of_supply", "district", "address", "po_box",
  "contact_person", "designation", "email", "phone", "mobile", "whatsapp",
  "trn", "trade_licence_no", "tl_expiry",
  "preferred_shift", "preferred_language", "payment_terms", "billing_frequency",
  "priority", "referred_by", "access_notes",
  "latitude", "longitude", "location_source", "location_status",
  "required_info", "notes",
] as const;

// Header aliases → canonical column. Lets the master file import unchanged.
const HEADER_ALIASES: Record<string, string> = {
  source_row_id: "account_no", account_number: "account_no",
  trade_name: "customer_name", name: "customer_name",
  alias_name: "alias", group: "customer_group", group_name: "customer_group",
  trade_licence_number: "trade_licence_no", trade_license: "trade_licence_no",
  trade_licence_expiry: "tl_expiry", licence_expiry: "tl_expiry",
  contact_name: "contact_person", contact_designation: "designation",
  contact_email: "email", contact_phone: "phone", contact_mobile: "mobile",
  site_address: "address", site_name: "branch_name", remarks: "notes",
  maps_link_coords: "maps_link", lat: "latitude", lng: "longitude",
};
const canonical = (h: string): string => HEADER_ALIASES[h] ?? h;

export function importTemplateCsv(): string {
  const example: Record<string, string> = {
    account_no: "11828", customer_name: "Al Noor Supermarket", legal_name: "Al Noor Trading LLC",
    alias: "Noor Super", customer_group: "AL NOOR GROUP", customer_type: "B2B",
    industry_category: "retail", municipality_category: "foodstuffs",
    legacy_codes: "004", contract_numbers: "1234/26", contract_sl_nos: "12",
    emirate: "Sharjah", place_of_supply: "Sharjah", district: "Industrial Area 12",
    address: "Shop 4, Industrial Area 12, Sharjah", po_box: "12345",
    contact_person: "Mr Ahmed", designation: "Manager", email: "ahmed@alnoor.ae",
    phone: "065654466", mobile: "0501234567", whatsapp: "0501234567",
    trn: "100123456700003", trade_licence_no: "546486", tl_expiry: "31/12/2026",
    preferred_shift: "night", preferred_language: "EN", payment_terms: "net_30",
    billing_frequency: "monthly", priority: "High", referred_by: "Walk-in",
    access_notes: "Ask for the store manager; park behind the building",
    latitude: "25.3245", longitude: "55.4012",
    location_source: "CONTRACT_MASTER", location_status: "VERIFIED",
    required_info: "", notes: "",
  };
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const header = IMPORT_TEMPLATE_COLUMNS.join(",");
  const row = IMPORT_TEMPLATE_COLUMNS.map((c) => esc(example[c] ?? "")).join(",");
  return `${header}\n${row}\n`;
}

const nul = (v: string | undefined) => {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
};

// Stage an uploaded customer CSV and validate it. Writes ONLY staging tables.
// The validation rules are the same ones the CLI importer applies: never guess a
// duplicate, never import a malformed TRN, never invent a name.
export async function stageCustomerCsv(
  tenantId: string, csvText: string, source: string,
): Promise<{ batchId: string; staged: number; unknownColumns: string[] }> {
  const grid = parseCsv(csvText);
  if (grid.length < 2) throw new Error("The file has no data rows.");
  const header = grid[0].map((h) => canonical(h.trim().toLowerCase().replace(/\s+/g, "_")));
  const known = new Set<string>(IMPORT_TEMPLATE_COLUMNS as readonly string[]);
  const unknownColumns = header.filter((h) => h && !known.has(h));
  if (!header.includes("customer_name") && !header.includes("legal_name")) {
    throw new Error("The file needs a CUSTOMER_NAME (or LEGAL_NAME) column. Download the template to see the expected columns.");
  }
  const records = grid.slice(1).map((cells) => {
    const o: Record<string, string> = {};
    header.forEach((h, i) => { if (h) o[h] = (cells[i] ?? "").trim(); });
    return o;
  });

  return withTenantTx(tenantId, async (c: PoolClient) => {
    const { rows: b } = await c.query(
      `insert into import_batches (tenant_id, kind, source) values ($1,'customer_master',$2) returning id`,
      [tenantId, source]);
    const batch = b[0].id as string;

    let seq = 0;
    for (const r of records) {
      seq++;
      const rowId = nul(r.account_no) ?? `ROW-${String(seq).padStart(4, "0")}`;
      await c.query(
        `insert into staging_customers
           (tenant_id, batch_id, source_row_id, legal_name, trade_name, trn, trade_licence_number,
            customer_type, emirate, address, po_box, remarks,
            customer_group, industry_category, municipality_category, place_of_supply, district,
            contact_person, designation, email, phone, mobile, whatsapp, tl_expiry,
            preferred_shift, preferred_language, payment_terms, billing_frequency,
            referred_by, access_notes, latitude, longitude, location_source, location_status,
            required_info, notes, contract_numbers, contract_sl_nos, legacy_customer_code, alias_name,
            priority)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,
                 $23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41)
         on conflict (batch_id, source_row_id) do nothing`,
        [tenantId, batch, rowId, nul(r.legal_name), nul(r.customer_name) ?? nul(r.legal_name), nul(r.trn),
         nul(r.trade_licence_no), nul(r.customer_type)?.toUpperCase() ?? null, nul(r.emirate),
         nul(r.address), nul(r.po_box), nul(r.notes),
         nul(r.customer_group), nul(r.industry_category), nul(r.municipality_category),
         nul(r.place_of_supply), nul(r.district),
         nul(r.contact_person), nul(r.designation), nul(r.email), nul(r.phone), nul(r.mobile),
         nul(r.whatsapp), nul(r.tl_expiry),
         nul(r.preferred_shift), nul(r.preferred_language), nul(r.payment_terms), nul(r.billing_frequency),
         nul(r.referred_by), nul(r.access_notes), nul(r.latitude), nul(r.longitude),
         nul(r.location_source), nul(r.location_status), nul(r.required_info), nul(r.notes),
         nul(r.contract_numbers), nul(r.contract_sl_nos), nul(r.legacy_codes), nul(r.alias),
         nul(r.priority)]);
      const phone = nul(r.mobile) ?? nul(r.phone), email = nul(r.email);
      for (const [type, value] of [["phone", phone], ["email", email]] as const) {
        if (!value) continue;
        await c.query(
          `insert into staging_contacts (tenant_id, batch_id, source_row_id, contact_type, value, contact_name, designation)
           values ($1,$2,$3,$4,$5,$6,$7)`,
          [tenantId, batch, rowId, type, value, nul(r.contact_person), nul(r.designation)]);
      }
      if (nul(r.branch_name) || nul(r.address)) {
        await c.query(
          `insert into staging_branches (tenant_id, batch_id, source_row_id, branch_name, address, po_box, emirate)
           values ($1,$2,$3,$4,$5,$6,$7)`,
          [tenantId, batch, rowId, nul(r.branch_name) ?? "Main", nul(r.address),
           nul(r.po_box), nul(r.emirate)]);
      }
    }

    await validateBatch(c, tenantId, batch);
    await audit(c, tenantId, {
      table: "import_batches", rowId: batch, action: "insert",
      newValue: { staged: records.length, source },
      note: "customer CSV staged from the console (no live rows written)",
    });
    return { batchId: batch, staged: records.length, unknownColumns };
  });
}

// Decide the account number every clean row will receive, and store it, so the
// dry-run report the owner approves actually contains the identifier the decision
// is about (Art. VII §5). The commit then copies this column — it never mints.
//
// The rule itself lives in fn_assign_batch_account_numbers (migration 097), not
// here, because the CLI importer must apply exactly the same one. DECISIONS §12 ¶3
// existed because three hand-copied versions of this rule had already drifted.
async function assignAccountNumbers(c: PoolClient, tenantId: string, batch: string): Promise<void> {
  await c.query(`select fn_assign_batch_account_numbers($1, $2)`, [tenantId, batch]);
}

// Blank-field counts per column — required of the dry-run report by Art. VII §5
// and previously missing from it. "Blank means unknown": this is the census of
// what the office still has to find out, and it is what drives REQUIRED_INFO.
const CENSUS_COLUMNS = [
  "legal_name", "trade_name", "alias_name", "trn", "trade_licence_number", "customer_type",
  "emirate", "place_of_supply", "district", "address", "po_box", "priority",
  "contact_person", "designation", "email", "phone", "mobile", "whatsapp",
  "customer_group", "industry_category", "municipality_category", "tl_expiry",
  "preferred_shift", "preferred_language", "payment_terms", "billing_frequency",
  "referred_by", "access_notes", "latitude", "longitude",
  "location_source", "location_status", "required_info", "notes",
  "contract_numbers", "contract_sl_nos", "legacy_customer_code",
] as const;

async function blankCensus(c: PoolClient, batch: string): Promise<Record<string, number>> {
  const cols = CENSUS_COLUMNS.map((k) => `count(*) filter (where ${k} is null)::int as ${k}`).join(", ");
  const { rows } = await c.query(
    `select count(*)::int as total, ${cols} from staging_customers where batch_id=$1`, [batch]);
  return rows[0] as Record<string, number>;
}

// Every distinct group the file names, with its member count and whether a live
// group already carries that name. A near-miss ("SULTAN ALARAB GROUP" against a
// live "Sultan Al Arab") is REPORTED, never auto-merged — Art. X §4: the system
// surfaces the suggestion, a human decides.
async function groupCensus(c: PoolClient, tenantId: string, batch: string) {
  const { rows } = await c.query(
    `with g as (
       select trim(customer_group) as name, count(*)::int as members
         from staging_customers
        where batch_id=$1 and nullif(trim(customer_group),'') is not null
        group by 1
     )
     select g.name, g.members,
            lg.name as live_group,
            (select count(*)::int from customers cu
              where cu.tenant_id=$2 and cu.group_id = lg.id) as live_members
       from g
       left join customer_groups lg
         on lg.tenant_id=$2 and fn_group_key(lg.name) = fn_group_key(g.name)
      order by g.name`, [batch, tenantId]);
  return rows;
}

// Rows sharing a TRN are ONE legal entity with several outlets (a UAE TRN is per
// tax registration). The importer creates them as separate customers — each has
// its own account number in the master file — and reports the clusters here so
// the office can see which customers belong to one company. Collapsing any of
// them into branches of a single customer is a decision, not an inference.
async function entityCensus(c: PoolClient, batch: string) {
  const { rows } = await c.query(
    `select s.trn,
            count(*)::int as outlets,
            string_agg(s.source_row_id || ' ' || coalesce(s.trade_name, s.legal_name), ' · '
                       order by s.source_row_id) as members,
            coalesce(max(nullif(trim(s.customer_group),'')), '') as group_name,
            bool_or(s.disposition = 'held') as any_held
       from staging_customers s
      where s.batch_id=$1 and s.trn ~ '^1[0-9]{14}$'
      group by s.trn having count(*) > 1
      order by count(*) desc, s.trn`, [batch]);
  return rows;
}

// The validation pass — identical rules to scripts/import-merge.ts.
async function validateBatch(c: PoolClient, tenantId: string, batch: string): Promise<void> {
  // Identity is checked strongest-first. Under DECISIONS §12 the account number IS
  // the customer's permanent identifier, so a row whose ACCOUNT_NO already exists
  // live is that customer — this runs before source_ref, TRN and name.
  await c.query(
    `update staging_customers s set disposition='matched_live', reason='matched a live customer (account number)', matched_customer_id=cu.id
       from customers cu
      where s.batch_id=$1 and s.disposition='pending' and s.source_row_id ~ '^[1-9]{5}$'
        and cu.tenant_id=s.tenant_id and cu.code = s.source_row_id`, [batch]);
  await c.query(
    `update staging_customers s set disposition='matched_live', reason='already imported (source reference)', matched_customer_id=cu.id
       from customers cu
      where s.batch_id=$1 and s.disposition='pending' and cu.tenant_id=s.tenant_id and cu.source_ref = s.source_row_id`, [batch]);
  await c.query(
    `update staging_customers s set disposition='matched_live', reason='matched a live customer (TRN)', matched_customer_id=cu.id
       from customers cu
      where s.batch_id=$1 and s.disposition='pending' and s.trn ~ '^1[0-9]{14}$'
        and cu.tenant_id=s.tenant_id and cu.trn = s.trn`, [batch]);

  await c.query(
    `update staging_customers set disposition='rejected', reason='no legal or trade name'
      where batch_id=$1 and disposition='pending' and legal_name is null and trade_name is null`, [batch]);
  // Name matching runs AFTER the nameless rows are rejected, and both sides must
  // be non-empty: '' = '' would otherwise match a nameless row to any live
  // customer that happens to have no trade name.
  await c.query(
    `update staging_customers s set disposition='matched_live', reason='matched a live customer (name)', matched_customer_id=cu.id
       from customers cu
      where s.batch_id=$1 and s.disposition='pending' and cu.tenant_id=s.tenant_id
        and coalesce(s.trade_name, s.legal_name, '') <> ''
        and (lower(coalesce(cu.trade_name,'')) = lower(coalesce(s.trade_name, s.legal_name, ''))
          or lower(coalesce(cu.legal_name,'')) = lower(coalesce(s.legal_name, s.trade_name, '')))`, [batch]);
  // The row wants an account number that a different live customer already holds.
  // Account numbers are permanent (DECISIONS §12 ¶2), so this is never resolved by
  // reassigning the live customer — a human decides which record is which.
  await c.query(
    `update staging_customers s set disposition='held',
            reason='account number ' || s.source_row_id || ' is already held by a different live customer'
      where s.batch_id=$1 and s.disposition='pending' and s.source_row_id ~ '^[1-9]{5}$'
        and exists (select 1 from customers cu where cu.tenant_id=s.tenant_id and cu.code = s.source_row_id
                     and cu.id is distinct from s.matched_customer_id)`, [batch]);
  // The row belongs to a group that ALREADY exists live with customers in it. The
  // import cannot tell whether this row is a NEW outlet of that group or one of
  // the outlets already recorded — and creating it blind would put the same
  // restaurant in the list twice while its contracts stay on the old record.
  // A human maps outlet to record; the system never guesses (Art. X §4).
  await c.query(
    `update staging_customers s set disposition='held',
            reason='group "' || lg.name || '" already exists live with ' || lm.n ||
                   ' customer(s) — confirm whether this is a new outlet or one of them'
       from customer_groups lg
       join lateral (select count(*)::int as n from customers cu
                      where cu.tenant_id = lg.tenant_id and cu.group_id = lg.id) lm on true
      where s.batch_id=$1 and s.disposition='pending'
        and lg.tenant_id = s.tenant_id and lm.n > 0
        and fn_group_key(lg.name) = fn_group_key(s.customer_group)`, [batch]);
  // …and every other outlet of the SAME legal entity goes with it. A shared TRN is
  // one tax registration, so these rows are the same company: they must be mapped
  // as one set, not half imported and half held.
  await c.query(
    `update staging_customers s set disposition='held',
            reason='same legal entity (TRN ' || s.trn || ') as a row held for outlet mapping'
      where s.batch_id=$1 and s.disposition='pending' and s.trn ~ '^1[0-9]{14}$'
        and exists (select 1 from staging_customers o
                     where o.batch_id=s.batch_id and o.id <> s.id
                       and o.trn = s.trn and o.disposition='held'
                       and o.reason like 'group %already exists live%')`, [batch]);
  await c.query(
    `update staging_customers set disposition='held', reason='TRN present but not a valid 15-digit UAE TRN'
      where batch_id=$1 and disposition='pending' and trn is not null and trn !~ '^1[0-9]{14}$'`, [batch]);
  await c.query(
    `update staging_customers s set disposition='held', reason='the same name appears more than once in this file'
      where s.batch_id=$1 and s.disposition='pending' and exists (
        select 1 from staging_customers o where o.batch_id=s.batch_id and o.id<>s.id
          and lower(coalesce(o.trade_name, o.legal_name,'')) = lower(coalesce(s.trade_name, s.legal_name,'')))`, [batch]);
  await c.query(`update staging_customers set disposition='clean', reason=null where batch_id=$1 and disposition='pending'`, [batch]);

  await assignAccountNumbers(c, tenantId, batch);

  await c.query(
    `update staging_contacts sc set disposition = case when s.disposition in ('clean','matched_live') then 'clean' else 'held' end,
            reason = case when s.disposition in ('clean','matched_live') then null else 'customer '||s.disposition end
       from staging_customers s
      where sc.batch_id=$1 and s.batch_id=sc.batch_id and s.source_row_id=sc.source_row_id`, [batch]);
  await c.query(
    `update staging_branches sb set disposition = case when s.disposition in ('clean','matched_live') then 'clean' else 'held' end,
            reason = case when s.disposition in ('clean','matched_live') then null else 'customer '||s.disposition end
       from staging_customers s
      where sb.batch_id=$1 and s.batch_id=sb.batch_id and s.source_row_id=sb.source_row_id`, [batch]);

  const rep: Record<string, unknown> = {};
  for (const [tbl, key] of [["staging_customers", "customers"], ["staging_contacts", "contacts"],
                            ["staging_branches", "branches"], ["staging_contracts", "contracts"]] as const) {
    const { rows } = await c.query(
      `select disposition, coalesce(reason,'') as reason, count(*)::int as n
         from ${tbl} where batch_id=$1 group by 1,2 order by 1,3 desc`, [batch]);
    rep[key] = rows;
  }
  rep.blank_counts = await blankCensus(c, batch);
  rep.groups = await groupCensus(c, tenantId, batch);
  rep.legal_entities = await entityCensus(c, batch);
  const { rows: codes } = await c.query(
    `select count(*) filter (where assigned_code is not null)::int as assigned,
            min(assigned_code) as lowest, max(assigned_code) as highest,
            count(*) filter (where assigned_code is not null and assigned_code <> source_row_id)::int as minted
       from staging_customers where batch_id=$1`, [batch]);
  rep.account_numbers = codes[0];
  await c.query(`update import_batches set status='validated', report=$2 where id=$1`, [batch, JSON.stringify(rep)]);
}

// Commit the CLEAN rows of a validated batch. Held, rejected and already-matched
// rows are never written. Account numbers are system-assigned and never reused.
export async function commitImportBatch(
  tenantId: string, batchId: string,
): Promise<{ customers: number; sites: number; contacts: number; contracts: number; grouped: number }> {
  return withTenantTx(tenantId, async (c: PoolClient) => {
    const { rows: b } = await c.query(
      `select id, status from import_batches where tenant_id=$1 and id=$2 for update`, [tenantId, batchId]);
    if (!b[0]) throw new Error("Batch not found");
    if (b[0].status !== "validated") throw new Error(`This batch is ${b[0].status} — only a validated batch can be committed`);
    await c.query("set local statement_timeout = '600000'");
    const { rows: sl } = await c.query(
      `select id from service_lines where tenant_id=$1 order by case when code='pest_control' then 0 else 1 end limit 1`, [tenantId]);
    const slId = sl[0]?.id;
    if (!slId) throw new Error("No service line configured");

    const { rows: cust } = await c.query(
      `with ins as (
         insert into customers (tenant_id, service_line_id, code, legal_name, trade_name, trn, trade_license,
                                customer_type, emirate, source_ref, legacy_code, is_assumed, assumed_note, attributes,
                                alias_name, place_of_supply, district, po_box, priority,
                                contact_person, contact_designation, whatsapp,
                                preferred_shift, preferred_language, payment_terms, billing_frequency,
                                referred_by, access_notes, trade_licence_no,
                                location_source, location_status, required_info, notes,
                                industry_category_id, municipality_category_id)
         -- The account number was decided and shown at validation (DECISIONS §12).
         -- The commit copies it; it does not mint, so what the owner approved is
         -- exactly what lands.
         select $1, $2, s.assigned_code,
                s.legal_name, coalesce(s.trade_name, s.legal_name), s.trn, s.trade_licence_number,
                case when s.customer_type in ('B2B','B2G','B2C') then s.customer_type end,
                s.emirate, s.source_row_id, s.legacy_customer_code,
                true, 'Imported — confirm details',
                jsonb_strip_nulls(jsonb_build_object('address', s.address,
                                                     'contract_numbers', s.contract_numbers,
                                                     'contract_sl_nos', s.contract_sl_nos)),
                s.alias_name, s.place_of_supply, s.district, s.po_box,
                case when s.priority in ('High','Medium','Low') then s.priority end,
                s.contact_person, s.designation, s.whatsapp,
                case when s.preferred_shift in ('day','night') then s.preferred_shift end,
                case when upper(s.preferred_language) in ('EN','AR') then upper(s.preferred_language) end,
                case when s.payment_terms in ('cash_on_service','net_15','net_30') then s.payment_terms end,
                case when s.billing_frequency in ('per_visit','monthly','quarterly','annual') then s.billing_frequency end,
                s.referred_by, s.access_notes, s.trade_licence_number,
                s.location_source,
                case when s.location_status in ('VERIFIED','UNVERIFIED','AREA_APPROX','NO_LOCATION')
                     then s.location_status end,
                s.required_info, s.notes,
                (select ic.id from industry_categories ic
                  where ic.tenant_id = $1 and lower(ic.code) = lower(coalesce(s.industry_category,''))),
                (select mc.id from municipality_categories mc
                  where mc.tenant_id = $1 and lower(mc.code) = lower(coalesce(s.municipality_category,'')))
           from staging_customers s
          where s.batch_id = $3 and s.disposition = 'clean' and s.assigned_code is not null
         returning id, source_ref
       )
       update staging_customers s set live_customer_id = ins.id
         from ins where s.batch_id = $3 and s.source_row_id = ins.source_ref
       returning s.id`, [tenantId, slId, batchId]);

    // Customer groups. The group NAME on each customer row is the authority; the
    // workbook's Groups sheet is a cross-check performed at conversion time. A
    // A group that already exists live is REUSED, reconciled on fn_group_key
    // (migration 098): case, spacing, punctuation and a trailing "GROUP" are not
    // meaning, so the file's "SULTAN ALARAB GROUP" attaches to the live
    // "Sultan Al Arab" instead of creating a near-duplicate beside it. Nothing
    // looser than that is matched — the dry-run report names every reconciliation
    // before the owner approves it.
    await c.query(
      `insert into customer_groups (tenant_id, service_line_id, code, name, is_assumed, assumed_note)
       select $2, $3, g.code, g.name, true, 'Created by customer import — confirm the members'
         from (
           select distinct on (fn_group_key(s.customer_group)) s.customer_group as name,
                  left(regexp_replace(upper(s.customer_group), '[^A-Z0-9]', '', 'g'), 24)
                    || '-' || substr(md5(lower(s.customer_group)), 1, 4) as code
             from staging_customers s
            where s.batch_id=$1 and s.disposition='clean' and nullif(trim(s.customer_group),'') is not null
            order by fn_group_key(s.customer_group), s.source_row_id
         ) g
        where not exists (select 1 from customer_groups x
                           where x.tenant_id=$2 and fn_group_key(x.name) = fn_group_key(g.name))
       on conflict (tenant_id, code) do nothing`, [batchId, tenantId, slId]);
    const { rows: gr } = await c.query(
      `with tgt as (
         select source_row_id, customer_group, coalesce(live_customer_id, matched_customer_id) as cid
           from staging_customers
          where batch_id=$1 and nullif(trim(customer_group),'') is not null
            and coalesce(live_customer_id, matched_customer_id) is not null
       ), upd as (
         update customers cu set group_id = g.id
           from tgt join customer_groups g
             on g.tenant_id=$2 and fn_group_key(g.name) = fn_group_key(tgt.customer_group)
          where cu.id = tgt.cid and cu.tenant_id=$2 and cu.group_id is null
         returning 1
       ) select count(*)::int as n from upd`, [batchId, tenantId]);

    const { rows: br } = await c.query(
      `with tgt as (
         select source_row_id, coalesce(live_customer_id, matched_customer_id) as cid
           from staging_customers where batch_id=$1 and coalesce(live_customer_id, matched_customer_id) is not null
       ), ins as (
         insert into customer_branches (tenant_id, service_line_id, customer_id, name, address, emirate, access_notes,
                                        is_assumed, assumed_note, location)
         select $2, $3, tgt.cid, coalesce(sb.branch_name,'Main'), sb.address, sb.emirate, sb.access_notes,
                true, 'Imported — confirm and pin the location',
                -- coordinates come from the FILE only. A NO_LOCATION row stays
                -- without a pin: the technician captures it at the door.
                case when sc.latitude ~ '^-?[0-9.]+$' and sc.longitude ~ '^-?[0-9.]+$'
                     then ST_SetSRID(ST_MakePoint(sc.longitude::float8, sc.latitude::float8),4326)::geography end
           from staging_branches sb
           join tgt on tgt.source_row_id = sb.source_row_id
           join staging_customers sc on sc.batch_id = sb.batch_id and sc.source_row_id = sb.source_row_id
          where sb.batch_id=$1 and sb.disposition='clean'
            and not exists (select 1 from customer_branches cb
                             where cb.tenant_id=$2 and cb.customer_id=tgt.cid
                               and lower(coalesce(cb.name,'')) = lower(coalesce(sb.branch_name,'Main'))
                               and coalesce(cb.address,'') = coalesce(sb.address,''))
         returning 1
       ) select count(*)::int as n from ins`, [batchId, tenantId, slId]);
    await c.query(
      `update staging_branches sb set disposition='committed'
        where sb.batch_id=$1 and sb.disposition='clean'
          and exists (select 1 from staging_customers s where s.batch_id=$1 and s.source_row_id=sb.source_row_id
                       and coalesce(s.live_customer_id, s.matched_customer_id) is not null)`, [batchId]);

    const { rows: ct } = await c.query(
      `with tgt as (
         select source_row_id, coalesce(live_customer_id, matched_customer_id) as cid
           from staging_customers where batch_id=$1 and coalesce(live_customer_id, matched_customer_id) is not null
       ), ins as (
         insert into contacts (tenant_id, service_line_id, customer_id, name, phone, email, role, is_assumed, assumed_note)
         select $2, $3, tgt.cid, coalesce(sc.contact_name,'Primary contact'),
                case when sc.contact_type='email' or sc.value like '%@%' then null else sc.value end,
                case when sc.contact_type='email' or sc.value like '%@%' then sc.value end,
                sc.designation, true, 'Imported — confirm'
           from staging_contacts sc join tgt on tgt.source_row_id = sc.source_row_id
          where sc.batch_id=$1 and sc.disposition='clean' and sc.value is not null
            and not exists (select 1 from contacts x where x.tenant_id=$2 and x.customer_id=tgt.cid
                             and (x.phone = sc.value or x.email = sc.value))
         returning 1
       ) select count(*)::int as n from ins`, [batchId, tenantId, slId]);
    await c.query(
      `update staging_contacts sc set disposition='committed'
        where sc.batch_id=$1 and sc.disposition='clean'
          and exists (select 1 from staging_customers s where s.batch_id=$1 and s.source_row_id=sc.source_row_id
                       and coalesce(s.live_customer_id, s.matched_customer_id) is not null)`, [batchId]);

    // Contracts, when the batch carries them (the CLI /merge batches do) — always
    // DRAFT, never auto-activated.
    const { rows: k } = await c.query(
      `with freqmap(norm, code) as (
         values ('MONTHLY_TWICE','monthly_2'), ('MONTHLY_ONCE','monthly_1'), ('MONTHLY','monthly_1'),
                ('QUARTERLY','quarterly'), ('BIMONTHLY','bimonthly'), ('EVERY_TWO_MONTHS','bimonthly')
       ), tgt as (
         select source_row_id, coalesce(live_customer_id, matched_customer_id) as cid
           from staging_customers where batch_id=$1 and coalesce(live_customer_id, matched_customer_id) is not null
       ), ins as (
         insert into contracts (tenant_id, service_line_id, customer_id, contract_number, contract_value, currency,
                                frequency_id, lifecycle_status, start_date, end_date, is_assumed, assumed_note, attributes)
         select $2, $3, tgt.cid, sk.contract_number, sk.amount_incl_vat::numeric, 'AED', f.id, 'draft',
                to_date(sk.start_date_raw,'DD/MM/YYYY'), to_date(sk.end_date_raw,'DD/MM/YYYY'),
                true, 'Imported from a legacy sheet — confirm terms before activation',
                jsonb_strip_nulls(jsonb_build_object('visits_per_year', sk.visits_per_year,
                                                     'location_raw', sk.location_raw, 'frequency_raw', sk.frequency_raw))
           from staging_contracts sk
           join tgt on tgt.source_row_id = sk.linked_source_row_id
           left join freqmap fm on fm.norm = sk.frequency_norm
           left join frequencies f on f.tenant_id = $2 and f.code = fm.code
          where sk.batch_id=$1 and sk.disposition='clean'
            and to_date(sk.end_date_raw,'DD/MM/YYYY') >= to_date(sk.start_date_raw,'DD/MM/YYYY')
            and not exists (select 1 from contracts x where x.tenant_id=$2 and x.contract_number = sk.contract_number)
         returning id, contract_number
       )
       update staging_contracts sk set disposition='committed', live_contract_id = ins.id
         from ins where sk.batch_id=$1 and sk.contract_number = ins.contract_number
       returning sk.id`, [batchId, tenantId, slId]);
    await c.query(
      `update staging_contracts set disposition='held',
              reason = case when to_date(end_date_raw,'DD/MM/YYYY') < to_date(start_date_raw,'DD/MM/YYYY')
                            then 'end date is before the start date'
                            else 'skipped at commit (duplicate contract number or unmatched customer)' end
        where batch_id=$1 and disposition='clean'`, [batchId]);

    const counts = { customers: cust.length, sites: br[0].n as number, contacts: ct[0].n as number,
                     contracts: k.length, grouped: gr[0].n as number };
    await c.query(
      `update import_batches set status='committed', committed_at=now(),
              report = report || jsonb_build_object('committed', $2::jsonb) where id=$1`,
      [batchId, JSON.stringify(counts)]);
    await audit(c, tenantId, {
      table: "import_batches", rowId: batchId, action: "update",
      newValue: counts, note: "import batch committed to live tables",
    });
    return counts;
  });
}

export async function abandonImportBatch(tenantId: string, batchId: string): Promise<void> {
  await withTenantTx(tenantId, async (c: PoolClient) => {
    const { rows } = await c.query(
      `select status from import_batches where tenant_id=$1 and id=$2 for update`, [tenantId, batchId]);
    if (!rows[0]) throw new Error("Batch not found");
    if (rows[0].status === "committed") throw new Error("A committed batch cannot be abandoned — reverse the records instead");
    await c.query(`update import_batches set status='abandoned' where id=$1`, [batchId]);
    await audit(c, tenantId, {
      table: "import_batches", rowId: batchId, action: "update",
      oldValue: { status: rows[0].status }, newValue: { status: "abandoned" },
      note: "import batch abandoned — staged rows kept for the record, nothing written live",
    });
  });
}
