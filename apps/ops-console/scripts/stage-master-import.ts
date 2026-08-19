// Stage the customer master through the dry-run pipeline and print the validation
// report (Art. VII §5: file → staging → validation → dry-run report → OWNER
// APPROVES → commit). This script performs the first three steps ONLY. It writes
// staging tables and an import_batches row; it never touches a live table.
//
//   node --env-file=../../.env.local --import tsx scripts/stage-master-import.ts [csv]
import { readFile, writeFile } from "node:fs/promises";
import Module from "node:module";
import { fileURLToPath } from "node:url";

// The domain modules are marked `import "server-only"` — a build-time guard that
// has no resolvable implementation outside the Next bundler. Point it at an empty
// module so this CLI can call the SAME import code the console calls, rather than
// keeping a second copy of the validation rules in sync by hand.
const NOOP = fileURLToPath(new URL("./_noop.cjs", import.meta.url));
const resolveFilename = (Module as unknown as { _resolveFilename: (r: string, ...a: unknown[]) => string })._resolveFilename;
(Module as unknown as { _resolveFilename: unknown })._resolveFilename = function (req: string, ...rest: unknown[]) {
  if (req === "server-only" || req === "client-only") return NOOP;
  return resolveFilename.call(this, req, ...rest);
};


const TENANT = "5b557699-b1d1-417e-b42d-fdd3be366354";
const CSV = process.argv[2] ?? "../../merge/customer-master-import.csv";
const OUT = "../../merge/import-validation-report.md";

const pct = (n: number, total: number) => `${((n / total) * 100).toFixed(1)}%`;

