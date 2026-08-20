"use server";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { withRequest } from "@/lib/rls";
import { audit } from "@/lib/domain/audit";

// Admin-driven invite. The logged-in admin (user.manage) creates the auth user
// via the service-role admin API; the invitee sets their own password via the
// emailed link. We never handle passwords. The app_user + role rows are written
// under the admin's tenant/actor context.
export async function inviteUserAction(fd: FormData): Promise<void> {
  const session = await getSession();
  if (!session || !session.permissions.has("user.manage")) throw new Error("Not authorized to manage users");

  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const fullName = String(fd.get("full_name") ?? "").trim() || null;
  const roleCode = String(fd.get("role") ?? "").trim();
  if (!email || !roleCode) return;

  const origin = process.env.NEXT_PUBLIC_APP_URL || "";
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: origin ? `${origin}/auth/callback?next=/` : undefined,
  });
  if (error) throw new Error(error.message);
  const authId = data.user.id;

  await withRequest({ tenantId: session.tenantId, actorId: session.userId }, async (c) => {
    await c.query(
      `insert into app_users (id, tenant_id, full_name, email, created_by) values ($1,$2,$3,$4,$5)
         on conflict (id) do update set is_active = true, full_name = coalesce(excluded.full_name, app_users.full_name)`,
      [authId, session.tenantId, fullName, email, session.userId],
    );
    const role = await c.query(`select id from roles where tenant_id=$1 and code=$2`, [session.tenantId, roleCode]);
    if (role.rows[0]) {
      await c.query(
        `insert into user_roles (tenant_id, user_id, role_id) values ($1,$2,$3) on conflict (user_id, role_id) do nothing`,
        [session.tenantId, authId, role.rows[0].id],
      );
    }
    await audit(c, session.tenantId, { table: "app_users", rowId: authId, action: "insert", newValue: { email, role: roleCode }, note: "user invited" });
  });
  revalidatePath("/settings/users");
}

export async function setUserActiveAction(fd: FormData): Promise<void> {
  const session = await getSession();
  if (!session || !session.permissions.has("user.manage")) throw new Error("Not authorized to manage users");
  const userId = String(fd.get("user_id") ?? "");
  const active = fd.get("active") === "true";
  if (!userId) return;
  await withRequest({ tenantId: session.tenantId, actorId: session.userId }, async (c) => {
    await c.query(`update app_users set is_active=$1, updated_by=$2 where id=$3 and tenant_id=$4`, [active, session.userId, userId, session.tenantId]);
    await audit(c, session.tenantId, { table: "app_users", rowId: userId, action: "update", newValue: { is_active: active }, note: "user active toggled" });
  });
  revalidatePath("/settings/users");
}

// ── Role changes are a security event, not a settings tweak ─────────────
//
// Every one of these is admin-only (user.manage), refused at the ACTION, not
// hidden in the nav — a server action is a public POST endpoint, and hiding the
// button that calls it protects nothing. And every one writes an audit row with
// the before and the after, because "who made him a supervisor, and when?" is a
// question that gets asked after something has gone wrong, when memory is the
// least reliable source in the room.

async function requireUserAdmin() {
  const session = await getSession();
  if (!session || !session.permissions.has("user.manage")) {
    throw new Error("Not authorized to manage users");
  }
  return session;
}

/** Replace a user's roles outright. The whole set, so removals audit too. */
export async function setUserRolesAction(fd: FormData): Promise<void> {
  const session = await requireUserAdmin();
  const userId = String(fd.get("user_id") ?? "");
  const roleCodes = fd.getAll("role").map(String).filter(Boolean);
  if (!userId) return;

  await withRequest({ tenantId: session.tenantId, actorId: session.userId }, async (c) => {
    const before = (await c.query(
      `select coalesce(array_agg(r.code order by r.code), '{}') as roles
         from user_roles ur join roles r on r.id = ur.role_id
        where ur.user_id = $1 and ur.tenant_id = $2`, [userId, session.tenantId])).rows[0]?.roles ?? [];

    await c.query(`delete from user_roles where user_id = $1 and tenant_id = $2`, [userId, session.tenantId]);
    for (const code of roleCodes) {
      const r = await c.query(`select id from roles where tenant_id=$1 and code=$2`, [session.tenantId, code]);
      if (r.rows[0]) {
        await c.query(
          `insert into user_roles (tenant_id, user_id, role_id) values ($1,$2,$3)
             on conflict (user_id, role_id) do nothing`,
          [session.tenantId, userId, r.rows[0].id]);
      }
    }
    await audit(c, session.tenantId, {
      table: "user_roles", rowId: userId, action: "update",
      oldValue: { roles: before }, newValue: { roles: roleCodes },
      note: "ROLE CHANGE — access rights altered",
    });
  });
  revalidatePath("/settings/users");
}

/**
 * Approve a self-registered Google sign-in: match them to a staff record and
 * grant a role. Until this runs the person has authenticated but holds nothing
 * and reaches nothing.
 */
