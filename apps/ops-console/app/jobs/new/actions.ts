"use server";
import { redirect } from "next/navigation";
import { getTenantId } from "@/lib/tenant";
import { getServiceLineId } from "@/lib/domain/reference";
import { createCustomer } from "@/lib/domain/customers";
import { createJob } from "@/lib/domain/jobs";

const num = (v: FormDataEntryValue | null): number | null => {
  const s = String(v ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const str = (v: FormDataEntryValue | null) => String(v ?? "").trim() || null;

export async function createJobAction(formData: FormData): Promise<void> {
  const tenantId = await getTenantId();
  const sl = await getServiceLineId(tenantId);

  let customerId = String(formData.get("customer_id") ?? "").trim();
  const newName = String(formData.get("new_customer_name") ?? "").trim();
  if (!customerId && newName) {
    customerId = await createCustomer(tenantId, sl, { trade_name: newName });
  }
  if (!customerId) redirect("/jobs/new?error=customer");

  await createJob(tenantId, sl, {
    customer_id: customerId,
    job_source_id: str(formData.get("job_source_id")),
    service_type_id: str(formData.get("service_type_id")),
    team_id: str(formData.get("team_id")),
    scheduled_date: str(formData.get("scheduled_date")),
    lat: num(formData.get("location_lat")),
    lng: num(formData.get("location_lng")),
    contract_id: null, // ad-hoc: no parent contract
  });

  redirect(`/jobs/new?created=1`);
}
