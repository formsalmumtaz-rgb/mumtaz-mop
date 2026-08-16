// Customer master bulk import (Art. VII §5, DOCUMENT 9 §C).
//
//   node --env-file=../../.env.local --import tsx scripts/import-merge.ts            → stage + validate + DRY-RUN report
//   node --env-file=../../.env.local --import tsx scripts/import-merge.ts --commit   → commit the last validated batch's clean rows
//
// Doctrine: CSV → staging → validation → dry-run report → commit. Live tables are
// never written during staging/validation. Account numbers are SYSTEM-assigned at
// commit (file CUST-XXXX ids collide with live codes and are kept only as
// source_ref). Match order: legacy_customer_code → TRN → phone → name. Rows needing
// an owner decision (dup groups, shared TRNs, low-confidence contract matches,
// flagged issues) are HELD, never guessed (Art. X §4). Idempotent: a source_row_id
// already committed (customers.source_ref) is skipped on re-run.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

// NOTE: the data folder is literally named "merge " with a trailing space.
const DIR = join(process.cwd(), "..", "..", "merge "); // run from apps/ops-console
const COMMIT = process.argv.includes("--commit");

const url = new URL(process.env.DATABASE_URL!);
url.search = "";
const pool = new pg.Pool({ connectionString: url.toString(), ssl: { rejectUnauthorized: false }, max: 3 });
pool.on("error", () => {});

// ── RFC4180-ish CSV parser (quoted fields, embedded commas/quotes/newlines) ──
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false;
      } else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}
function csvObjects(file: string): Record<string, string>[] {
  const rows = parseCsv(readFileSync(join(DIR, file), "utf8"));
  const head = rows[0];
  return rows.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}
const nul = (s: string | undefined) => (s && s.trim() !== "" ? s.trim() : null);

const TENANT = "5b557699-b1d1-417e-b42d-fdd3be366354";
const SL_PEST = "72402004-2e6c-4b55-b5c5-351329814956";
const TRN_RE = /^1\d{14}$/; // UAE TRN: 15 digits starting 1

// frequency_norm → frequencies.code (unmapped values are HELD, never guessed)
const FREQ_MAP: Record<string, string> = {
  MONTHLY_TWICE: "monthly_2", MONTHLY_ONCE: "monthly_1", MONTHLY: "monthly_1",
  QUARTERLY: "quarterly", BIMONTHLY: "bimonthly", EVERY_TWO_MONTHS: "bimonthly",
};

