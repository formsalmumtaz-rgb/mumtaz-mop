import "server-only";
import { redirect } from "next/navigation";
import { pool } from "./db";
import { createSupabaseServerClient } from "./supabase/server";
import { authEnforced } from "./auth-flags";

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

// Session + permission resolution. Foundation for the A2 guards. Returns null
// when there is no Supabase session OR the authenticated user is not (yet) a
// provisioned app_user. In Phase A1 (before the first admin is mapped) this is
// always null, so nothing enforces yet — the app behaves exactly as before.

export interface AppSession {
  userId: string;
  tenantId: string;
  fullName: string | null;
  email: string | null;
  roles: string[];
  permissions: Set<string>;
}

export async function getSession(): Promise<AppSession | null> {
  let user;
  try {
    const supabase = await createSupabaseServerClient();
    ({ data: { user } } = await supabase.auth.getUser());
  } catch {
    return null; // auth not reachable/enabled yet — treat as unauthenticated (inert phase)
  }
  if (!user) return null;
  const resolved = await resolveActor(user.id);
  // getSession only returns a session for an ACTIVE login (deactivated users are
  // revoked — see resolveActor for the revocation-aware variant the field app uses).
  return resolved && resolved.isActive ? resolved.session : null;
}

// Resolve app_user → tenant + roles + permissions from an auth user id, WITHOUT
// filtering on is_active — the caller learns whether the login is still active.
// This is the identity bootstrap (the one read that precedes tenant scoping), so
// it uses the pool directly — a documented exception to the pool.query gate. The
// field app's Bearer path uses this to detect a revoked login and still attribute
// its already-queued events (T1).
export async function resolveActor(userId: string): Promise<{ session: AppSession; isActive: boolean } | null> {
  const { rows } = await pool.query(
    `select u.tenant_id, u.full_name, u.email, u.is_active,
            coalesce(array_agg(distinct r.code) filter (where r.code is not null), '{}') as roles,
            coalesce(array_agg(distinct rp.permission_code) filter (where rp.permission_code is not null), '{}') as perms
       from app_users u
       left join user_roles ur on ur.user_id = u.id
       left join roles r on r.id = ur.role_id
       left join role_permissions rp on rp.role_id = r.id
      where u.id = $1
      group by u.tenant_id, u.full_name, u.email, u.is_active`,
    [userId],
  );
  if (!rows[0]) return null;
  return {
    isActive: rows[0].is_active as boolean,
    session: {
      userId,
      tenantId: rows[0].tenant_id as string,
      fullName: rows[0].full_name,
      email: rows[0].email,
      roles: rows[0].roles as string[],
      permissions: new Set(rows[0].perms as string[]),
    },
  };
}

export async function can(permission: string): Promise<boolean> {
  const s = await getSession();
  return !!s && s.permissions.has(permission);
}

// Server-action guard. When enforcement is off (dev opt-out) it's a no-op that
// returns the session if any (behaviour preserved). When on, it throws unless the
// caller is authenticated AND holds the permission — so role boundaries hold even
// if the UI failed to hide a control.
export async function requirePermission(permission: string): Promise<AppSession | null> {
  if (!authEnforced()) return getSession();
  const s = await getSession();
  if (!s) throw new AuthError("Not authenticated");
  if (!s.permissions.has(permission)) throw new AuthError(`Missing permission: ${permission}`);
  return s;
}

// Page-load guard: server-side authorization for a page component. Redirects
// (rather than throwing) so an unauthorized user is cleanly bounced to /login or
// the dashboard instead of seeing an error — and, crucially, cannot VIEW a
// restricted page by typing its URL, not merely by having the menu item hidden.
export async function requireView(permission: string): Promise<void> {
  if (!authEnforced()) return; // dev/staging opt-out (same fail-closed flag as everything else)
  const s = await getSession();
  if (!s) redirect("/login");
  if (!s.permissions.has(permission)) redirect("/dashboard?denied=1");
}
