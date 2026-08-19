// Reconcile pre-import ("legacy") customer records to the master file's customers
// of record. Owner ruling, 19 Aug 2026: "File is truth. Legacy is history. Flag
// what can't auto-reconcile."
//
//   node --env-file=../../.env.local --import tsx scripts/reconcile-legacy.ts \
//     --link CUST-0001=11193 --flag-rest [--commit]
//
// Rehearses by default and rolls back. What it does:
//   1. --link OLD=NEW           an owner-directed link, applied and audited.
//   2. auto-link                where the evidence is UNAMBIGUOUS — exactly one
//                               customer of record shares the TRN, or exactly one
//                               shares the normalised name. Never a guess.
//   3. --flag-rest              every remaining legacy record is flagged for the
//                               owner to resolve from the console.
//
// A link NEVER moves a document. Invoices, receipts and service reports are frozen
// at issue and stay on the record they were issued against (Art. VII §2) — moving
// them would be an append-only violation needing an amendment under Art. XII.
// The link is what lets the console show both as one business.
import Module from "node:module";
import { fileURLToPath } from "node:url";

const NOOP = fileURLToPath(new URL("./_noop.cjs", import.meta.url));
const resolveFilename = (Module as unknown as { _resolveFilename: (r: string, ...a: unknown[]) => string })._resolveFilename;
(Module as unknown as { _resolveFilename: unknown })._resolveFilename = function (req: string, ...rest: unknown[]) {
  if (req === "server-only" || req === "client-only") return NOOP;
  return resolveFilename.call(this, req, ...rest);
};

const TENANT = "5b557699-b1d1-417e-b42d-fdd3be366354";
const HISTORY = ["contracts", "jobs", "invoices", "receipts", "service_reports",
                 "estimates", "surveys", "credit_notes", "refunds"] as const;

