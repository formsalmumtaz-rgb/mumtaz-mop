import { NextResponse } from "next/server";
import { putObject, r2Configured } from "@/lib/storage/r2";
import { pool } from "@/lib/db";
import { fieldSession, fieldCors, assignedJobIds } from "@/lib/field-auth";

// Receives photos/signatures from the field app and stores them in R2. Idempotent
// by media id (client UUID): R2 PUT is idempotent by key, and the job_photos/
// job_signatures row is ON CONFLICT (id) DO NOTHING.
//
// Security (previously an anonymous tenant-wide WRITE — anyone could attach media
// to any job and fill storage): requires a session, and each item is stored only
// if its job is assigned to a technician the session user operates as.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const METHODS = "POST,OPTIONS";

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { headers: fieldCors(req, METHODS) });
}

interface MediaUpload {
  id: string;
  job_id: string;
  kind: "photo" | "signature";
  content_type?: string;
  data_base64: string;
}

export async function POST(req: Request) {
  const cors = fieldCors(req, METHODS);
  const session = await fieldSession();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401, headers: cors });
  }
  if (!r2Configured()) {
    return NextResponse.json({ error: "storage not configured" }, { status: 503, headers: cors });
  }

  const body = (await req.json().catch(() => ({ media: [] }))) as { media?: MediaUpload[] };
  const items = body.media ?? [];

  // Authorise every item against the caller's own assignments up front.
  const mine = await assignedJobIds(session, items.map((m) => m.job_id));
  const accepted: string[] = [];
  let rejected = 0;

  for (const m of items) {
    if (!mine.has(m.job_id)) {
      rejected++;
      continue;
    }
    const key = `media/${session.tenantId}/${m.job_id}/${m.id}.webp`;
    const bytes = Buffer.from(m.data_base64, "base64");
    await putObject(key, bytes, m.content_type ?? "image/webp");
    if (m.kind === "photo") {
      await pool.query(
        `insert into job_photos (id, tenant_id, job_id, storage_key) values ($1,$2,$3,$4) on conflict (id) do nothing`,
        [m.id, session.tenantId, m.job_id, key],
      );
    } else {
      await pool.query(
        `insert into job_signatures (id, tenant_id, job_id, storage_key) values ($1,$2,$3,$4) on conflict (id) do nothing`,
        [m.id, session.tenantId, m.job_id, key],
      );
    }
    accepted.push(m.id);
  }
  return NextResponse.json({ accepted, rejected }, { headers: cors });
}
