import { NextResponse } from "next/server";
import { putObject, r2Configured } from "@/lib/storage/r2";
import { pool } from "@/lib/db";
import { getTenantId } from "@/lib/tenant";

// Receives photos/signatures from the field app and stores them in R2. Idempotent
// by media id (client UUID): R2 PUT is idempotent by key, and the job_photos/
// job_signatures row is ON CONFLICT (id) DO NOTHING — safe to re-post after an
// interrupted sync.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const cors: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

export async function OPTIONS() {
  return new NextResponse(null, { headers: cors });
}

interface MediaUpload {
  id: string;
  job_id: string;
  kind: "photo" | "signature";
  content_type?: string;
  data_base64: string;
}

export async function POST(req: Request) {
  if (!r2Configured()) {
    return NextResponse.json({ error: "storage not configured" }, { status: 503, headers: cors });
  }
  const tenantId = await getTenantId();
  const body = (await req.json().catch(() => ({ media: [] }))) as { media?: MediaUpload[] };
  const accepted: string[] = [];

  for (const m of body.media ?? []) {
    const key = `media/${tenantId}/${m.job_id}/${m.id}.webp`;
    const bytes = Buffer.from(m.data_base64, "base64");
    await putObject(key, bytes, m.content_type ?? "image/webp");
    if (m.kind === "photo") {
      await pool.query(
        `insert into job_photos (id, tenant_id, job_id, storage_key) values ($1,$2,$3,$4) on conflict (id) do nothing`,
        [m.id, tenantId, m.job_id, key],
      );
    } else {
      await pool.query(
        `insert into job_signatures (id, tenant_id, job_id, storage_key) values ($1,$2,$3,$4) on conflict (id) do nothing`,
        [m.id, tenantId, m.job_id, key],
      );
    }
    accepted.push(m.id);
  }
  return NextResponse.json({ accepted }, { headers: cors });
}