(async () => {
  const { stageCustomerCsv } = await import("../lib/domain/imports");
  const { scopedRead } = await import("../lib/rls");

  // Exactly one batch may be awaiting the owner's decision, so an approval can
  // never land on a stale report. Earlier validated-but-uncommitted batches from
  // this same source are abandoned first; their staged rows are kept for the record.
  const { abandonImportBatch, listImportBatches } = await import("../lib/domain/imports");
  for (const b of await listImportBatches(TENANT)) {
    if (b.status === "validated" && b.source.startsWith("master workbook:")) {
      await abandonImportBatch(TENANT, b.id);
      console.error(`[abandoned stale batch] ${b.id}`);
    }
  }

  const csv = await readFile(CSV, "utf8");
  const { batchId, staged, unknownColumns } = await stageCustomerCsv(TENANT, csv, `master workbook: ${CSV}`);

  const q = async (sql: string, p: unknown[] = []) => (await scopedRead(TENANT, sql, p)).rows;

  const [batch] = await q(`select id, source, status, created_at::text, report from import_batches where id=$1`, [batchId]);
  const disp = await q(
    `select disposition, coalesce(reason,'(none)') as reason, count(*)::int as n
       from staging_customers where batch_id=$1 group by 1,2 order by 1, 3 desc`, [batchId]);
  const held = await q(
    `select source_row_id, coalesce(trade_name, legal_name) as name, trn, reason
       from staging_customers where batch_id=$1 and disposition in ('held','rejected')
      order by disposition, source_row_id`, [batchId]);
  const matched = await q(
    `select s.source_row_id, coalesce(s.trade_name,s.legal_name) as name, s.reason, cu.code as live_code, cu.trade_name as live_name
       from staging_customers s join customers cu on cu.id = s.matched_customer_id
      where s.batch_id=$1 order by s.source_row_id`, [batchId]);
  const codes = await q(
    `select count(*) filter (where assigned_code is not null)::int as assigned,
            count(*) filter (where assigned_code = source_row_id)::int as adopted,
            count(*) filter (where assigned_code is not null and assigned_code <> source_row_id)::int as minted,
            min(assigned_code) as lowest, max(assigned_code) as highest
       from staging_customers where batch_id=$1`, [batchId]);
  const loc = await q(
    `select coalesce(location_status,'(blank)') as location_status, count(*)::int as n
       from staging_customers where batch_id=$1 group by 1 order by 2 desc`, [batchId]);
  const child = await q(
    `select 'contacts' as t, disposition, count(*)::int as n from staging_contacts where batch_id=$1 group by 1,2
      union all
     select 'sites', disposition, count(*)::int from staging_branches where batch_id=$1 group by 1,2
      order by 1,2`, [batchId]);

  // group → customers → branches, exactly as it will stand after the commit
  const structure = await q(
    `with g as (
       select distinct trim(customer_group) as name
         from staging_customers
        where batch_id=$1 and nullif(trim(customer_group),'') is not null
     )
     select g.name as group_name,
            lg.name as live_group,
            s.source_row_id as account_no,
            coalesce(s.trade_name, s.legal_name) as customer,
            s.assigned_code, s.disposition, s.trn, s.reason,
            (select count(*)::int from staging_branches b
              where b.batch_id=$1 and b.source_row_id = s.source_row_id) as branches,
            coalesce(array_length(string_to_array(nullif(s.contract_numbers,''), ','), 1), 0) as file_contracts
       from g
       join staging_customers s
         on s.batch_id=$1
        and (fn_group_key(trim(s.customer_group)) = fn_group_key(g.name)
             -- an outlet of the same legal entity belongs in the group picture even
             -- when the file did not repeat the group name on its row
             or exists (select 1 from staging_customers m
                         where m.batch_id=$1 and m.trn = s.trn and s.trn ~ '^1[0-9]{14}$'
                           and fn_group_key(trim(m.customer_group)) = fn_group_key(g.name)))
       left join customer_groups lg on lg.tenant_id=$2 and fn_group_key(lg.name) = fn_group_key(g.name)
      order by g.name, s.source_row_id`, [batchId, TENANT]);
  const liveInGroups = await q(
    `select lg.name as group_name, cu.code, coalesce(cu.trade_name, cu.legal_name) as customer,
            (select count(*)::int from contracts k where k.customer_id = cu.id) as contracts,
            (select count(*)::int from jobs j where j.customer_id = cu.id) as jobs,
            (select count(*)::int from customer_branches b where b.customer_id = cu.id) as branches
       from customer_groups lg join customers cu on cu.group_id = lg.id
      where lg.tenant_id=$1 order by lg.name, cu.code`, [TENANT]);

  const rep = batch.report as Record<string, any>;
  const blanks = rep.blank_counts as Record<string, number>;
  const total = blanks.total;
  const groups = rep.groups as { name: string; members: number; live_group: string | null; live_members: number }[];

  const L: string[] = [];
  const p = (s = "") => L.push(s);
  p(`# Import validation report — customer master`);
  p();
  p(`**Batch** \`${batch.id}\`  ·  **status** ${batch.status}  ·  **staged** ${batch.created_at}`);
  p(`**Source** ${batch.source}`);
  p();
  p(`Nothing below has been written to a live table. This is the dry-run report of`);
  p(`Art. VII §5; the commit is a separate, explicit step that needs the owner's approval.`);
  p();
  p(`## 1. Rows`);
  p();
  p(`| Disposition | Reason | Rows |`);
  p(`|---|---|---:|`);
  for (const d of disp) p(`| ${d.disposition} | ${d.reason} | ${d.n} |`);
  p(`| **total** | | **${staged}** |`);
  p();
  p(`## 2. Account numbers (DECISIONS §12)`);
  p();
  p(`| | |`);
  p(`|---|---:|`);
  p(`| Rows that will receive an account number | ${codes[0].assigned} |`);
  p(`| …kept from the file's ACCOUNT_NO | ${codes[0].adopted} |`);
  p(`| …minted because the file gave no valid 5-digit number | ${codes[0].minted} |`);
  p(`| Lowest / highest assigned | ${codes[0].lowest} / ${codes[0].highest} |`);
  p();
  p(`## 2b. Group → customers → branches, as it will stand after the commit`);
  p();
  p(`Each outlet is its OWN customer with its OWN account number; the group holds`);
  p(`them together for consolidated statements. Nothing is merged and no contract`);
  p(`or job moves between customers.`);
  p();
  let lastGroup = "";
  for (const r of structure) {
    if (r.group_name !== lastGroup) {
      lastGroup = r.group_name;
      const live = liveInGroups.filter((l: any) => l.group_name === r.live_group);
      p();
      p(`**${r.group_name}**${r.live_group ? ` → reuses live group \`${r.live_group}\`` : " (new group)"}`);
      p();
      p(`| Account no. | Customer | Sites | Contracts | Status |`);
      p(`|---|---|---:|---:|---|`);
      for (const l of live) {
        p(`| \`${l.code}\` | ${l.customer} | ${l.branches} | ${l.contracts} | already live${l.jobs ? `, ${l.jobs} job(s)` : ""} |`);
      }
    }
    const status = r.disposition === "clean" ? `will be created as \`${r.assigned_code}\``
      : r.disposition === "matched_live" ? "already exists — links to it"
      : `**HELD** — ${String(r.reason ?? "").replace(/ —.*$/, "").replace(/"/g, "'")}`;
    p(`| ${r.account_no} | ${r.customer} | ${r.branches} | ${r.file_contracts} (from file) | ${status} |`);
  }
  p();

  const entities = (rep.legal_entities ?? []) as { trn: string; outlets: number; members: string; group_name: string; any_held: boolean }[];
  if (entities.length) {
    p(`## 2c. One legal entity, several outlets (shared TRN)`);
    p();
    p(`A UAE TRN is issued per legal entity, so these rows are one company trading`);
    p(`from several places. Each keeps its own account number and becomes its own`);
    p(`customer. Turning any of them into branches of a single customer is your`);
    p(`decision — the system does not infer it.`);
    p();
    p(`| TRN | Outlets | Group | Members |`);
    p(`|---|---:|---|---|`);
    for (const e of entities) {
      p(`| ${e.trn} | ${e.outlets} | ${e.group_name || "—"} | ${e.members}${e.any_held ? " **(held)**" : ""} |`);
    }
    p();
  }

  const mapping = await q(
    `select s.source_row_id, coalesce(s.trade_name,s.legal_name) as customer, s.trn,
            s.emirate, s.address, s.reason
       from staging_customers s
      where s.batch_id=$1 and s.disposition='held' and s.reason like '%outlet%'
      order by s.source_row_id`, [batchId]);
  if (mapping.length) {
    p(`## 2d. Outlets awaiting mapping — the one thing the system cannot work out`);
    p();
    p(`These rows are outlets of a company that ALREADY has records in the system.`);
    p(`They are held rather than created, because creating them would list the same`);
    p(`restaurant twice while its contracts stayed on the old record.`);
    p();
    p(`| Account no. | Outlet, as the file names it | Emirate | Address |`);
    p(`|---|---|---|---|`);
    for (const m of mapping) p(`| ${m.source_row_id} | ${m.customer} | ${m.emirate ?? "—"} | ${m.address ?? "—"} |`);
    p();
    p(`The live records they correspond to carry **no address, no emirate, no TRN and`);
    p(`the identical name** — the only thing telling them apart is which contract each`);
    p(`holds. So the mapping has to come from you, by contract number:`);
    p();
    p(`| Live record | Contract | Value | Which outlet is this? |`);
    p(`|---|---|---:|---|`);
    for (const l of await q(
      `select cu.code, coalesce(k.contract_number,'(no number)') as contract_number,
              k.contract_value, k.start_date::text as start_date
         from customers cu left join contracts k on k.customer_id = cu.id
        where cu.tenant_id=$1 and cu.trade_name='SULTAN ALARAB REST'
        order by cu.code, k.contract_number`, [TENANT])) {
      p(`| \`${l.code}\` | ${l.contract_number} | ${l.contract_value ?? ""} | _____________ |`);
    }
    p();
    p(`Once you fill that in, nothing is merged and nothing is repointed: each live`);
    p(`record simply takes its outlet's 5-digit number, exactly the way Calicut does.`);
    p();
  }

  if (matched.length) {
    p(`## 3. Rows matched to an existing live customer — NOT created`);
    p();
    p(`| File account | File name | Live code | Live name | Matched on |`);
    p(`|---|---|---|---|---|`);
    for (const m of matched) p(`| ${m.source_row_id} | ${m.name} | \`${m.live_code}\` | ${m.live_name} | ${m.reason} |`);
    p();
  }
  if (held.length) {
    p(`## 4. Held or rejected — a human decides (${held.length})`);
    p();
    p(`| Account | Name | TRN | Reason |`);
    p(`|---|---|---|---|`);
    for (const h of held) p(`| ${h.source_row_id} | ${h.name ?? ""} | ${h.trn ?? ""} | ${h.reason} |`);
    p();
  }
  p(`## 5. Location quality — what the technician app must flag as approximate`);
  p();
  p(`| LOCATION_STATUS | Rows |`);
  p(`|---|---:|`);
  for (const l of loc) p(`| ${l.location_status} | ${l.n} |`);
  p();
  p(`## 6. Customer groups`);
  p();
  p(`Reconciliation ignores case, spacing, punctuation and a trailing "GROUP" and`);
  p(`nothing else (migration 098). Every reuse is named here before you approve it.`);
  p();
  p(`| Group in the file | Members in file | Resolves to | Existing live members |`);
  p(`|---|---:|---|---:|`);
  for (const g of groups) {
    p(`| ${g.name} | ${g.members} | ${g.live_group ? `**reuses live group \`${g.live_group}\`**` : "new group — will be created"} | ${g.live_group ? g.live_members : ""} |`);
  }
  p();
  p(`## 7. Contacts and sites staged`);
  p();
  p(`| Table | Disposition | Rows |`);
  p(`|---|---|---:|`);
  for (const c of child) p(`| ${c.t} | ${c.disposition} | ${c.n} |`);
  p();
  p(`## 8. Blank-field count per column (Art. VII §5)`);
  p();
  p(`Blank means unknown. Nothing here is filled with a default.`);
  p();
  p(`| Column | Blank | of ${total} |`);
  p(`|---|---:|---:|`);
  for (const [k, v] of Object.entries(blanks)) {
    if (k === "total") continue;
    p(`| ${k} | ${v} | ${pct(v as number, total)} |`);
  }
  p();
  if (unknownColumns.length) {
    p(`## 9. Columns the importer did not recognise`);
    p();
    for (const u of unknownColumns) p(`- \`${u}\` — reported, not stored, nothing else dropped.`);
    p();
  }

  const md = L.join("\n") + "\n";
  await writeFile(OUT, md, "utf8");
  console.log(md);
  console.error(`\n[written] ${OUT}`);
  console.error(`[batch]   ${batchId}`);
  process.exit(0);
})();
