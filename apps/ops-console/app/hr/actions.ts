"use server";
import { requirePermission, getSession } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { getTenantId } from "@/lib/tenant";
import { decideHrRequest } from "@/lib/domain/hr";

export async function decideHrRequestAction(fd: FormData): Promise<void> {
  await requirePermission("technician.edit");
  const tenantId = await getTenantId();
  const session = await getSession();
  await decideHrRequest(
    tenantId, session?.userId ?? null,
    String(fd.get("id")),
    String(fd.get("decision")) === "approved" ? "approved" : "declined",
    String(fd.get("note") ?? "") || undefined,
  );
  revalidatePath("/hr");
}
