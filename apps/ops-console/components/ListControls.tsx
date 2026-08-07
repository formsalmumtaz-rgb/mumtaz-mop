import Link from "next/link";

// Server-rendered search box + include-archived toggle + pagination. Preserves
// existing query params. Reusable across every list page.
function withParams(base: string, current: Record<string, string | undefined>, overrides: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...current, ...overrides })) {
    if (v != null && v !== "") sp.set(k, v);
  }
  const qs = sp.toString();
  return qs ? `${base}?${qs}` : base;
}

export function ListToolbar({ basePath, params, placeholder = "Search…" }: {
  basePath: string; params: Record<string, string | undefined>; placeholder?: string;
}) {
  const archived = params.archived === "1";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <form className="flex gap-2" action={basePath} method="get">
        <input name="q" defaultValue={params.q ?? ""} placeholder={placeholder}
               className="w-64 rounded border border-neutral-300 px-3 py-1.5 text-sm" />
        {archived && <input type="hidden" name="archived" value="1" />}
        <button className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50">Search</button>
      </form>
      <Link href={withParams(basePath, params, { archived: archived ? undefined : "1", page: undefined })}
            className={`rounded border px-3 py-1.5 text-sm ${archived ? "border-brand bg-brand/5 text-brand" : "border-neutral-300 hover:bg-neutral-50"}`}>
        {archived ? "✓ Including archived" : "Include archived"}
      </Link>
    </div>
  );
}

export function Pagination({ basePath, params, page, pageSize, total }: {
  basePath: string; params: Record<string, string | undefined>; page: number; pageSize: number; total: number;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return <p className="text-xs text-neutral-500">{total} result(s)</p>;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-neutral-500">{from}–{to} of {total}</span>
      <div className="flex gap-2">
        {page > 1 && <Link href={withParams(basePath, params, { page: String(page - 1) })} className="rounded border border-neutral-300 px-3 py-1 hover:bg-neutral-50">← Prev</Link>}
        <span className="px-2 py-1 text-neutral-500">Page {page} / {pages}</span>
        {page < pages && <Link href={withParams(basePath, params, { page: String(page + 1) })} className="rounded border border-neutral-300 px-3 py-1 hover:bg-neutral-50">Next →</Link>}
      </div>
    </div>
  );
}