(async () => {
  const { withRequest } = await import("../lib/rls");
  const { audit } = await import("../lib/domain/audit");

  const argv = process.argv.slice(2);
  const commit = argv.includes("--commit");
  const flagRest = argv.includes("--flag-rest");
  const links = new Map<string, string>();
  argv.forEach((a, i) => {
    if (a === "--link") {
      const [from, to] = (argv[i + 1] ?? "").split("=");
      if (!from || !to) throw new Error(`--link expects OLD=NEW, got "${argv[i + 1]}"`);
      links.set(from, to);
    }
  });

  class Rollback extends Error {}
  try {
    await withRequest({ tenantId: TENANT }, async (c) => {
      await c.query("set local statement_timeout = '120000'");

      // Counts for every customer in one pass — nine grouped scans over small
      // tables, aggregated here. The correlated-subquery and self-join versions
      // both timed out against the pooler.
      const { rows: histRows } = await c.query(
        HISTORY.map((t) =>
          `select '${t}' as src, customer_id::text as cid, count(*)::int as n
             from ${t} where tenant_id = $1 and customer_id is not null group by 2`).join("\nunion all\n"),
        [TENANT]);
      const hist = new Map<string, string[]>();
      for (const r of histRows as { src: string; cid: string; n: number }[]) {
        if (!r.n) continue;
        (hist.get(r.cid) ?? hist.set(r.cid, []).get(r.cid)!).push(`${r.n} ${r.src.replace(/_/g, " ")}`);
      }
      const historyOf = (id: string) => (hist.get(id) ?? []).join(", ") || "no history";

      // Candidates from the same customer group — what the office would look at.
      const { rows: all } = await c.query(
        `select id::text as id, code, coalesce(trade_name, legal_name) as name, group_id::text as gid
           from customers where tenant_id = $1 and group_id is not null`, [TENANT]);
      const byGroup = new Map<string, string[]>();
      for (const r of all as { code: string; name: string; gid: string }[]) {
        if (!/^[1-9]{5}$/.test(r.code)) continue;
        (byGroup.get(r.gid) ?? byGroup.set(r.gid, []).get(r.gid)!).push(`${r.code} ${r.name}`);
      }
      const groupOf = new Map<string, string>((all as { id: string; gid: string }[]).map((r) => [r.id, r.gid]));
      const cands = new Map<string, string>();
      for (const [id, gid] of groupOf) {
        const c2 = byGroup.get(gid);
        if (c2?.length) cands.set(id, c2.sort().join(", "));
      }

      const { rows: legacy } = await c.query(
        `select id, code, coalesce(trade_name, legal_name) as name, trn
           from customers
          where tenant_id=$1 and code !~ '^[1-9]{5}$' and reconciled_to_customer_id is null
          order by code`, [TENANT]);
      console.log(`\n${legacy.length} legacy record(s) not yet reconciled.\n`);

      let linked = 0, flagged = 0;
      for (const l of legacy) {
        const h = historyOf(l.id as string);
        let target: { id: string; code: string; name: string } | null = null;
        let why = "";

        const forced = links.get(l.code);
        if (forced) {
          const { rows } = await c.query(
            `select id, code, coalesce(trade_name, legal_name) as name
               from customers where tenant_id=$1 and code=$2`, [TENANT, forced]);
          if (!rows[0]) throw new Error(`--link ${l.code}=${forced}: no customer of record has account number ${forced}`);
          target = rows[0]; why = "owner-directed";
        } else {
          // unambiguous evidence only: exactly one candidate, or none
          const { rows: byTrn } = await c.query(
            `select id, code, coalesce(trade_name, legal_name) as name from customers
              where tenant_id=$1 and code ~ '^[1-9]{5}$' and trn is not null and trn = $2`, [TENANT, l.trn]);
          const { rows: byName } = await c.query(
            `select id, code, coalesce(trade_name, legal_name) as name from customers
              where tenant_id=$1 and code ~ '^[1-9]{5}$'
                and lower(coalesce(trade_name, legal_name,'')) = lower($2)`, [TENANT, l.name]);
          if (byTrn.length === 1) { target = byTrn[0]; why = "same TRN, one candidate"; }
          else if (byName.length === 1) { target = byName[0]; why = "same name, one candidate"; }
          else if (byTrn.length > 1) why = `${byTrn.length} customers of record share this TRN — ambiguous`;
          else if (byName.length > 1) why = `${byName.length} customers of record share this name — ambiguous`;
          else why = "no customer of record matches on TRN or name";
        }

        if (target) {
          const note = `Legacy record. Same business as ${target.code} ${target.name} (${why}). ` +
                       `Its history stays here and is never rewritten: ${h}.`;
          await c.query(
            `update customers set reconciled_to_customer_id=$2, reconciliation_note=$3, updated_at=now()
              where id=$1`, [l.id, target.id, note]);
          await c.query(
            `update customers set required_info = concat_ws('; ', nullif(required_info,''),
                     'ASK: confirm the legacy record ' || $2 || ' (' || $3 || ') belongs to this customer')
              where id=$1`, [target.id, l.code, h]);
          await audit(c, TENANT, {
            table: "customers", rowId: l.id, action: "update",
            newValue: { reconciled_to: target.code, why }, note,
          });
          console.log(`  ${l.code} "${l.name}"\n      -> ${target.code} "${target.name}"  (${why})\n      history stays: ${h}`);
          linked++;
        } else if (flagRest) {
          const candidates = cands.get(l.id as string);
          const note = `Legacy record with no counterpart in the master file (${why}). ` +
                       `It keeps its history — ${h} — until you resolve it from the console.` +
                       (candidates ? ` Candidates in the same group: ${candidates}.` : "");
          await c.query(
            `update customers set reconciliation_note=$2,
                    required_info = concat_ws('; ', nullif(required_info,''),
                      'ASK: which customer of record is this legacy record, or should it be archived?'),
                    updated_at=now()
              where id=$1`, [l.id, note]);
          await audit(c, TENANT, {
            table: "customers", rowId: l.id, action: "update",
            newValue: { flagged_for_reconciliation: true, why }, note,
          });
          console.log(`  ${l.code} "${l.name}"  — FLAGGED: ${why}\n      keeps: ${h}`);
          flagged++;
        }
      }
      console.log(`\n${linked} linked, ${flagged} flagged, 0 documents moved.`);
      if (!commit) throw new Rollback("rehearsal");
    });
    console.log(`\n✅ COMMITTED.`);
  } catch (e) {
    if (e instanceof Rollback) {
      console.log(`\n↩︎  REHEARSAL ONLY — rolled back. Re-run with --commit to apply.`);
      process.exit(0);
    }
    console.error(`\n✖ ${(e as Error).message}`);
    process.exit(1);
  }
})();
