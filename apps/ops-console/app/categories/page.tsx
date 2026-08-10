import { getTenantId } from "@/lib/tenant";
import { getServiceLineId, listPricingModels } from "@/lib/domain/reference";
import { listCategories } from "@/lib/domain/categories";
import { AssumedBadge } from "@/components/AssumedBadge";
import { Card, Badge, TableWrap, Thead, Tbody, PageHeader } from "@/components/ui";
import { CategoryForm } from "./CategoryForm";
import { createCategoryAction, updateCategoryAction, archiveCategoryAction, restoreCategoryAction } from "./actions";
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
              </td>
              <td className="px-4 py-2.5 capitalize text-neutral-600">{c.property_type ?? "—"}</td>
              <td className="px-4 py-2.5 text-right text-neutral-700">{c.crew_size}</td>
              <td className="px-4 py-2.5 text-right text-neutral-700">{c.est_duration_hours && Number(c.est_duration_hours) > 0 ? `${c.est_duration_hours}h` : "—"}</td>
              <td className="px-4 py-2.5 text-right text-neutral-700">{aed(c.est_material_cost)}</td>
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
