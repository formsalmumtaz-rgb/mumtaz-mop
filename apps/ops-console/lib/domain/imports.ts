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

export const IMPORT_TEMPLATE_COLUMNS = [
  "source_row_id", "legal_name", "trade_name", "trn", "trade_licence_number",
  "customer_type", "emirate", "address", "po_box", "contact_name",
  "contact_phone", "contact_email", "site_name", "site_address", "remarks",
] as const;

export function importTemplateCsv(): string {
  const example = [
    "R-001", "Al Noor Trading LLC", "Al Noor Supermarket", "100123456700003", "546486",
    "B2B", "Sharjah", "Industrial Area 12, Sharjah", "12345", "Mr Ahmed",
    "0501234567", "ahmed@alnoor.ae", "Main Branch", "Industrial Area 12, Sharjah",
    "moved from the old spreadsheet",
  ];
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return `${IMPORT_TEMPLATE_COLUMNS.join(",")}\n${example.map(esc).join(",")}\n`;
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
  const header = grid[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const known = new Set<string>(IMPORT_TEMPLATE_COLUMNS as readonly string[]);
  const unknownColumns = header.filter((h) => h && !known.has(h));
  if (!header.includes("legal_name") && !header.includes("trade_name")) {
    throw new Error("The file needs a legal_name or trade_name column. Download the template to see the expected columns.");
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
      const rowId = nul(r.source_row_id) ?? `ROW-${String(seq).padStart(4, "0")}`;
      await c.query(
        `insert into staging_customers
           (tenant_id, batch_id, source_row_id, legal_name, trade_name, trn, trade_licence_number,
            customer_type, emirate, address, po_box, remarks)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         on conflict (batch_id, source_row_id) do nothing`,
        [tenantId, batch, rowId, nul(r.legal_name), nul(r.trade_name), nul(r.trn),
         nul(r.trade_licence_number), nul(r.customer_type)?.toUpperCase() ?? null, nul(r.emirate),
         nul(r.address), nul(r.po_box), nul(r.remarks)]);
      const phone = nul(r.contact_phone), email = nul(r.contact_email);
      for (const [type, value] of [["phone", phone], ["email", email]] as const) {
        if (!value) continue;
        await c.query(
          `insert into staging_contacts (tenant_id, batch_id, source_row_id, contact_type, value, contact_name)
           values ($1,$2,$3,$4,$5,$6)`,
          [tenantId, batch, rowId, type, value, nul(r.contact_name)]);
      }
      if (nul(r.site_name) || nul(r.site_address)) {
        await c.query(
          `insert into staging_branches (tenant_id, batch_id, source_row_id, branch_name, address, po_box, emirate)
           values ($1,$2,$3,$4,$5,$6,$7)`,
          [tenantId, batch, rowId, nul(r.site_name) ?? "Main", nul(r.site_address) ?? nul(r.address),
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

// The validation pass — identical rules to scripts/import-merge.ts.
async function validateBatch(c: PoolClient, tenantId: string, batch: string): Promise<void> {
  await c.query(
    `update staging_customers s set disposition='matched_live', reason='already imported (source reference)', matched_customer_id=cu.id
       from customers cu
      where s.batch_id=$1 and cu.tenant_id=s.tenant_id and cu.source_ref = s.source_row_id`, [batch]);
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
  await c.query(
    `update staging_customers set disposition='held', reason='TRN present but not a valid 15-digit UAE TRN'
      where batch_id=$1 and disposition='pending' and trn is not null and trn !~ '^1[0-9]{14}$'`, [batch]);
  await c.query(
    `update staging_customers s set disposition='held', reason='the same name appears more than once in this file'
      where s.batch_id=$1 and s.disposition='pending' and exists (
        select 1 from staging_customers o where o.batch_id=s.batch_id and o.id<>s.id
          and lower(coalesce(o.trade_name, o.legal_name,'')) = lower(coalesce(s.trade_name, s.legal_name,'')))`, [batch]);
  await c.query(`update staging_customers set disposition='clean', reason=null where batch_id=$1 and disposition='pending'`, [batch]);

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
  await c.query(`update import_batches set status='validated', report=$2 where id=$1`, [batch, JSON.stringify(rep)]);
}

// Commit the CLEAN rows of a validated batch. Held, rejected and already-matched
// rows are never written. Account numbers are system-assigned and never reused.
export async function commitImportBatch(
  tenantId: string, batchId: string,
): Promise<{ customers: number; sites: number; contacts: number; contracts: number }> {
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
      `with base as (
         select greatest(
                  coalesce(max((substring(code from 'CUST-(\\d+)'))::int), 0),
                  coalesce((select (value #>> '{}')::int - 1 from settings
                             where tenant_id=$1 and key='import.next_customer_code'), 0)
                ) as n
           from customers where tenant_id=$1 and code ~ '^CUST-\\d+$'
       ), ins as (
         insert into customers (tenant_id, service_line_id, code, legal_name, trade_name, trn, trade_license,
                                customer_type, emirate, source_ref, legacy_code, is_assumed, assumed_note, attributes)
         select $1, $2,
                'CUST-' || lpad((base.n + row_number() over (order by s.source_row_id))::text, 4, '0'),
                s.legal_name, coalesce(s.trade_name, s.legal_name), s.trn, s.trade_licence_number,
                case when s.customer_type in ('B2B','B2G','B2C') then s.customer_type end,
                s.emirate, s.source_row_id, s.legacy_customer_code,
                true, 'Imported — confirm details',
                jsonb_strip_nulls(jsonb_build_object('alias_name', s.alias_name, 'po_box', s.po_box,
                                                     'priority', s.priority, 'address', s.address))
           from staging_customers s, base
          where s.batch_id = $3 and s.disposition = 'clean'
         returning id, source_ref
       )
       update staging_customers s set live_customer_id = ins.id
         from ins where s.batch_id = $3 and s.source_row_id = ins.source_ref
       returning s.id`, [tenantId, slId, batchId]);

    const { rows: br } = await c.query(
      `with tgt as (
         select source_row_id, coalesce(live_customer_id, matched_customer_id) as cid
           from staging_customers where batch_id=$1 and coalesce(live_customer_id, matched_customer_id) is not null
       ), ins as (
         insert into customer_branches (tenant_id, service_line_id, customer_id, name, address, emirate, access_notes,
                                        is_assumed, assumed_note)
         select $2, $3, tgt.cid, coalesce(sb.branch_name,'Main'), sb.address, sb.emirate, sb.access_notes,
                true, 'Imported — confirm and pin the location'
           from staging_branches sb join tgt on tgt.source_row_id = sb.source_row_id
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

    const counts = { customers: cust.length, sites: br[0].n as number, contacts: ct[0].n as number, contracts: k.length };
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
