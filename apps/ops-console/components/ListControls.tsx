import Link from "next/link";
import { Input, Button, ButtonLink } from "./ui";

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

export function ListToolbar({ basePath, params, placeholder = "Search…", showArchived = true }: {
  basePath: string; params: Record<string, string | undefined>; placeholder?: string; showArchived?: boolean;
}) {
  const archived = params.archived === "1";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <form className="flex gap-2" action={basePath} method="get">
        <Input name="q" defaultValue={params.q ?? ""} placeholder={placeholder} className="w-64" />
        {showArchived && archived && <input type="hidden" name="archived" value="1" />}
        <Button type="submit" variant="secondary">Search</Button>
      </form>
      {showArchived && (
        <ButtonLink href={withParams(basePath, params, { archived: archived ? undefined : "1", page: undefined })}
                    variant={archived ? "primary" : "secondary"}>
          {archived ? "✓ Including archived" : "Include archived"}
        </ButtonLink>
      )}
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
      <div className="flex items-center gap-2">
        {page > 1 && <Link href={withParams(basePath, params, { page: String(page - 1) })} className="rounded-md border border-neutral-300 bg-white px-3 py-1 hover:bg-neutral-50">← Prev</Link>}
        <span className="px-2 py-1 text-neutral-500">Page {page} / {pages}</span>
        {page < pages && <Link href={withParams(basePath, params, { page: String(page + 1) })} className="rounded-md border border-neutral-300 bg-white px-3 py-1 hover:bg-neutral-50">Next →</Link>}
      </div>
    </div>
  );
}
