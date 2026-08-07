import "server-only";

// Shared list controls: search term, pagination, and an include-archived toggle.
// Used by every list page so behaviour is consistent and lists stay usable past
// a few hundred rows.
export interface ListParams {
  q: string;
  page: number;
  pageSize: number;
  includeArchived: boolean;
  offset: number;
}

export function parseListParams(sp: Record<string, string | undefined>, pageSize = 50): ListParams {
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  return {
    q: (sp.q ?? "").trim(),
    page,
    pageSize,
    includeArchived: sp.archived === "1",
    offset: (page - 1) * pageSize,
  };
}
