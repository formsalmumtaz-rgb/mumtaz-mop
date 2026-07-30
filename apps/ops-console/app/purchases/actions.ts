"use server";
import { revalidatePath } from "next/cache";
import { getTenantId } from "@/lib/tenant";
import { getServiceLineId } from "@/lib/domain/reference";
import { createSupplier } from "@/lib/domain/suppliers";
import { logPurchase } from "@/lib/domain/purchases";

export async function createSupplierAction(fd: FormData): Promise<void> {
  const tenantId = await getTenantId();
  const sl = await getServiceLineId(tenantId);
  await createSupplier(tenantId, sl, {
    name: String(fd.get("name") ?? ""),
    code: String(fd.get("code") ?? ""),
    trn: String(fd.get("trn") ?? ""),
  });
  revalidatePath("/purchases");
}

export async function logPurchaseAction(fd: FormData): Promise<void> {
  const tenantId = await getTenantId();
  const sl = await getServiceLineId(tenantId);
  await logPurchase(tenantId, sl, {
    itemId: String(fd.get("item_id") ?? ""),
    supplierId: String(fd.get("supplier_id") ?? ""),
    batchNo: String(fd.get("batch_no") ?? ""),
    expiryDate: String(fd.get("expiry_date") ?? ""),
    packQuantity: String(fd.get("pack_quantity") ?? ""),
    packSize: String(fd.get("pack_size") ?? ""),
    packUnitId: String(fd.get("pack_unit_id") ?? ""),
    baseUnitId: String(fd.get("base_unit_id") ?? ""),
    totalCost: String(fd.get("total_cost") ?? ""),
    currency: String(fd.get("currency") ?? "AED"),
    toLocationId: String(fd.get("to_location_id") ?? ""),
    paymentMode: String(fd.get("payment_mode") ?? "payable") === "cash" ? "cash" : "payable",
    referenceNo: String(fd.get("reference_no") ?? ""),
  });
  revalidatePath("/purchases");
}
