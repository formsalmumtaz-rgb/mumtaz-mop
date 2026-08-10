"use server";
import { requirePermission } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { getTenantId } from "@/lib/tenant";
import { setupManpowerAgreement, updateManpowerAgreement, addTimesheet, type AgreementInput } from "@/lib/domain/manpower";

function agreementFromForm(fd: FormData): AgreementInput {
  return {
    billing_basis: String(fd.get("billing_basis") ?? ""),
    personnel_count: String(fd.get("personnel_count") ?? ""),
    rate: String(fd.get("rate") ?? ""),
    salary_cost_per_person_monthly: String(fd.get("salary_cost_per_person_monthly") ?? ""),
    accommodation_cost_monthly: String(fd.get("accommodation_cost_monthly") ?? ""),
    other_cost_monthly: String(fd.get("other_cost_monthly") ?? ""),
    notes: String(fd.get("notes") ?? ""),
  };
}

export async function setupManpowerAction(fd: FormData): Promise<void> {
  await requirePermission("contract.edit");
  const contractId = String(fd.get("contract_id") ?? ""); if (!contractId) return;
  await setupManpowerAgreement(await getTenantId(), contractId, agreementFromForm(fd));
  revalidatePath("/manpower");
}

export async function updateManpowerAction(fd: FormData): Promise<void> {
  await requirePermission("contract.edit");
  const contractId = String(fd.get("contract_id") ?? ""); if (!contractId) return;
  await updateManpowerAgreement(await getTenantId(), contractId, agreementFromForm(fd));
  revalidatePath("/manpower");
}

export async function addTimesheetAction(fd: FormData): Promise<void> {
  await requirePermission("contract.edit");
  const contractId = String(fd.get("contract_id") ?? ""); if (!contractId) return;
  await addTimesheet(await getTenantId(), contractId, {
    period: String(fd.get("period") ?? ""),
    personnel_count: String(fd.get("personnel_count") ?? ""),
    hours_worked: String(fd.get("hours_worked") ?? ""),
    notes: String(fd.get("notes") ?? ""),
  });
  revalidatePath("/manpower");
}