function parseDMY(s: string | null): string | null {
  if (!s) return null;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const dd = Number(d), mm = Number(mo);
  if (dd < 1 || dd > 31 || mm < 1 || mm > 12) return null;
  return `${y}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}


// Bulk multi-row insert (one round trip per ~200 rows — sequential single-row
// inserts over the Mumbai pooler drop the connection).
async function bulkInsert(c: pg.PoolClient, table: string, cols: string[], rows: unknown[][]): Promise<void> {
  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const params: unknown[] = [];
    const tuples = chunk.map((r) => {
      const ph = r.map((v) => { params.push(v); return "$" + params.length; });
      return "(" + ph.join(",") + ")";
    });
    await c.query(`insert into ${table} (${cols.join(",")}) values ${tuples.join(",")}`, params);
  }
}

async function stageAndValidate(): Promise<void> {
  const customers = csvObjects("customers.csv");
  const contacts = csvObjects("contacts.csv");
  const branches = csvObjects("branches.csv");
  const contracts = csvObjects("contracts.csv");
  console.log(`parsed: ${customers.length} customers, ${contacts.length} contacts, ${branches.length} branches, ${contracts.length} contracts`);

  const c = await pool.connect();
  try {
    await c.query("begin");
    const { rows: b } = await c.query(
      `insert into import_batches (tenant_id, kind, source) values ($1, 'customer_master', $2) returning id`,
      [TENANT, `merge/ CSVs: ${customers.length}c/${contacts.length}ct/${branches.length}b/${contracts.length}k`]);
    const batch = b[0].id as string;

    await bulkInsert(c, "staging_customers",
      ["tenant_id","batch_id","source_row_id","legacy_customer_code","legal_name","trade_name","alias_name","trn",
       "trade_licence_number","customer_type","emirate","address","po_box","priority","referred_by","remarks",
       "shared_trn_group","possible_dup_group","missing_fields"],
      customers.map((r) => [TENANT, batch, r.source_row_id, nul(r.legacy_customer_code), nul(r.legal_name), nul(r.trade_name),
        nul(r.alias_name), nul(r.trn), nul(r.trade_licence_number), nul(r.customer_type), nul(r.emirate),
        nul(r.address), nul(r.po_box), nul(r.priority), nul(r.referred_by), nul(r.remarks),
        nul(r.shared_trn_group), nul(r.possible_dup_group), nul(r.missing_fields)]));
    await bulkInsert(c, "staging_contacts",
      ["tenant_id","batch_id","source_row_id","contact_type","value","contact_name","designation"],
      contacts.map((r) => [TENANT, batch, r.source_row_id, nul(r.contact_type), nul(r.value), nul(r.contact_name), nul(r.designation)]));
    await bulkInsert(c, "staging_branches",
      ["tenant_id","batch_id","source_row_id","branch_name","address","po_box","emirate","latitude","longitude","location_source","access_notes"],
      branches.map((r) => [TENANT, batch, r.source_row_id, nul(r.branch_name), nul(r.address), nul(r.po_box), nul(r.emirate),
        nul(r.latitude), nul(r.longitude), nul(r.location_source), nul(r.access_notes)]));
    await bulkInsert(c, "staging_contracts",
      ["tenant_id","batch_id","contract_number","client_name_raw","location_raw","contact_raw","start_date_raw","end_date_raw",
       "amount_incl_vat","frequency_raw","frequency_norm","visits_per_year","linked_source_row_id","match_confidence",
       "dup_contract_flag","amount_issue","date_issue","phone_conflict"],
      contracts.map((r) => [TENANT, batch, nul(r.contract_number), nul(r.client_name_raw), nul(r.location_raw), nul(r.contact_raw),
        nul(r.start_date), nul(r.end_date), nul(r.amount_incl_vat), nul(r.frequency_raw), nul(r.frequency_norm),
        nul(r.visits_per_year), nul(r.linked_source_row_id), nul(r.match_confidence), nul(r.dup_contract_flag),
        nul(r.amount_issue), nul(r.date_issue), nul(r.phone_conflict)]));

    // ── Validation, in SQL, all inside the same txn ──
    // 1. already imported in a previous batch (idempotency) → matched_live
    await c.query(
      `update staging_customers s set disposition='matched_live', reason='already imported (source_ref)', matched_customer_id=cu.id
         from customers cu
        where s.batch_id=$1 and cu.tenant_id=s.tenant_id and cu.source_ref = s.source_row_id`, [batch]);
    // 2. legacy code match against live
    await c.query(
      `update staging_customers s set disposition='matched_live', reason='matched live customer (legacy code)', matched_customer_id=cu.id
         from customers cu
        where s.batch_id=$1 and s.disposition='pending' and s.legacy_customer_code is not null
          and cu.tenant_id=s.tenant_id and cu.legacy_code = s.legacy_customer_code`, [batch]);
    // 3. TRN match against live (valid TRNs only, ignore the seeded junk TRNs)
    await c.query(
      `update staging_customers s set disposition='matched_live', reason='matched live customer (TRN)', matched_customer_id=cu.id
         from customers cu
        where s.batch_id=$1 and s.disposition='pending' and s.trn ~ '^1[0-9]{14}$'
          and cu.tenant_id=s.tenant_id and cu.trn = s.trn`, [batch]);
    // 4. name match against live (exact, case-insensitive, on trade or legal name)
    await c.query(
      `update staging_customers s set disposition='matched_live', reason='matched live customer (name)', matched_customer_id=cu.id
         from customers cu
        where s.batch_id=$1 and s.disposition='pending'
          and cu.tenant_id=s.tenant_id
          and coalesce(s.trade_name, s.legal_name, '') <> ''
          and (lower(coalesce(cu.trade_name,'')) = lower(coalesce(s.trade_name, s.legal_name, ''))
            or lower(coalesce(cu.legal_name,'')) = lower(coalesce(s.legal_name, s.trade_name, '')))`, [batch]);
    // 5. rejected: no name at all
    await c.query(
      `update staging_customers set disposition='rejected', reason='no legal or trade name'
        where batch_id=$1 and disposition='pending' and legal_name is null and trade_name is null`, [batch]);
    // 6. held: owner-decision groups (dup group / shared TRN) — never guessed
    await c.query(
      `update staging_customers set disposition='held', reason='duplicate group — owner decision (decision sheet)'
        where batch_id=$1 and disposition='pending' and possible_dup_group is not null`, [batch]);
    await c.query(
      `update staging_customers set disposition='held', reason='shared TRN group — owner decision (decision sheet)'
        where batch_id=$1 and disposition='pending' and shared_trn_group is not null`, [batch]);
    // 7. held: TRN present but malformed (e-invoicing compliance field — never import garbage)
    await c.query(
      `update staging_customers set disposition='held', reason='TRN present but not a valid 15-digit UAE TRN'
        where batch_id=$1 and disposition='pending' and trn is not null and trn !~ '^1[0-9]{14}$'`, [batch]);
    // 8. in-file duplicate names (same normalized name twice in the batch) → held
    await c.query(
      `update staging_customers s set disposition='held', reason='same name appears more than once in the file'
        where s.batch_id=$1 and s.disposition='pending' and exists (
          select 1 from staging_customers o
           where o.batch_id=s.batch_id and o.id<>s.id
             and lower(coalesce(o.trade_name, o.legal_name,'')) = lower(coalesce(s.trade_name, s.legal_name,'')))`, [batch]);
    // 9. everything else is clean
    await c.query(`update staging_customers set disposition='clean', reason=null where batch_id=$1 and disposition='pending'`, [batch]);

    // contacts/branches inherit their customer's fate; malformed contacts held
    await c.query(
      `update staging_contacts sc set disposition = case
          when s.disposition in ('clean','matched_live') then 'clean' else 'held' end,
        reason = case when s.disposition in ('clean','matched_live') then null else 'customer '||s.disposition end
        from staging_customers s
       where sc.batch_id=$1 and s.batch_id=sc.batch_id and s.source_row_id=sc.source_row_id`, [batch]);
    await c.query(
      `update staging_contacts set disposition='held', reason='no usable value'
        where batch_id=$1 and (value is null or contact_type is null)`, [batch]);
    await c.query(
      `update staging_branches sb set disposition = case
          when s.disposition in ('clean','matched_live') then 'clean' else 'held' end,
        reason = case when s.disposition in ('clean','matched_live') then null else 'customer '||s.disposition end
        from staging_customers s
       where sb.batch_id=$1 and s.batch_id=sb.batch_id and s.source_row_id=sb.source_row_id`, [batch]);

    // contracts: clean iff HIGH-confidence link, no flagged issues, parseable, mapped frequency, linked customer usable
    await c.query(
      `update staging_contracts k set disposition='held', reason='no linked customer (needs match)'
        where k.batch_id=$1 and (k.linked_source_row_id is null
          or not exists (select 1 from staging_customers s where s.batch_id=k.batch_id and s.source_row_id=k.linked_source_row_id))`, [batch]);
    await c.query(
      `update staging_contracts k set disposition='held', reason='match confidence below HIGH — review'
        where k.batch_id=$1 and k.disposition='pending' and (k.match_confidence is null or k.match_confidence not ilike 'HIGH%')`, [batch]);
    await c.query(
      `update staging_contracts k set disposition='held', reason=trim(both '; ' from
          coalesce(case when k.dup_contract_flag is not null then 'duplicate flag; ' end,'')
          || coalesce(case when k.amount_issue is not null then 'amount issue; ' end,'')
          || coalesce(case when k.date_issue is not null then 'date issue; ' end,''))
        where k.batch_id=$1 and k.disposition='pending'
          and (k.dup_contract_flag is not null or k.amount_issue is not null or k.date_issue is not null)`, [batch]);
    await c.query(
      `update staging_contracts k set disposition='held', reason='linked customer is '||s.disposition
        from staging_customers s
       where k.batch_id=$1 and k.disposition='pending'
         and s.batch_id=k.batch_id and s.source_row_id=k.linked_source_row_id
         and s.disposition not in ('clean','matched_live')`, [batch]);
    // parse/mapping checks done app-side for clarity
    const { rows: pend } = await c.query(
      `select id, start_date_raw, end_date_raw, amount_incl_vat, frequency_norm from staging_contracts
        where batch_id=$1 and disposition='pending'`, [batch]);
    for (const k of pend) {
      const sd = parseDMY(k.start_date_raw), ed = parseDMY(k.end_date_raw);
      const amt = k.amount_incl_vat != null && !Number.isNaN(Number(k.amount_incl_vat)) ? Number(k.amount_incl_vat) : null;
      const freq = k.frequency_norm ? FREQ_MAP[k.frequency_norm as string] : null;
      let reason: string | null = null;
      if (!sd || !ed) reason = "unparseable start/end date";
      else if (amt == null || amt <= 0) reason = "unparseable or non-positive amount";
      else if (k.frequency_norm && !freq) reason = `unmapped frequency ${k.frequency_norm} — owner to map`;
      await c.query(`update staging_contracts set disposition=$2, reason=$3 where id=$1`,
        [k.id, reason ? "held" : "clean", reason]);
    }

    // ── Dry-run report ──
    const rep: Record<string, unknown> = {};
    for (const [tbl, key] of [["staging_customers", "customers"], ["staging_contacts", "contacts"], ["staging_branches", "branches"], ["staging_contracts", "contracts"]] as const) {
      const { rows } = await c.query(
        `select disposition, coalesce(reason,'') as reason, count(*)::int as n from ${tbl} where batch_id=$1 group by 1,2 order by 1,3 desc`, [batch]);
      rep[key] = rows;
    }
    await c.query(`update import_batches set status='validated', report=$2 where id=$1`, [batch, JSON.stringify(rep)]);
    await c.query("commit");

    // human-readable report next to the CSVs (untracked; contains names)
    let md = `# Import dry-run report — batch ${batch}\nGenerated by scripts/import-merge.ts (no live rows written).\n\n`;
    for (const key of ["customers", "contacts", "branches", "contracts"]) {
      md += `## ${key}\n`;
      for (const r of rep[key] as { disposition: string; reason: string; n: number }[]) {
        md += `- **${r.disposition}** ${r.n}${r.reason ? ` — ${r.reason}` : ""}\n`;
      }
      md += "\n";
    }
    writeFileSync(join(DIR, "import-dry-run-report.md"), md);
    console.log("\n=== DRY-RUN SUMMARY (batch " + batch + ") ===");
    console.log(md);
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
}

