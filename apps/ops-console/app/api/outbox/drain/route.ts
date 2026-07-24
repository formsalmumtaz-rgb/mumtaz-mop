import { NextResponse } from "next/server";
import { drainOnce, consumers } from "@mop/worker";
import { pool } from "@/lib/db";

// Outbox drain endpoint. Two callers hit it (DECISIONS §2.C):
//   • Supabase database webhook on event insert  -> POST ?source=webhook  (primary)
//   • scheduled sweeper (Supabase pg_cron / Vercel Cron) -> GET ?source=sweeper (safety net)
// drainOnce is idempotent, so simultaneous calls are safe (proven in the K1 test).
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function handle(source: string) {
  // Any events the sweeper still finds unprocessed are ones the webhook missed;
  // a rising count signals webhook degradation (log it).
  const { rows } = await pool.query(`select count(*)::int n from outbox_events where processed_at is null`);
  const pendingBefore = rows[0].n;
  if (source === "sweeper" && pendingBefore > 0) {
    console.warn(`[outbox] sweeper caught ${pendingBefore} unprocessed event(s) — webhook may be degrading`);
  }
  const result = await drainOnce(pool, consumers);
  return NextResponse.json({ source, pending_before: pendingBefore, ...result });
}

function authorised(req: Request): boolean {
  const secret = process.env.OUTBOX_DRAIN_SECRET;
  if (!secret) return true; // dev convenience; set the secret before deploy (DEBT: enforce in prod)
  const header = req.headers.get("x-drain-secret") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return header === secret;
}

export async function POST(req: Request) {
  if (!authorised(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const source = new URL(req.url).searchParams.get("source") ?? "webhook";
  return handle(source);
}

export async function GET(req: Request) {
  if (!authorised(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const source = new URL(req.url).searchParams.get("source") ?? "sweeper";
  return handle(source);
}
