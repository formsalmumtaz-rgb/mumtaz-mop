"use server";
import { revalidatePath } from "next/cache";
import { getTenantId } from "@/lib/tenant";
import { activateContract } from "@/lib/domain/contracts";

export async function activateContractAction(fd: FormData): Promise<void> {
  const id = String(fd.get("contract_id") ?? "");
  if (!id) return;
  const tenantId = await getTenantId();
  await activateContract(tenantId, id);
  revalidatePath(`/contracts/${id}`);
}