async function commit(): Promise<void> {
  const c = await pool.connect();
  try {
    const { rows: b } = await c.query(
      `select id from import_batches where tenant_id=$1 and kind='customer_master' and status='validated'
        order by created_at desc limit 1`, [TENANT]);
    if (!b[0]) throw new Error("No validated batch to commit — run the dry-run first");
    const batch = b[0].id as string;
    await c.query("begin");
    // the 508-row insert runs the attributes validator per row — needs more than
    // the pooler's default statement budget
    await c.query("set local statement_timeout = '600000'");

    // 1. clean customers → live, SYSTEM-assigned codes continuing our sequence (set-based)
    const { rows: cust } = await c.query(
      `with base as (
         -- Account numbers are permanent and never reused: the floor is the max of
         -- live codes AND the burn setting (import.next_customer_code), so codes
         -- issued by a rolled-back batch stay burned forever.
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
                true, 'Imported from legacy sheets — confirm details',
                jsonb_strip_nulls(jsonb_build_object('alias_name', s.alias_name, 'po_box', s.po_box,
                                                     'priority', s.priority, 'address', s.address))
           from staging_customers s, base
          where s.batch_id = $3 and s.disposition = 'clean'
         returning id, source_ref
       )
       update staging_customers s set live_customer_id = ins.id
         from ins where s.batch_id = $3 and s.source_row_id = ins.source_ref
       returning s.id`, [TENANT, SL_PEST, batch]);

    // 2. branches (dup-guarded, set-based; no geocoding — server-side later, once)
    const { rows: br } = await c.query(
      `with tgt as (
         select source_row_id, coalesce(live_customer_id, matched_customer_id) as cid
           from staging_customers where batch_id=$1 and coalesce(live_customer_id, matched_customer_id) is not null
       ), ins as (
         insert into customer_branches (tenant_id, service_line_id, customer_id, name, address, emirate, access_notes,
                                        is_assumed, assumed_note)
         select $2, $3, tgt.cid, coalesce(sb.branch_name, 'Main'), sb.address, sb.emirate, sb.access_notes,
                true, 'Imported — confirm and pin GPS'
           from staging_branches sb join tgt on tgt.source_row_id = sb.source_row_id
          where sb.batch_id=$1 and sb.disposition='clean'
            and not exists (select 1 from customer_branches cb
                             where cb.tenant_id=$2 and cb.customer_id=tgt.cid
                               and lower(coalesce(cb.name,'')) = lower(coalesce(sb.branch_name,'Main'))
                               and coalesce(cb.address,'') = coalesce(sb.address,''))
         returning 1
       ) select count(*)::int as n from ins`, [batch, TENANT, SL_PEST]);

    await c.query(
      `update staging_branches sb set disposition='committed'
        where sb.batch_id=$1 and sb.disposition='clean'
          and exists (select 1 from staging_customers s
                       where s.batch_id=$1 and s.source_row_id=sb.source_row_id
                         and coalesce(s.live_customer_id, s.matched_customer_id) is not null)`, [batch]);

    // 3. contacts (phone/mobile→phone, email→email; dup-guarded, set-based)
    const { rows: ct } = await c.query(
      `with tgt as (
         select source_row_id, coalesce(live_customer_id, matched_customer_id) as cid
           from staging_customers where batch_id=$1 and coalesce(live_customer_id, matched_customer_id) is not null
       ), ins as (
         insert into contacts (tenant_id, service_line_id, customer_id, name, phone, email, role, is_assumed, assumed_note)
         select $2, $3, tgt.cid, coalesce(sc.contact_name, 'Primary contact'),
                case when sc.contact_type = 'email' or sc.value like '%@%' then null else sc.value end,
                case when sc.contact_type = 'email' or sc.value like '%@%' then sc.value end,
                sc.designation, true, 'Imported — confirm'
           from staging_contacts sc join tgt on tgt.source_row_id = sc.source_row_id
          where sc.batch_id=$1 and sc.disposition='clean' and sc.value is not null
            and not exists (select 1 from contacts x
                             where x.tenant_id=$2 and x.customer_id=tgt.cid
                               and (x.phone = sc.value or x.email = sc.value))
         returning 1
       ) select count(*)::int as n from ins`, [batch, TENANT, SL_PEST]);

    await c.query(
      `update staging_contacts sc set disposition='committed'
        where sc.batch_id=$1 and sc.disposition='clean'
          and exists (select 1 from staging_customers s
                       where s.batch_id=$1 and s.source_row_id=sc.source_row_id
                         and coalesce(s.live_customer_id, s.matched_customer_id) is not null)`, [batch]);

    // 4. contracts → DRAFT (never auto-activated); freq map + DD/MM/YYYY parse in SQL
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
         select $2, $3, tgt.cid, sk.contract_number, sk.amount_incl_vat::numeric, 'AED',
                f.id, 'draft',
                to_date(sk.start_date_raw, 'DD/MM/YYYY'), to_date(sk.end_date_raw, 'DD/MM/YYYY'),
                true, 'Imported from legacy sheet (incl. VAT amount) — confirm terms before activation',
                jsonb_strip_nulls(jsonb_build_object('visits_per_year', sk.visits_per_year,
                                                     'location_raw', sk.location_raw, 'frequency_raw', sk.frequency_raw))
           from staging_contracts sk
           join tgt on tgt.source_row_id = sk.linked_source_row_id
           left join freqmap fm on fm.norm = sk.frequency_norm
           left join frequencies f on f.tenant_id = $2 and f.code = fm.code
          where sk.batch_id=$1 and sk.disposition='clean'
            and to_date(sk.end_date_raw, 'DD/MM/YYYY') >= to_date(sk.start_date_raw, 'DD/MM/YYYY')
            and not exists (select 1 from contracts x where x.tenant_id=$2 and x.contract_number = sk.contract_number)
         returning id, contract_number
       )
       update staging_contracts sk set disposition='committed', live_contract_id = ins.id
         from ins where sk.batch_id=$1 and sk.contract_number = ins.contract_number
       returning sk.id`, [batch, TENANT, SL_PEST]);

    // anything still 'clean' after the insert was skipped for a reason — hold it honestly
    await c.query(
      `update staging_contracts set disposition='held',
              reason = case when to_date(end_date_raw,'DD/MM/YYYY') < to_date(start_date_raw,'DD/MM/YYYY')
                            then 'end date before start date' else 'skipped at commit (dup number or unmatched customer)' end
        where batch_id=$1 and disposition='clean'`, [batch]);
    await c.query(
      `update import_batches set status='committed', committed_at=now(),
              report = report || jsonb_build_object('committed', jsonb_build_object(
                'customers', $2::int, 'branches', $3::int, 'contacts', $4::int, 'contracts', $5::int))
        where id=$1`, [batch, cust.length, br[0].n, ct[0].n, k.length]);
    await c.query("commit");
    console.log(`COMMITTED batch ${batch}: ${cust.length} customers, ${br[0].n} branches, ${ct[0].n} contacts, ${k.length} draft contracts`);
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
}

async function main() {
  if (COMMIT) await commit(); else await stageAndValidate();
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
