"use server";
import { requirePermission } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { getTenantId } from "@/lib/tenant";
import { getServiceLineId } from "@/lib/domain/reference";
import { createTeam, updateTeam, archiveTeam, restoreTeam, type TeamInput } from "@/lib/domain/teams";

function inputFromForm(fd: FormData): TeamInput {
  return { code: String(fd.get("code") ?? ""), name: String(fd.get("name") ?? "") };
}

export async function createTeamAction(fd: FormData): Promise<void> {
  await requirePermission("settings.manage");
  const tenantId = await getTenantId();
  const sl = await getServiceLineId(tenantId);
  await createTeam(tenantId, sl, inputFromForm(fd));
  revalidatePath("/teams");
}

export async function updateTeamAction(fd: FormData): Promise<void> {
  await requirePermission("settings.manage");
  const id = String(fd.get("id") ?? "");
  if (!id) return;
  await updateTeam(await getTenantId(), id, inputFromForm(fd));
  revalidatePath("/teams");
}

export async function archiveTeamAction(fd: FormData): Promise<void> {
  await requirePermission("settings.manage");
  const id = String(fd.get("id") ?? ""); if (!id) return;
  await archiveTeam(await getTenantId(), id);
  revalidatePath("/teams");
}

export async function restoreTeamAction(fd: FormData): Promise<void> {
  await requirePermission("settings.manage");
  const id = String(fd.get("id") ?? ""); if (!id) return;
  await restoreTeam(await getTenantId(), id);
  revalidatePath("/teams");
}
