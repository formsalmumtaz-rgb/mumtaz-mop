import { NextResponse } from "next/server";
import { runAllContractBilling } from "@mop/worker";
import { pool } from "@/lib/db";

// Recurring contract billing sweep. Called by Vercel Cron daily (safety net) and
// can be triggered manually. Deterministic + idempotent (fn_run_contract_billing),
// so repeated calls generate no duplicates.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function authorised(req: Request): boolean {
  const secret = process.env.OUTBOX_DRAIN_SECRET;
  if (!secret) return true; // dev convenience; set the secret before deploy
  const header = req.headers.get("x-drain-secret") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return header === secret;
}

async function handle() {
  const generated = await runAllContractBilling(pool);
  return NextResponse.json({ ok: true, generated });
}

export async function GET(req: Request) {
  if (!authorised(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return handle();
}
export async function POST(req: Request) {
  if (!authorised(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return handle();
}
