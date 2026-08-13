import Link from "next/link";
import { getTenantId } from "@/lib/tenant";
import { scopedRead } from "@/lib/rls";
import { PageHeader } from "@/components/ui";

// Global search (refresh item 2): one box finds customers, contracts, invoices
// and jobs by name / number / phone — the navigation-killer every serious FSM has.
export const dynamic = "force-dynamic";

export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = ((await searchParams).q ?? "").trim();
  const tenantId = await getTenantId();
  const like = `%${q}%`;
  const [cu, ct, inv, jb] = q.length < 2 ? [[], [], [], []] : await Promise.all([
    scopedRead(tenantId,
      `select distinct c.id, coalesce(c.trade_name, c.legal_name) as name, c.code
         from customers c left join contacts k on k.customer_id = c.id
        where c.tenant_id = $1 and c.archived_at is null
          and (c.trade_name ilike $2 or c.legal_name ilike $2 or c.code ilike $2 or c.trn ilike $2 or k.phone ilike $2)
        limit 10`, [tenantId, like]).then((r) => r.rows),
    scopedRead(tenantId,
      `select ct.id, ct.contract_number, cu.trade_name from contracts ct join customers cu on cu.id = ct.customer_id
        where ct.tenant_id = $1 and ct.archived_at is null and ct.contract_number ilike $2 limit 10`, [tenantId, like]).then((r) => r.rows),
    scopedRead(tenantId,
      `select i.id, i.invoice_number, cu.trade_name from invoices i join customers cu on cu.id = i.customer_id
        where i.tenant_id = $1 and i.invoice_number ilike $2 limit 10`, [tenantId, like]).then((r) => r.rows),
    scopedRead(tenantId,
      `select j.id, j.scheduled_date::text as d, cu.trade_name from jobs j join customers cu on cu.id = j.customer_id
        where j.tenant_id = $1 and cu.trade_name ilike $2 order by j.scheduled_date desc nulls last limit 10`, [tenantId, like]).then((r) => r.rows),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader title="Search" description={q ? `Results for “${q}”` : "Type a customer, contract number, invoice number, TRN, or phone."} />
      <form method="get"><input name="q" defaultValue={q} autoFocus placeholder="Search everything…"
        className="w-full max-w-xl rounded border border-neutral-300 px-3 py-2.5 text-sm" /></form>
      {q.length >= 2 && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Section title="Customers" rows={cu.map((r: Record<string, string>) => ({ href: `/customers/${r.id}`, a: r.name, b: r.code }))} />
          <Section title="Contracts" rows={ct.map((r: Record<string, string>) => ({ href: `/contracts/${r.id}`, a: r.contract_number ?? "(no number)", b: r.trade_name }))} />
          <Section title="Invoices" rows={inv.map((r: Record<string, string>) => ({ href: `/invoices/${r.id}`, a: r.invoice_number ?? "(draft)", b: r.trade_name }))} />
          <Section title="Jobs" rows={jb.map((r: Record<string, string>) => ({ href: `/jobs/${r.id}`, a: r.d ?? "(unscheduled)", b: r.trade_name }))} />
        </div>
      )}
    </div>
  );
}

function Section({ title, rows }: { title: string; rows: { href: string; a: string; b: string | null }[] }) {
  return (
    <section className="rounded-lg border border-neutral-200 bg-white">
      <div className="border-b border-neutral-100 px-4 py-2.5 text-sm font-medium">{title} <span className="text-neutral-400">({rows.length})</span></div>
      {rows.length === 0 ? <p className="px-4 py-3 text-sm text-neutral-400">No matches.</p> : (
        <ul className="divide-y divide-neutral-100">
          {rows.map((r, i) => (
            <li key={i}><Link href={r.href} className="flex justify-between px-4 py-2.5 text-sm hover:bg-brand/5">
              <span className="font-medium text-brand">{r.a}</span><span className="text-neutral-500">{r.b}</span></Link></li>
          ))}
        </ul>
      )}
    </section>
  );
}
