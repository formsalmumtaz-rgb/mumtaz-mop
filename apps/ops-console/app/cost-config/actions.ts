"use server";
import { revalidatePath } from "next/cache";
import { getTenantId } from "@/lib/tenant";
import { getServiceLineId } from "@/lib/domain/reference";
import { saveCostRates, confirmCostAccount, runBacklog } from "@/lib/domain/costconfig";
import { saveEmployeeCost } from "@/lib/domain/employeecost";

export async function saveRatesAction(fd: FormData): Promise<void> {
  const tenantId = await getTenantId();
  const sl = await getServiceLineId(tenantId);
  await saveCostRates(tenantId, sl, {
    labour_rate: String(fd.get("labour_rate") ?? ""),
    vehicle_rate: String(fd.get("vehicle_rate") ?? ""),
    overhead_enabled: fd.get("overhead_enabled") === "on",
    overhead_rate: String(fd.get("overhead_rate") ?? ""),
  });
  revalidatePath("/cost-config");
}

export async function confirmAccountAction(fd: FormData): Promise<void> {
  const key = String(fd.get("key") ?? "");
  if (!key) return;
  const tenantId = await getTenantId();
  await confirmCostAccount(tenantId, key, { code: String(fd.get("code") ?? ""), name: String(fd.get("name") ?? "") });
  revalidatePath("/cost-config");
}

export async function saveEmployeeCostAction(fd: FormData): Promise<void> {
  const technicianId = String(fd.get("technician_id") ?? "");
  if (!technicianId) return;
  const tenantId = await getTenantId();
  const sl = await getServiceLineId(tenantId);
  await saveEmployeeCost(tenantId, sl, technicianId, {
    basic_salary: String(fd.get("basic_salary") ?? ""),
    accommodation_monthly: String(fd.get("accommodation_monthly") ?? ""),
    transport_allowance_monthly: String(fd.get("transport_allowance_monthly") ?? ""),
    medical_insurance_annual: String(fd.get("medical_insurance_annual") ?? ""),
    air_ticket_annual: String(fd.get("air_ticket_annual") ?? ""),
    visa_cost: String(fd.get("visa_cost") ?? ""),
    emirates_id_cost: String(fd.get("emirates_id_cost") ?? ""),
    visa_eid_amortisation_months: String(fd.get("visa_eid_amortisation_months") ?? ""),
    gratuity_days_per_year: String(fd.get("gratuity_days_per_year") ?? ""),
    productive_hours_month: String(fd.get("productive_hours_month") ?? ""),
  });
  revalidatePath("/cost-config");
}

export async function runBacklogAction(): Promise<void> {
  const tenantId = await getTenantId();
  await runBacklog(tenantId);
  revalidatePath("/cost-config");
}
