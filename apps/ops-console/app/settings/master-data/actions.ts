"use server";
import { requirePermission } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { getTenantId } from "@/lib/tenant";
import { getServiceLineId } from "@/lib/domain/reference";
import {
  CATALOGS, type CatalogKey,
  createCatalogItem, updateCatalogItem, archiveCatalogItem, restoreCatalogItem,
} from "@/lib/domain/refdata";
import {
  createFrequency, updateFrequency, archiveFrequency, restoreFrequency,
} from "@/lib/domain/frequencies";
import {
  createSupplier, updateSupplier, archiveSupplier, restoreSupplier,
} from "@/lib/domain/suppliers";
import { archivePricingModel, restorePricingModel } from "@/lib/domain/pricing";

const PATH = "/settings/master-data";

function catalogKey(fd: FormData): CatalogKey {
  const k = String(fd.get("catalog") ?? "");
  if (!(k in CATALOGS)) throw new Error("Unknown catalogue");
  return k as CatalogKey;
}

// ── Generic catalogues (service_types, job_types, facility_types, job_sources) ──
export async function createCatalogAction(fd: FormData): Promise<void> {
  await requirePermission("settings.manage");
  const tenantId = await getTenantId();
  const sl = await getServiceLineId(tenantId);
  await createCatalogItem(tenantId, sl, catalogKey(fd), {
    code: String(fd.get("code") ?? ""), name: String(fd.get("name") ?? ""), description: String(fd.get("description") ?? ""),
  });
  revalidatePath(PATH);
}

export async function updateCatalogAction(fd: FormData): Promise<void> {
  await requirePermission("settings.manage");
  const id = String(fd.get("id") ?? ""); if (!id) return;
  await updateCatalogItem(await getTenantId(), catalogKey(fd), id, {
    code: String(fd.get("code") ?? ""), name: String(fd.get("name") ?? ""), description: String(fd.get("description") ?? ""),
  });
  revalidatePath(PATH);
}

export async function archiveCatalogAction(fd: FormData): Promise<void> {
  await requirePermission("settings.manage");
  const id = String(fd.get("id") ?? ""); if (!id) return;
  await archiveCatalogItem(await getTenantId(), catalogKey(fd), id);
  revalidatePath(PATH);
}

export async function restoreCatalogAction(fd: FormData): Promise<void> {
  await requirePermission("settings.manage");
  const id = String(fd.get("id") ?? ""); if (!id) return;
  await restoreCatalogItem(await getTenantId(), catalogKey(fd), id);
  revalidatePath(PATH);
}

// ── Frequencies ──
export async function createFrequencyAction(fd: FormData): Promise<void> {
  await requirePermission("settings.manage");
  const tenantId = await getTenantId();
  const sl = await getServiceLineId(tenantId);
  await createFrequency(tenantId, sl, {
    code: String(fd.get("code") ?? ""), name: String(fd.get("name") ?? ""),
    period_unit: String(fd.get("period_unit") ?? ""), period_count: String(fd.get("period_count") ?? ""),
    visits_per_period: String(fd.get("visits_per_period") ?? ""),
  });
  revalidatePath(PATH);
}

export async function updateFrequencyAction(fd: FormData): Promise<void> {
  await requirePermission("settings.manage");
  const id = String(fd.get("id") ?? ""); if (!id) return;
  await updateFrequency(await getTenantId(), id, {
    code: String(fd.get("code") ?? ""), name: String(fd.get("name") ?? ""),
    period_unit: String(fd.get("period_unit") ?? ""), period_count: String(fd.get("period_count") ?? ""),
    visits_per_period: String(fd.get("visits_per_period") ?? ""),
  });
  revalidatePath(PATH);
}

export async function archiveFrequencyAction(fd: FormData): Promise<void> {
  await requirePermission("settings.manage");
  const id = String(fd.get("id") ?? ""); if (!id) return;
  await archiveFrequency(await getTenantId(), id);
  revalidatePath(PATH);
}

export async function restoreFrequencyAction(fd: FormData): Promise<void> {
  await requirePermission("settings.manage");
  const id = String(fd.get("id") ?? ""); if (!id) return;
  await restoreFrequency(await getTenantId(), id);
  revalidatePath(PATH);
}

// ── Suppliers ──
export async function createSupplierAction(fd: FormData): Promise<void> {
  await requirePermission("settings.manage");
  const tenantId = await getTenantId();
  const sl = await getServiceLineId(tenantId);
  await createSupplier(tenantId, sl, { name: String(fd.get("name") ?? ""), code: String(fd.get("code") ?? ""), trn: String(fd.get("trn") ?? "") });
  revalidatePath(PATH);
}

export async function updateSupplierAction(fd: FormData): Promise<void> {
  await requirePermission("settings.manage");
  const id = String(fd.get("id") ?? ""); if (!id) return;
  await updateSupplier(await getTenantId(), id, { name: String(fd.get("name") ?? ""), code: String(fd.get("code") ?? ""), trn: String(fd.get("trn") ?? "") });
  revalidatePath(PATH);
}

export async function archiveSupplierAction(fd: FormData): Promise<void> {
  await requirePermission("settings.manage");
  const id = String(fd.get("id") ?? ""); if (!id) return;
  await archiveSupplier(await getTenantId(), id);
  revalidatePath(PATH);
}

export async function restoreSupplierAction(fd: FormData): Promise<void> {
  await requirePermission("settings.manage");
  const id = String(fd.get("id") ?? ""); if (!id) return;
  await restoreSupplier(await getTenantId(), id);
  revalidatePath(PATH);
}

// ── Pricing models (edit stays on /pricing; here we only archive/restore) ──
export async function archivePricingAction(fd: FormData): Promise<void> {
  await requirePermission("settings.manage");
  const id = String(fd.get("id") ?? ""); if (!id) return;
  await archivePricingModel(await getTenantId(), id);
  revalidatePath(PATH);
}

export async function restorePricingAction(fd: FormData): Promise<void> {
  await requirePermission("settings.manage");
  const id = String(fd.get("id") ?? ""); if (!id) return;
  await restorePricingModel(await getTenantId(), id);
  revalidatePath(PATH);
}
