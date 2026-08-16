import { NextResponse } from "next/server";
import { putObject, r2Configured } from "@/lib/storage/r2";
import { pool } from "@/lib/db";
import { resolveFieldRequest, fieldCors, assignedJobIds } from "@/lib/field-auth";

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
  // "signature" = customer representative, "signature_tech" = technician (item 20)
  kind: "photo" | "signature" | "signature_tech" | "expense_receipt";
  content_type?: string;
  data_base64: string;
}

const EXT_BY_TYPE: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

export async function POST(req: Request) {
  const cors = fieldCors(req, METHODS);
  const auth = await resolveFieldRequest(req);
  if (!auth) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401, headers: cors });
  }
  if (auth.revoked) {
    return NextResponse.json({ error: "revoked" }, { status: 401, headers: { ...cors, "x-mop-revoked": "1" } });
  }
  const session = auth.session;
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
    // Expense receipts are not job-bound (item 3A): the authenticated session
    // is the authority; the file links to the expense by its client identity.
    if (m.kind === "expense_receipt") {
      const contentType = m.content_type ?? "image/webp";
      const ext = EXT_BY_TYPE[contentType] ?? "webp";
      const key = `receipts/${session.tenantId}/${m.id}.${ext}`;
      await putObject(key, Buffer.from(m.data_base64, "base64"), contentType);
      await pool.query(
        `insert into expense_receipt_files (tenant_id, client_uuid, storage_key)
         values ($1, $2, $3) on conflict (tenant_id, client_uuid) do nothing`,
        [session.tenantId, m.job_id || m.id, key]);
      accepted.push(m.id);
      continue;
    }
    if (!mine.has(m.job_id)) {
      rejected++;
      continue;
    }
    const contentType = m.content_type ?? "image/webp";
    const ext = EXT_BY_TYPE[contentType] ?? "webp";
    const key = `media/${session.tenantId}/${m.job_id}/${m.id}.${ext}`;
    const bytes = Buffer.from(m.data_base64, "base64");
    await putObject(key, bytes, contentType);
    if (m.kind === "photo") {
      await pool.query(
        `insert into job_photos (id, tenant_id, job_id, storage_key) values ($1,$2,$3,$4) on conflict (id) do nothing`,
        [m.id, session.tenantId, m.job_id, key],
      );
    } else {
      const signer = m.kind === "signature_tech" ? "technician" : "customer";
      await pool.query(
        `insert into job_signatures (id, tenant_id, job_id, storage_key, signer) values ($1,$2,$3,$4,$5) on conflict (id) do nothing`,
        [m.id, session.tenantId, m.job_id, key, signer],
      );
    }
    accepted.push(m.id);
  }
  return NextResponse.json({ accepted, rejected }, { headers: cors });
}
