import Link from "next/link";

const links = [
  { href: "/settings/master-data", title: "Master data", desc: "Service types, job types, frequencies, facility types, job sources, suppliers, pricing models." },
  { href: "/settings/users", title: "Users & roles", desc: "Invite users and manage role assignments." },
  { href: "/technicians", title: "Technicians", desc: "Workforce master — add, edit, archive." },
  { href: "/teams", title: "Teams", desc: "Field teams used in scheduling and assignment." },
];

export default function Page() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="mt-1 text-sm text-neutral-600">Administration and reference data. Every change here is audit-logged.</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="rounded-lg border border-neutral-200 bg-white p-4 hover:border-brand hover:bg-brand/5">
            <div className="font-medium">{l.title}</div>
            <div className="mt-1 text-sm text-neutral-600">{l.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
