import "server-only";
import { cache } from "react";
import { pool } from "./db";

// K1b runs in a single fixed admin context (the seeded Mumtaz tenant, no login
// yet). Real Supabase Auth for office staff is a later slice.
export const getTenantId = cache(async (): Promise<string> => {
  const { rows } = await pool.query(
    `select id from tenants where name = $1 limit 1`,
    ["Mumtaz Integrated Services Group"],
  );
  if (!rows[0]) throw new Error("Seed tenant not found — apply migration 010_seed");
  return rows[0].id as string;
});