export async function approvePendingUserAction(fd: FormData): Promise<void> {
  const session = await requireUserAdmin();
  const userId = String(fd.get("user_id") ?? "");
  const roleCode = String(fd.get("role") ?? "").trim();
  const technicianId = String(fd.get("technician_id") ?? "").trim() || null;
  const fullName = String(fd.get("full_name") ?? "").trim() || null;
  if (!userId || !roleCode) return;

  await withRequest({ tenantId: session.tenantId, actorId: session.userId }, async (c) => {
    const before = (await c.query(
      `select status, technician_id, full_name from app_users where id=$1 and tenant_id=$2`,
      [userId, session.tenantId])).rows[0];

    await c.query(
      `update app_users
          set status = 'active', technician_id = coalesce($3::uuid, technician_id),
              full_name = coalesce($4, full_name),
              approved_by = $5, approved_at = now(), rejected_reason = null,
              updated_by = $5
        where id = $1 and tenant_id = $2`,
      [userId, session.tenantId, technicianId, fullName, session.userId]);

    const r = await c.query(`select id from roles where tenant_id=$1 and code=$2`, [session.tenantId, roleCode]);
    if (r.rows[0]) {
      await c.query(
        `insert into user_roles (tenant_id, user_id, role_id) values ($1,$2,$3)
           on conflict (user_id, role_id) do nothing`,
        [session.tenantId, userId, r.rows[0].id]);
    }
    await audit(c, session.tenantId, {
      table: "app_users", rowId: userId, action: "update",
      oldValue: { status: before?.status, technician_id: before?.technician_id },
      newValue: { status: "active", technician_id: technicianId, role: roleCode },
      note: "PENDING SIGN-IN APPROVED — access granted",
    });
  });
  revalidatePath("/settings/users");
}

/** Refuse a pending sign-in. The row stays, so the same address cannot quietly
 *  re-present itself as new — and the reason is on the record. */
export async function rejectPendingUserAction(fd: FormData): Promise<void> {
  const session = await requireUserAdmin();
  const userId = String(fd.get("user_id") ?? "");
  const reason = String(fd.get("reason") ?? "").trim() || "not recognised";
  if (!userId) return;
  await withRequest({ tenantId: session.tenantId, actorId: session.userId }, async (c) => {
    await c.query(
      `update app_users set status='deactivated', rejected_reason=$3, updated_by=$4
        where id=$1 and tenant_id=$2`, [userId, session.tenantId, reason, session.userId]);
    await audit(c, session.tenantId, {
      table: "app_users", rowId: userId, action: "update",
      oldValue: { status: "pending" }, newValue: { status: "deactivated", reason },
      note: "PENDING SIGN-IN REJECTED",
    });
  });
  revalidatePath("/settings/users");
}

/**
 * End access now. Work already queued on that device still arrives — ingest
 * stamps it needs_review rather than discarding it (T1), so a day's completed
 * jobs are never lost to a deactivation. That behaviour already existed; this is
 * the control that triggers it.
 */
export async function setUserStatusAction(fd: FormData): Promise<void> {
  const session = await requireUserAdmin();
  const userId = String(fd.get("user_id") ?? "");
  const status = String(fd.get("status") ?? "");
  if (!userId || !["active", "deactivated"].includes(status)) return;
  if (userId === session.userId && status === "deactivated") {
    throw new Error("You cannot deactivate your own account — ask another administrator");
  }
  await withRequest({ tenantId: session.tenantId, actorId: session.userId }, async (c) => {
    const before = (await c.query(`select status from app_users where id=$1 and tenant_id=$2`,
      [userId, session.tenantId])).rows[0];
    await c.query(`update app_users set status=$3, updated_by=$4 where id=$1 and tenant_id=$2`,
      [userId, session.tenantId, status, session.userId]);
    await audit(c, session.tenantId, {
      table: "app_users", rowId: userId, action: "update",
      oldValue: { status: before?.status }, newValue: { status },
      note: status === "deactivated" ? "ACCESS ENDED" : "access restored",
    });
  });
  revalidatePath("/settings/users");
}

/** Re-send an invite / send a password reset. We never handle the password. */
export async function reinviteUserAction(fd: FormData): Promise<void> {
  const session = await requireUserAdmin();
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  if (!email) return;
  const origin = process.env.NEXT_PUBLIC_APP_URL || "";
  const admin = createSupabaseAdminClient();
  const { error } = await admin.auth.resetPasswordForEmail(email, {
    redirectTo: origin ? `${origin}/auth/callback?next=/` : undefined,
  });
  if (error) throw new Error(error.message);
  await withRequest({ tenantId: session.tenantId, actorId: session.userId }, async (c) => {
    await audit(c, session.tenantId, {
      table: "app_users", rowId: String(fd.get("user_id") ?? ""), action: "update",
      newValue: { email }, note: "password reset / re-invite sent",
    });
  });
  revalidatePath("/settings/users");
}
