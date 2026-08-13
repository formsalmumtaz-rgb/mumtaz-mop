"use server";
import { requirePermission } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTenantId } from "@/lib/tenant";
import { createFieldDef, updateFieldDef, deleteFieldDef, confirmFieldDef, type FieldDefInput } from "@/lib/domain/fielddefs";

const PATH = "/settings/field-definitions";

function parse(fd: FormData): FieldDefInput {
  const enumRaw = String(fd.get("enum_values") ?? "").trim();
  return {
    service_line_id: String(fd.get("service_line_id") ?? "").trim() || null,
    entity_type: String(fd.get("entity_type") ?? ""),
    field_key: String(fd.get("field_key") ?? "").trim(),
    label: String(fd.get("label") ?? ""),
    data_type: String(fd.get("data_type") ?? ""),
    is_required: fd.get("is_required") === "on",
    enum_values: enumRaw ? enumRaw.split(",").map((s) => s.trim()).filter(Boolean) : null,
    is_assumed: fd.get("is_assumed") === "on",
  };
}

async function run(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    redirect(`${PATH}?error=${encodeURIComponent((e as Error).message)}`);
  }
  revalidatePath(PATH);
}

export async function createFieldDefAction(fd: FormData): Promise<void> {
  const session = await requirePermission("settings.manage");
  const tenantId = await getTenantId();
  await run(() => createFieldDef(tenantId, session?.userId ?? null, parse(fd)));
}

export async function updateFieldDefAction(fd: FormData): Promise<void> {
  const session = await requirePermission("settings.manage");
  const id = String(fd.get("id") ?? ""); if (!id) return;
  const tenantId = await getTenantId();
  await run(() => updateFieldDef(tenantId, session?.userId ?? null, id, parse(fd)));
}

export async function confirmFieldDefAction(fd: FormData): Promise<void> {
  const session = await requirePermission("settings.manage");
  const id = String(fd.get("id") ?? ""); if (!id) return;
  const tenantId = await getTenantId();
  await run(() => confirmFieldDef(tenantId, session?.userId ?? null, id));
}

export async function deleteFieldDefAction(fd: FormData): Promise<void> {
  const session = await requirePermission("settings.manage");
  const id = String(fd.get("id") ?? ""); if (!id) return;
  const tenantId = await getTenantId();
  await run(() => deleteFieldDef(tenantId, session?.userId ?? null, id));
}
