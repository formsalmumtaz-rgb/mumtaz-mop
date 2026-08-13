// Pre-suite hygiene for the shared Supabase session pooler (loaded via --import
// before any test file). Two failure modes plagued the suite all along, both
// environmental, both proven repeatedly:
//   1. Reused throwaway test tenants accumulate unprocessed outbox events from
//      earlier (killed/failed) runs; scoped drains re-chew them until the pooler
//      times out. Mark stale residue processed — processed_at is the whitelisted
//      bookkeeping column (mig 008/056) and these tenants are test fixtures.
//   2. Killed runs leave idle-in-transaction sessions holding event_consumers PK
//      locks; claim inserts then hit statement_timeout. Terminate orphans.
// Only touches the named test tenants and orphaned sessions — never real data.
import pg from "pg";

const url = new URL(process.env.DATABASE_URL!);
url.search = "";
const c = new pg.Client({ connectionString: url.toString(), ssl: { rejectUnauthorized: false } });

try {
  await c.connect();
  await c.query(
    `with tt as (select id from tenants where name in
       ('T1 Inventory Test','T2 Costing Test','T1 Prov Tenant','K4 Test Tenant',
        'T5 FieldFin Test','T3 Field Test','T4 Inspection Test'))
     update outbox_events set processed_at = now()
      where processed_at is null and tenant_id in (select id from tt)
        and created_at < now() - interval '5 minutes'`);
  await c.query(
    `select pg_terminate_backend(pid) from pg_stat_activity
      where datname = current_database() and pid <> pg_backend_pid()
        and state like 'idle in transaction%'
        and state_change < now() - interval '2 minutes'`);
} catch {
  // best-effort: a failed cleanup must never fail the suite
} finally {
  await c.end().catch(() => {});
}
