import Link from "next/link";
import { getSession } from "@/lib/auth";
import { withRequest } from "@/lib/rls";
import { inviteUserAction, setUserActiveAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const session = await getSession();

  if (!session || !session.permissions.has("user.manage")) {
    return (
      <div className="mx-auto max-w-lg space-y-3">
        <h1 className="text-2xl font-semibold">Users &amp; roles</h1>
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {session
            ? "You don't have permission to manage users. Ask an administrator."
            : "Sign in as an administrator to manage users. "}
          {!session && <Link href="/login" className="font-medium underline">Sign in →</Link>}
        </p>
        <p className="text-xs text-neutral-500">User management goes live once Supabase Auth is enabled and the first admin is provisioned (security Phase A2).</p>
      </div>
    );
  }

  const { users, roles } = await withRequest({ tenantId: session.tenantId, actorId: session.userId }, async (c) => {
    const u = await c.query(
      `select u.id, u.full_name, u.email, u.is_active,
              coalesce(array_agg(distinct r.code) filter (where r.code is not null), '{}') as roles
         from app_users u
         left join user_roles ur on ur.user_id = u.id
         left join roles r on r.id = ur.role_id
        where u.tenant_id = $1 group by u.id, u.full_name, u.email, u.is_active order by u.email`,
      [session.tenantId],
    );
    const r = await c.query(`select code, name from roles where tenant_id=$1 order by name`, [session.tenantId]);
    return { users: u.rows, roles: r.rows };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Users &amp; roles</h1>
        <p className="mt-1 text-sm text-neutral-600">Invite office staff and assign a role. Invitees set their own password via email — passwords are never handled here.</p>
      </div>

      <details className="rounded-lg border border-neutral-200 bg-white p-4" open={users.length === 0}>
        <summary className="cursor-pointer font-medium">Invite a user</summary>
        <form action={inviteUserAction} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <input name="email" type="email" required placeholder="Email" className="rounded border border-neutral-300 px-2 py-2 text-sm" />
          <input name="full_name" placeholder="Full name" className="rounded border border-neutral-300 px-2 py-2 text-sm" />
          <select name="role" required className="rounded border border-neutral-300 px-2 py-2 text-sm">
            <option value="">Role…</option>{roles.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
          </select>
          <div className="sm:col-span-3"><button className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">Send invite</button></div>
        </form>
      </details>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-neutral-100 text-left text-neutral-600">
            <tr><th className="px-3 py-2 font-medium">Email</th><th className="px-3 py-2 font-medium">Name</th><th className="px-3 py-2 font-medium">Roles</th><th className="px-3 py-2 font-medium">Status</th><th className="px-3 py-2"></th></tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {users.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-neutral-500">No users yet — invite one above.</td></tr>}
            {users.map((u) => (
              <tr key={u.id}>
                <td className="px-3 py-2">{u.email}</td>
                <td className="px-3 py-2 text-neutral-600">{u.full_name ?? "—"}</td>
                <td className="px-3 py-2 text-neutral-600">{(u.roles as string[]).join(", ") || "—"}</td>
                <td className="px-3 py-2">{u.is_active ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">active</span> : <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs">disabled</span>}</td>
                <td className="px-3 py-2 text-right">
                  <form action={setUserActiveAction}><input type="hidden" name="user_id" value={u.id} /><input type="hidden" name="active" value={(!u.is_active).toString()} />
                    <button className="text-xs text-neutral-500 hover:text-neutral-800">{u.is_active ? "disable" : "enable"}</button></form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
