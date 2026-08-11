import { getTenantId } from "@/lib/tenant";
import { getServiceLineId, listPricingModels } from "@/lib/domain/reference";
import { listCategories } from "@/lib/domain/categories";
import { listBom, listBomItemOptions, type BomLine, type ItemOption } from "@/lib/domain/categorybom";
import { AssumedBadge } from "@/components/AssumedBadge";
import { Card, Badge, Button, TableWrap, Thead, Tbody, PageHeader } from "@/components/ui";
import { CategoryForm } from "./CategoryForm";
import { createCategoryAction, updateCategoryAction, archiveCategoryAction, restoreCategoryAction, addBomLineAction, removeBomLineAction } from "./actions";
import Link from "next/link";

export const dynamic = "force-dynamic";

const aed = (v: string | null) => (v == null || v === "" ? "—" : "AED " + Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 }));

export default async function CategoriesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const includeArchived = sp.archived === "1";
  const tenantId = await getTenantId();
  const sl = await getServiceLineId(tenantId);
  const [categories, pricingModels] = await Promise.all([
    listCategories(tenantId, sl, includeArchived),
    listPricingModels(tenantId),
  ]);
  const pmOpts = pricingModels.map((p) => ({ id: p.id, name: p.name }));
  // BOM (materials) per category + the division's item options (shared across categories in this division).
  const itemOpts: ItemOption[] = categories[0] ? await listBomItemOptions(tenantId, categories[0].id) : [];
  const bomByCat = new Map<string, { lines: BomLine[]; total: string }>(
    await Promise.all(categories.map(async (c) => [c.id, await listBom(tenantId, c.id)] as const)),
  );
  const aedt = (v: string) => "AED " + Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 });
  const assumed = categories.filter((c) => c.is_assumed).length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Service categories"
        description="Configurable, per-service categories (Studio, 1 BHK, Restaurant A…). Each carries deterministic assumptions — crew, duration, buffer, material cost, and a pricing recommendation — that auto-fill survey and estimate lines. No hardcoding, no AI in the calculation."
        actions={
          <Link href={includeArchived ? "/categories" : "/categories?archived=1"}
                className={`rounded-md border px-3 py-1.5 text-sm ${includeArchived ? "border-brand bg-brand/5 text-brand" : "border-neutral-300 hover:bg-neutral-50"}`}>
            {includeArchived ? "✓ Including archived" : "Include archived"}
          </Link>
        }
      />

      {assumed > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          <b>{assumed}</b> categor{assumed === 1 ? "y is" : "ies are"} seeded with placeholder assumptions. Set the real crew/duration/material/price before relying on their estimates.
        </div>
      )}

      <Card>
        <details open={categories.length === 0}>
          <summary className="cursor-pointer p-4 font-medium sm:p-5">New category</summary>
          <div className="border-t border-neutral-100 p-4 sm:p-5">
            <CategoryForm action={createCategoryAction} pricingModels={pmOpts} submitLabel="Create category" />
          </div>
        </details>
      </Card>

      <TableWrap minWidth={900}>
        <Thead>
          <tr>
            <th className="px-4 py-2.5 font-medium">Category</th>
            <th className="px-4 py-2.5 font-medium">Type</th>
            <th className="px-4 py-2.5 font-medium text-right">Crew</th>
            <th className="px-4 py-2.5 font-medium text-right">Duration</th>
            <th className="px-4 py-2.5 font-medium text-right">Material</th>
            <th className="px-4 py-2.5 font-medium text-right">Rec. price</th>
            <th className="px-4 py-2.5 font-medium">Status</th>
            <th className="px-4 py-2.5 font-medium text-right">Actions</th>
          </tr>
        </Thead>
        <Tbody>
          {categories.length === 0 && (
            <tr><td colSpan={8} className="px-4 py-6 text-center text-neutral-500">No categories yet — add one above.</td></tr>
          )}
          {categories.map((c) => (
            <tr key={c.id} className={`align-top ${!c.is_active ? "opacity-60" : ""}`}>
              <td className="px-4 py-2.5">
                <div className="font-medium">{c.name}</div>
                <div className="font-mono text-xs text-neutral-400">{c.code}</div>
                {c.is_active && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs text-brand">Edit</summary>
                    <CategoryForm action={updateCategoryAction} pricingModels={pmOpts} initial={c} submitLabel="Save changes" />
                  </details>
                )}
                {c.is_active && (() => {
                  const bom = bomByCat.get(c.id) ?? { lines: [], total: "0" };
                  return (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs text-brand">Materials (BOM) · {bom.lines.length} · {aedt(bom.total)}/job</summary>
                      <div className="mt-2 space-y-2 rounded-md border border-neutral-200 bg-neutral-50 p-3">
                        {bom.lines.length === 0 && <p className="text-xs text-neutral-500">No materials yet. Add the standard chemicals/consumables this category uses per job.</p>}
                        {bom.lines.map((b) => (
                          <div key={b.id} className="flex items-center justify-between gap-2 text-xs">
                            <span>{b.item_name} <span className="text-neutral-400">({b.item_type})</span> — <b>{b.quantity}</b> {b.unit_code ?? ""} × {aedt(b.unit_cost)} = <b>{aedt(b.line_cost)}</b></span>
                            <form action={removeBomLineAction}><input type="hidden" name="id" value={b.id} /><button className="text-neutral-400 hover:text-red-600">remove</button></form>
                          </div>
                        ))}
                        <form action={addBomLineAction} className="flex flex-wrap items-end gap-2 border-t border-neutral-200 pt-2">
                          <input type="hidden" name="category_id" value={c.id} />
                          <label className="text-xs"><span className="text-neutral-500">Item</span>
                            <select name="item_id" required className="mt-0.5 block w-52 rounded border border-neutral-300 px-2 py-1 text-xs">
                              <option value="">Select…</option>
                              {itemOpts.map((o) => <option key={o.id} value={o.id}>{o.name} ({o.item_type}{o.unit_code ? `, ${o.unit_code}` : ""})</option>)}
                            </select></label>
                          <label className="text-xs"><span className="text-neutral-500">Qty / job</span>
                            <input name="quantity" type="number" min="0" step="any" required placeholder="e.g. 50 or 0.25" className="mt-0.5 block w-28 rounded border border-neutral-300 px-2 py-1 text-xs" /></label>
                          <Button type="submit" size="sm" variant="secondary">Add material</Button>
                        </form>
                        <p className="text-[11px] text-neutral-500">Quantity is in the item&apos;s base unit; partial units allowed (e.g. 0.25 of a gel tube). Cost = latest purchase cost × quantity — deterministic, and it feeds the estimate&apos;s material cost automatically.</p>
                      </div>
                    </details>
                  );
                })()}
              </td>
              <td className="px-4 py-2.5 capitalize text-neutral-600">{c.property_type ?? "—"}</td>
              <td className="px-4 py-2.5 text-right text-neutral-700">{c.crew_size}</td>
              <td className="px-4 py-2.5 text-right text-neutral-700">{c.est_duration_hours && Number(c.est_duration_hours) > 0 ? `${c.est_duration_hours}h` : "—"}</td>
              <td className="px-4 py-2.5 text-right text-neutral-700">
                {Number(bomByCat.get(c.id)?.total ?? 0) > 0
                  ? <span title="From materials BOM">{aedt(bomByCat.get(c.id)!.total)} <span className="text-[10px] text-neutral-400">BOM</span></span>
                  : aed(c.est_material_cost)}
              </td>
              <td className="px-4 py-2.5 text-right font-medium">{aed(c.recommended_price)}</td>
              <td className="px-4 py-2.5">
                {!c.is_active ? <Badge>archived</Badge>
                  : c.is_assumed ? <AssumedBadge note={c.assumed_note} />
                  : <Badge tone="success">✓ set</Badge>}
              </td>
              <td className="px-4 py-2.5 text-right">
                {c.is_active ? (
                  <form action={archiveCategoryAction}><input type="hidden" name="id" value={c.id} />
                    <button className="text-xs text-neutral-500 hover:text-red-600">archive</button></form>
                ) : (
                  <form action={restoreCategoryAction}><input type="hidden" name="id" value={c.id} />
                    <button className="text-xs text-brand hover:underline">restore</button></form>
                )}
              </td>
            </tr>
          ))}
        </Tbody>
      </TableWrap>
    </div>
  );
}
