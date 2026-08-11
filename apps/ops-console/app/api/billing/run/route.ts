import { NextResponse } from "next/server";
import { runAllContractBilling } from "@mop/worker";
import { pool } from "@/lib/db";
import { authEnforced } from "@/lib/auth-flags";

// Recurring contract billing sweep. Called by Vercel Cron daily (safety net) and
// can be triggered manually. Deterministic + idempotent (fn_run_contract_billing),
// so repeated calls generate no duplicates.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function authorised(req: Request): boolean {
  const secret = process.env.OUTBOX_DRAIN_SECRET;
  // Fail closed in production: a missing secret must NOT grant access. Only the
  // dev auth opt-out (authEnforced() === false) allows the secret-less shortcut.
  if (!secret) return !authEnforced();
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
