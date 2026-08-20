import "server-only";
import { cache } from "react";
import { pool } from "./db";

// K1b runs in a single fixed admin context (the seeded Mumtaz tenant, no login
// yet). Real Supabase Auth for office staff is a later slice.
// One tenant, and its id never changes (Art. II) — so this is a constant the
// process can learn once rather than a lookup every page pays for. React's
// cache() only dedupes WITHIN a request; measured, this was still ~40ms on
// every single render. The process-level memo makes it ~40ms once, then free.
//
// Deliberately not a build-time constant: the id differs between the staging
// and production databases, and hard-coding it is how an app ends up writing to
// the wrong tenant after a cutover.
let tenantIdMemo: string | null = null;

export const getTenantId = cache(async (): Promise<string> => {
  if (tenantIdMemo) return tenantIdMemo;
  const { rows } = await pool.query(
    `select id from tenants where name = $1 limit 1`,
    ["Mumtaz Integrated Services Group"],
  );
  if (!rows[0]) throw new Error("Seed tenant not found — apply migration 010_seed");
  tenantIdMemo = rows[0].id as string;
  return tenantIdMemo;
});
