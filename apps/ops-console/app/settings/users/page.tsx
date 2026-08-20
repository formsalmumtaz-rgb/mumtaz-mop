import Link from "next/link";
import { getSession } from "@/lib/auth";
import { withRequest } from "@/lib/rls";
import {
  inviteUserAction, setUserRolesAction, setUserStatusAction,
  approvePendingUserAction, rejectPendingUserAction, reinviteUserAction,
} from "./actions";

// Admin-only, full lifecycle. Every control here is refused at the ACTION as
// well as hidden from the page — a server action is a public POST endpoint, and
// a hidden button protects nothing.
export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-800",
  pending: "bg-amber-100 text-amber-800",
  deactivated: "bg-neutral-200 text-neutral-600",
};

function when(v: string | null): string {
  if (!v) return "never";
  const d = new Date(v);
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return d.toISOString().slice(0, 10);
}

export default async function UsersPage() {
  const session = await getSession();

  if (!session || !session.permissions.has("user.manage")) {
    return (
      <div className="mx-auto max-w-lg space-y-3">
        <h1 className="text-2xl font-semibold">Users &amp; roles</h1>
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {session
            ? "User management is restricted to administrators."
            : "Sign in as an administrator to manage users. "}
          {!session && <Link href="/login" className="font-medium underline">Sign in →</Link>}
        </p>
      </div>
    );
  }

  const { users, roles, technicians, matrix } = await withRequest(
    { tenantId: session.tenantId, actorId: session.userId }, async (c) => {
    const u = await c.query(
      `select u.id, u.full_name, u.email, u.status, u.last_sign_in_at::text,
              u.technician_id, t.full_name as technician_name, t.code as technician_code,
              u.google_email is not null as has_google,
              exists (select 1 from app_user_identities i
                       where i.app_user_id = u.id and i.provider = 'google') as linked_google,
              coalesce(array_agg(distinct r.code) filter (where r.code is not null), '{}') as roles
         from app_users u
         left join user_roles ur on ur.user_id = u.id
         left join roles r on r.id = ur.role_id
         left join technicians t on t.id = u.technician_id
        where u.tenant_id = $1
        group by u.id, u.full_name, u.email, u.status, u.last_sign_in_at,
                 u.technician_id, t.full_name, t.code, u.google_email
        order by (u.status = 'pending') desc, u.email`,
      [session.tenantId]);
    const r = await c.query(`select code, name from roles where tenant_id=$1 order by name`, [session.tenantId]);
    const tech = await c.query(
      `select id, coalesce(full_name, code, 'Technician') as name, code from technicians
        where tenant_id=$1 and coalesce(is_active, true) order by name`, [session.tenantId]);
    // The role definitions, read-only — so it is possible to see exactly what a
    // role grants BEFORE granting it, rather than after someone uses it.
    const m = await c.query(
      `select r.code as role, p.code as permission, p.description
         from roles r
         join role_permissions rp on rp.role_id = r.id
         join permissions p on p.code = rp.permission_code
        where r.tenant_id = $1
        order by r.code, p.code`, [session.tenantId]);
    return { users: u.rows, roles: r.rows, technicians: tech.rows, matrix: m.rows };
  });

  const pending = users.filter((u) => u.status === "pending");
  const rest = users.filter((u) => u.status !== "pending");
  const byRole = new Map<string, { permission: string; description: string }[]>();
  for (const row of matrix) {
    if (!byRole.has(row.role)) byRole.set(row.role, []);
    byRole.get(row.role)!.push({ permission: row.permission, description: row.description });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Users, roles &amp; access</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Administrators only. Every change here is written to the audit log with who made it and what it was before.
        </p>
      </div>

      {/* ── Pending self-registrations ─────────────────────────────── */}
      <section className={`rounded-lg border p-4 ${pending.length ? "border-amber-300 bg-amber-50" : "border-neutral-200 bg-white"}`}>
        <h2 className="font-medium">
          Waiting for approval {pending.length > 0 && <span className="ml-1 rounded-full bg-amber-200 px-2 py-0.5 text-xs">{pending.length}</span>}
        </h2>
        {pending.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">
            Nobody is waiting. When someone signs in with Google for the first time they appear here — with no access until you approve them.
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            {pending.map((u) => (
              <div key={u.id} className="rounded-md border border-amber-200 bg-white p-3">
                <div className="text-sm font-medium">{u.full_name ?? "(no name from Google)"}</div>
                <div className="text-xs text-neutral-500">{u.email} · first seen {when(u.last_sign_in_at)}</div>
                <form action={approvePendingUserAction} className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-4">
                  <input type="hidden" name="user_id" value={u.id} />
                  <input name="full_name" defaultValue={u.full_name ?? ""} placeholder="Full name"
                         className="rounded border border-neutral-300 px-2 py-2 text-sm" />
                  <select name="technician_id" className="rounded border border-neutral-300 px-2 py-2 text-sm">
                    <option value="">Staff record… (optional)</option>
                    {technicians.map((t) => <option key={t.id} value={t.id}>{t.name}{t.code ? ` (${t.code})` : ""}</option>)}
                  </select>
                  <select name="role" required className="rounded border border-neutral-300 px-2 py-2 text-sm">
                    <option value="">Role…</option>
                    {roles.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
                  </select>
                  <button className="rounded bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700">
                    Approve &amp; grant access
                  </button>
                </form>
                <form action={rejectPendingUserAction} className="mt-2 flex gap-2">
                  <input type="hidden" name="user_id" value={u.id} />
                  <input name="reason" placeholder="Reason (kept on the record)"
                         className="flex-1 rounded border border-neutral-200 px-2 py-1.5 text-xs" />
                  <button className="text-xs text-neutral-500 hover:text-red-600">Reject</button>
                </form>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Invite ─────────────────────────────────────────────────── */}
      <details className="rounded-lg border border-neutral-200 bg-white p-4">
        <summary className="cursor-pointer font-medium">Invite a user by email</summary>
        <form action={inviteUserAction} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <input name="email" type="email" required placeholder="Email" className="rounded border border-neutral-300 px-2 py-2 text-sm" />
          <input name="full_name" placeholder="Full name" className="rounded border border-neutral-300 px-2 py-2 text-sm" />
          <select name="role" required className="rounded border border-neutral-300 px-2 py-2 text-sm">
            <option value="">Role…</option>{roles.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
          </select>
          <div className="sm:col-span-3">
            <button className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">Send invite</button>
            <span className="ml-3 text-xs text-neutral-500">They set their own password from the emailed link — passwords are never handled here.</span>
          </div>
        </form>
      </details>

      {/* ── Everyone ───────────────────────────────────────────────── */}
      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-neutral-100 text-left text-neutral-600">
            <tr>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Email</th>
              <th className="px-3 py-2 font-medium">Role</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Sign-in</th>
              <th className="px-3 py-2 font-medium">Last seen</th>
              <th className="px-3 py-2 font-medium">Staff record</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {rest.length === 0 && <tr><td colSpan={8} className="px-3 py-6 text-center text-neutral-500">No users yet.</td></tr>}
            {rest.map((u) => (
              <tr key={u.id} className={u.status === "deactivated" ? "opacity-60" : ""}>
                <td className="px-3 py-2">{u.full_name ?? "—"}</td>
                <td className="px-3 py-2 text-neutral-600">{u.email}</td>
                <td className="px-3 py-2">
                  {/* Change any user's role after creation — no database access. */}
                  <form action={setUserRolesAction} className="flex items-center gap-1">
                    <input type="hidden" name="user_id" value={u.id} />
                    <select name="role" defaultValue={(u.roles as string[])[0] ?? ""}
                            className="rounded border border-neutral-300 px-2 py-1 text-xs">
                      <option value="">(none)</option>
                      {roles.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
                    </select>
                    <button className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50">save</button>
                  </form>
                </td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[u.status] ?? ""}`}>{u.status}</span>
                </td>
                <td className="px-3 py-2 text-xs text-neutral-500">{u.linked_google ? "Google" : "Password"}</td>
                <td className="px-3 py-2 text-xs text-neutral-500">{when(u.last_sign_in_at)}</td>
                <td className="px-3 py-2 text-xs text-neutral-600">
                  {u.technician_name ? `${u.technician_name}${u.technician_code ? ` (${u.technician_code})` : ""}` : "—"}
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <form action={setUserStatusAction} className="inline">
                    <input type="hidden" name="user_id" value={u.id} />
                    <input type="hidden" name="status" value={u.status === "active" ? "deactivated" : "active"} />
                    <button className="text-xs text-neutral-500 hover:text-red-600">
                      {u.status === "active" ? "deactivate" : "reactivate"}
                    </button>
                  </form>
                  <form action={reinviteUserAction} className="ml-3 inline">
                    <input type="hidden" name="user_id" value={u.id} />
                    <input type="hidden" name="email" value={u.email} />
                    <button className="text-xs text-neutral-500 hover:text-neutral-800">reset</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-neutral-500">
        Deactivating ends access immediately. Work already queued on that person&rsquo;s device still arrives and is held for
        review — a day&rsquo;s completed jobs are never silently discarded.
      </p>

      {/* ── What each role actually grants ─────────────────────────── */}
      <section className="rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="font-medium">What each role grants</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Read-only. This is the live grant table, not a description of it — what you see here is what the server enforces.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          {roles.map((r) => {
            const perms = byRole.get(r.code) ?? [];
            return (
              <div key={r.code} className="rounded-md border border-neutral-200 p-3">
                <div className="flex items-baseline justify-between">
                  <span className="font-medium">{r.name}</span>
                  <span className="text-xs text-neutral-400">{perms.length} permissions</span>
                </div>
                <ul className="mt-2 space-y-0.5">
                  {perms.length === 0 && <li className="text-xs text-neutral-400">No permissions.</li>}
                  {perms.map((p) => (
                    <li key={p.permission} className="text-xs text-neutral-600" title={p.description}>
                      <span className="font-mono text-[11px] text-neutral-500">{p.permission}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
