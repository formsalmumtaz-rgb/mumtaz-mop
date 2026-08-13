import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getSession, resolveActor, type AppSession } from "./auth";
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

// Resolve the field-app request's actor. The PWA sends the Supabase access token
// as `Authorization: Bearer <jwt>` (DECISIONS §11.5 — the device validated it
// locally offline; the server re-authorizes here at sync). Falls back to the
// cookie session for a same-origin caller.
//
// `revoked` is true when the token is cryptographically valid but the login was
// deactivated (is_active=false) after the offline work was done — the caller then
// HOLDS the events for review instead of discarding them (T1). Returns null when
// there is no valid token / session at all (reject).
export async function resolveFieldRequest(req: Request): Promise<{ session: AppSession; revoked: boolean } | null> {
  const auth = req.headers.get("authorization");
  const bearer = auth?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (bearer) {
    let userId: string | undefined;
    try {
      const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
      const { data, error } = await sb.auth.getUser(bearer);
      if (error || !data.user) return null; // invalid / expired token -> reject
      userId = data.user.id;
    } catch {
      return null;
    }
    const resolved = await resolveActor(userId);
    if (!resolved) return null; // authenticated but not a provisioned app_user
    return { session: resolved.session, revoked: !resolved.isActive };
  }
  const s = await getSession();
  return s ? { session: s, revoked: false } : null;
}

// The technician the authenticated user operates as (technicians.user_id, mig 051),
// or null. Used by per-technician endpoints (pre-flight, etc.).
export async function technicianForUser(session: AppSession): Promise<{ id: string; service_line_id: string | null; is_team_lead: boolean } | null> {
  const { rows } = await scopedRead(
    session.tenantId,
    `select id, service_line_id, is_team_lead from technicians where tenant_id = $1 and user_id = $2 limit 1`,
    [session.tenantId, session.userId],
  );
  return rows[0]
    ? { id: rows[0].id as string, service_line_id: rows[0].service_line_id as string | null, is_team_lead: !!rows[0].is_team_lead }
    : null;
}

// Does this session's user hold a permission through any of their roles? Field
// routes resolve their own session (Bearer), so they can't use the cookie-bound
// can() — this is the same role_permissions lookup, scoped by RLS.
export async function fieldUserHasPermission(session: AppSession, code: string): Promise<boolean> {
  const { rows } = await scopedRead(
    session.tenantId,
    `select 1
       from user_roles ur
       join role_permissions rp on rp.role_id = ur.role_id
      where ur.tenant_id = $1 and ur.user_id = $2 and rp.permission_code = $3
      limit 1`,
    [session.tenantId, session.userId, code],
  );
  return rows.length > 0;
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
