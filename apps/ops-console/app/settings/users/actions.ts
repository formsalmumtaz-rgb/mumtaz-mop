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
