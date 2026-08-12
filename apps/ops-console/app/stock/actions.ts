"use server";
import { requirePermission } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTenantId } from "@/lib/tenant";
import { transferStock } from "@/lib/domain/stock";

export async function transferStockAction(fd: FormData): Promise<void> {
  const session = await requirePermission("inventory.edit");
  const tenantId = await getTenantId();
  const actorId = session?.userId ?? null;
  const itemId = String(fd.get("item_id") ?? "");
  const fromLocationId = String(fd.get("from_location_id") ?? "");
  const toLocationId = String(fd.get("to_location_id") ?? "");
  const qtyBase = Number(fd.get("qty_base") ?? "");
  if (!itemId || !fromLocationId || !toLocationId || !Number.isFinite(qtyBase)) return;
  try {
    await transferStock(tenantId, actorId, { itemId, fromLocationId, toLocationId, qtyBase, note: String(fd.get("note") ?? "") || undefined });
  } catch (e) {
    redirect(`/stock?error=${encodeURIComponent((e as Error).message)}`);
  }
  revalidatePath("/stock");
  redirect("/stock?issued=1");
}
