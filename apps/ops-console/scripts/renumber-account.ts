// Give an existing customer its 5-digit account number (DECISIONS §12 ¶5).
//
//   node --env-file=../../.env.local --import tsx scripts/renumber-account.ts CUST-0001 11193
//   …same, plus --commit, to actually apply it
//
// Rehearses by default: it does the whole thing inside a transaction, prints what
// changed, and ROLLS BACK. Only --commit keeps it.
//
// This changes customers.code and NOTHING else. It deliberately does not touch any
// transaction record: invoices, receipts and service reports carry FROZEN snapshots
// of the customer as they were when issued, and rewriting them would violate the
// append-only invariant (Art. VII §2). Documents already issued keep the old
// number — which is precisely why DECISIONS §12 ¶2 burns retired numbers forever.
import Module from "node:module";
import { fileURLToPath } from "node:url";

const NOOP = fileURLToPath(new URL("./_noop.cjs", import.meta.url));
const resolveFilename = (Module as unknown as { _resolveFilename: (r: string, ...a: unknown[]) => string })._resolveFilename;
(Module as unknown as { _resolveFilename: unknown })._resolveFilename = function (req: string, ...rest: unknown[]) {
  if (req === "server-only" || req === "client-only") return NOOP;
  return resolveFilename.call(this, req, ...rest);
};

const TENANT = "5b557699-b1d1-417e-b42d-fdd3be366354";
const REFERENCING = [
  "contacts", "contracts", "credit_notes", "customer_branches", "estimates", "invoices",
  "jobs", "monitored_documents", "outbound_notifications", "receipts", "refunds",
  "service_reports", "severe_infestation_episodes", "surveys",
] as const;

(async () => {
  const { withRequest } = await import("../lib/rls");
  const { audit } = await import("../lib/domain/audit");

  const [from, to] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const commit = process.argv.includes("--commit");
  if (!from || !to) {
    console.error("usage: renumber-account.ts <current-code> <new-5-digit-code> [--commit]");
    process.exit(2);
  }
  if (!/^[1-9]{5}$/.test(to)) {
    console.error(`✖ ${to} is not a valid account number: five digits, none of them 0 (DECISIONS §12).`);
    process.exit(2);
  }

  class Rollback extends Error {}
  try {
    await withRequest({ tenantId: TENANT }, async (c) => {
      const { rows: cur } = await c.query(
        `select id, code, trade_name, legal_name from customers where tenant_id=$1 and code=$2 for update`,
        [TENANT, from]);
      if (!cur[0]) throw new Error(`No customer has account number ${from}.`);
      const { rows: clash } = await c.query(
        `select code, trade_name from customers where tenant_id=$1 and code=$2`, [TENANT, to]);
      if (clash[0]) {
        throw new Error(
          `${to} is already held by "${clash[0].trade_name}". Account numbers are permanent ` +
          `(DECISIONS §12 ¶2) — this needs a human decision, not a reassignment.`);
      }

      console.log(`\n${from} → ${to}   "${cur[0].trade_name ?? cur[0].legal_name}"`);
      console.log(`\nrecords that stay attached to this customer (nothing is repointed or rewritten):`);
      let attached = 0;
      for (const t of REFERENCING) {
        const { rows } = await c.query(`select count(*)::int as n from ${t} where customer_id=$1`, [cur[0].id]);
        if (rows[0].n) { console.log(`  ${t.padEnd(28)} ${rows[0].n}`); attached += rows[0].n as number; }
      }
      console.log(`  ${"total".padEnd(28)} ${attached}`);

      await c.query(`update customers set code=$2, updated_at=now() where id=$1`, [cur[0].id, to]);
      await audit(c, TENANT, {
        table: "customers", rowId: cur[0].id, action: "update",
        oldValue: { code: from }, newValue: { code: to },
        note: `account number changed to the 5-digit scheme (DECISIONS §12); ${attached} attached records unchanged`,
      });

      const { rows: after } = await c.query(`select code from customers where id=$1`, [cur[0].id]);
      console.log(`\nafter: customers.code = ${after[0].code}`);
      const { rows: still } = await c.query(
        `select count(*)::int as n from customers where tenant_id=$1 and code=$2`, [TENANT, from]);
      console.log(`old number ${from} now free: ${still[0].n === 0} (it stays burned — never reissued)`);

      if (!commit) throw new Rollback("rehearsal");
    });
    console.log(`\n✅ COMMITTED — ${from} is now ${to}.`);
  } catch (e) {
    if (e instanceof Rollback || (e as Error).message === "rehearsal") {
      console.log(`\n↩︎  REHEARSAL ONLY — rolled back, nothing changed. Re-run with --commit to apply.`);
      process.exit(0);
    }
    console.error(`\n✖ ${(e as Error).message}`);
    process.exit(1);
  }
})();
