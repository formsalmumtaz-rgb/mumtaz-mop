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

// Export the list AS FILTERED — the links carry the page's own query string, so
// the file matches the screen. Excel for working with, PDF for sending.
export function ExportButtons({ dataset, params }: {
  dataset: string; params: Record<string, string | undefined>;
}) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v != null && v !== "" && k !== "format") sp.set(k, v);
  const href = (format: string) => {
    const p = new URLSearchParams(sp); p.set("format", format);
    return `/api/export/${dataset}?${p.toString()}`;
  };
  const cls = "rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm hover:bg-neutral-50";
  return (
    <div className="flex gap-1.5">
      <a href={href("xlsx")} className={cls} title="Download this list, with these filters, as Excel">Excel</a>
      <a href={href("pdf")} className={cls} title="Download this list, with these filters, as PDF">PDF</a>
    </div>
  );
}

// Filter chips driven by one query param. Selecting a value resets paging.
export function FilterChips({ basePath, params, name, options, allLabel = "All" }: {
  basePath: string; params: Record<string, string | undefined>; name: string;
  options: { value: string; label: string }[]; allLabel?: string;
}) {
  const current = params[name] ?? "";
  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1 text-xs font-medium ${active ? "border-brand bg-brand/5 text-brand" : "border-neutral-300 text-neutral-600 hover:bg-neutral-50"}`;
  return (
    <div className="flex flex-wrap gap-1">
      <Link href={withParams(basePath, params, { [name]: undefined, page: undefined })} className={chip(!current)}>{allLabel}</Link>
      {options.map((o) => (
        <Link key={o.value} href={withParams(basePath, params, { [name]: o.value, page: undefined })} className={chip(current === o.value)}>
          {o.label}
        </Link>
      ))}
    </div>
  );
}

// From/to date filter. Plain date inputs — the browser's own picker, no library.
export function DateRangeFilter({ basePath, params, label = "Date range" }: {
  basePath: string; params: Record<string, string | undefined>; label?: string;
}) {
  return (
    <form action={basePath} method="get" className="flex flex-wrap items-center gap-1.5 text-sm">
      {Object.entries(params).map(([k, v]) =>
        v && k !== "from" && k !== "to" && k !== "page"
          ? <input key={k} type="hidden" name={k} value={v} /> : null)}
      <span className="text-xs text-neutral-500">{label}</span>
      <Input type="date" name="from" defaultValue={params.from ?? ""} className="w-36" />
      <span className="text-xs text-neutral-400">to</span>
      <Input type="date" name="to" defaultValue={params.to ?? ""} className="w-36" />
      <Button type="submit" variant="secondary">Apply</Button>
      {(params.from || params.to) && (
        <Link href={withParams(basePath, params, { from: undefined, to: undefined, page: undefined })}
              className="text-xs text-neutral-500 underline">clear</Link>
      )}
    </form>
  );
}
