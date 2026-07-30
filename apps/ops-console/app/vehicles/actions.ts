"use server";
import { revalidatePath } from "next/cache";
import { getTenantId } from "@/lib/tenant";
import { getServiceLineId } from "@/lib/domain/reference";
import { createVehicle, updateVehicle, type VehicleInput } from "@/lib/domain/vehicles";

function fromForm(fd: FormData): VehicleInput {
  return {
    code: String(fd.get("code") ?? ""),
    name: String(fd.get("name") ?? ""),
    registration_plate: String(fd.get("registration_plate") ?? ""),
    ownership_type: String(fd.get("ownership_type") ?? "company_owned"),
    monthly_depreciation: String(fd.get("monthly_depreciation") ?? ""),
    monthly_lease_cost: String(fd.get("monthly_lease_cost") ?? ""),
    technician_id: String(fd.get("technician_id") ?? ""),
  };
}

export async function createVehicleAction(fd: FormData): Promise<void> {
  const tenantId = await getTenantId();
  const sl = await getServiceLineId(tenantId);
  await createVehicle(tenantId, sl, fromForm(fd));
  revalidatePath("/vehicles");
}

export async function updateVehicleAction(fd: FormData): Promise<void> {
  const id = String(fd.get("id") ?? "");
  if (!id) return;
  const tenantId = await getTenantId();
  await updateVehicle(tenantId, id, fromForm(fd));
  revalidatePath("/vehicles");
}
