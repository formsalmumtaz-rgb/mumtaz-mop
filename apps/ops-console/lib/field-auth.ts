import "server-only";
import { getSession, type AppSession } from "./auth";
import { scopedRead } from "./rls";

// Shared authentication + authorisation for the /api/field/* routes.
//
// The middleware matcher excludes /api/, so these routes are NOT protected by the
// edge guard — each one must authenticate itself. They were previously anonymous
// (no session), used the privileged pool (RLS bypassed) and answered with
// Access-Control-Allow-Origin: *, exposing/accepting the whole tenant's work to
// anyone with the URL. This module is the choke point that closes that.

// CORS for a field route. No wildcard. Same-origin by default (no ACAO header);
// a cross-origin field-app deployment is opted in explicitly via FIELD_APP_ORIGINS
// (comma-separated exact origins), and only then with credentials allowed so the
// Supabase session cookie is accepted.
export function fieldCors(req: Request, methods: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Allow-Headers": "content-type",
    Vary: "Origin",
  };
  const origin = req.headers.get("origin");
  const allowed = (process.env.FIELD_APP_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (origin && allowed.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
  }
  return headers;
}

// The authenticated session, or null. Field routes require a real session
// regardless of the dev auth opt-out: they are device endpoints that only make
// sense per-technician, so there is no meaningful "unauthenticated" mode for them.
export async function fieldSession(): Promise<AppSession | null> {
  return getSession();
}

// Of the given job ids, the subset assigned to a technician the authenticated user
// operates as. Used to scope writes (upload/media) to the caller's own jobs.
// Empty set when the user has no linked technician — fail closed.
export async function assignedJobIds(session: AppSession, jobIds: string[]): Promise<Set<string>> {
  const ids = [...new Set(jobIds.filter(Boolean))];
  if (ids.length === 0) return new Set();
  const { rows } = await scopedRead(
    session.tenantId,
    `select distinct ja.job_id
       from job_assignments ja
       join technicians t on t.id = ja.technician_id
      where ja.tenant_id = $1 and t.user_id = $2 and ja.job_id = any($3::uuid[])`,
    [session.tenantId, session.userId, ids],
  );
  return new Set(rows.map((r) => r.job_id as string));
}
