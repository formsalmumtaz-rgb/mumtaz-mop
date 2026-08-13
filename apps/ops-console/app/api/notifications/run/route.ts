import { NextResponse } from "next/server";
import { runNotificationSweep } from "@mop/worker";
import { pool } from "@/lib/db";
import { authEnforced } from "@/lib/auth-flags";

// Notification sweep (DOCUMENT 9 §D, mig 068): queues the 24h-before visit
// notices + document-expiry reminders, then dispatches everything queued through
// the transport (Resend when EMAIL_API_KEY/EMAIL_FROM are set — BLOCKED A18 —
// otherwise rows are marked 'logged'). Deterministic + idempotent per job/interval,
// so repeated calls send nothing twice. Vercel Cron daily + manual trigger.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function authorised(req: Request): boolean {
  const secret = process.env.OUTBOX_DRAIN_SECRET;
  if (!secret) return !authEnforced(); // fail closed in production
  const header = req.headers.get("x-drain-secret") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return header === secret;
}

async function handle() {
  const result = await runNotificationSweep(pool);
  return NextResponse.json({ ok: true, ...result });
}

export async function GET(req: Request) {
  if (!authorised(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return handle();
}
export async function POST(req: Request) {
  if (!authorised(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return handle();
}
