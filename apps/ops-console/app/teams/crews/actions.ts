"use server";
import { requirePermission } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { getTenantId } from "@/lib/tenant";
import { getServiceLineId } from "@/lib/domain/reference";
import { assignTechnician, assignVehicle } from "@/lib/domain/crews";

export async function assignToCrewAction(fd: FormData): Promise<void> {
  await requirePermission("technician.edit");
  const tenantId = await getTenantId();
  const serviceLineId = await getServiceLineId(tenantId);
  const kind = String(fd.get("kind"));
  const id = String(fd.get("id"));
  const teamId = String(fd.get("team_id") ?? "") || null;
  if (kind === "vehicle") await assignVehicle(tenantId, serviceLineId, id, teamId);
  else await assignTechnician(tenantId, serviceLineId, id, teamId);
  revalidatePath("/teams/crews");
}
