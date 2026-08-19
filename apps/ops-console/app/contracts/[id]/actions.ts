"use server";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { getTenantId } from "@/lib/tenant";
import {
  activateContract, updateContract, extendContractEndDate,
  archiveContract, restoreContract, getContract, getScheduleSummary,
} from "@/lib/domain/contracts";
import { setContractBilling } from "@/lib/domain/billing";
import { getServiceLineId } from "@/lib/domain/reference";
import { bookFirstVisit, type FirstVisitBasis } from "@/lib/domain/firstvisit";

export async function updateContractAction(fd: FormData): Promise<void> {
  await requirePermission("contract.edit");
  const id = String(fd.get("contract_id") ?? ""); if (!id) return;
  await updateContract(await getTenantId(), id, {
    contract_number: String(fd.get("contract_number") ?? ""),
    frequency_id: String(fd.get("frequency_id") ?? ""),
    pricing_model_id: String(fd.get("pricing_model_id") ?? ""),
    contract_value: String(fd.get("contract_value") ?? ""),
    currency: String(fd.get("currency") ?? "AED"),
    start_date: String(fd.get("start_date") ?? ""),
    end_date: String(fd.get("end_date") ?? ""),
  });
  revalidatePath(`/contracts/${id}`);
}

export async function extendContractAction(fd: FormData): Promise<void> {
  await requirePermission("contract.edit");
  const id = String(fd.get("contract_id") ?? ""); if (!id) return;
  await extendContractEndDate(await getTenantId(), id, String(fd.get("end_date") ?? ""));
  revalidatePath(`/contracts/${id}`);
}

export async function archiveContractAction(fd: FormData): Promise<void> {
  await requirePermission("contract.edit");
  const id = String(fd.get("contract_id") ?? ""); if (!id) return;
  await archiveContract(await getTenantId(), id);
  revalidatePath(`/contracts/${id}`);
}

export async function restoreContractAction(fd: FormData): Promise<void> {
  await requirePermission("contract.edit");
  const id = String(fd.get("contract_id") ?? ""); if (!id) return;
  await restoreContract(await getTenantId(), id);
  revalidatePath(`/contracts/${id}`);
}

export async function setContractBillingAction(fd: FormData): Promise<void> {
  await requirePermission("contract.edit");
  const id = String(fd.get("contract_id") ?? "");
  if (!id) return;
  const tenantId = await getTenantId();
  await setContractBilling(tenantId, id, {
    billing_frequency: String(fd.get("billing_frequency") ?? ""),
    billing_day: String(fd.get("billing_day") ?? ""),
    billing_interval_days: String(fd.get("billing_interval_days") ?? ""),
    auto_generate_invoice: fd.get("auto_generate_invoice") === "on",
    next_invoice_date: String(fd.get("next_invoice_date") ?? ""),
  });
  revalidatePath(`/contracts/${id}`);
}

// Flow item 9: activation must END on the generated schedule, never a dead end.
// 1) Pre-check what the scheduler needs (frequency + start date) and refuse with
//    an exact message instead of activating into silence.
// 2) Activate (emits contract.activated) and drain the outbox inline so K2's
//    fan-out exists before the redirect — the user LANDS on the visits.
// 3) If the drain flakes (shared pooler), the event stays queued for the
//    webhook/sweeper — the page says the schedule is still generating. Honest.
export async function activateContractAction(fd: FormData): Promise<void> {
  await requirePermission("contract.activate");
  const id = String(fd.get("contract_id") ?? "");
  if (!id) return;
  const tenantId = await getTenantId();

  const ct = await getContract(tenantId, id);
  if (!ct) return;
  const missing: string[] = [];
  if (!ct.frequency_id) missing.push("frequency");
  if (!ct.start_date) missing.push("start");
  if (missing.length) redirect(`/contracts/${id}?cannot_schedule=${missing.join(",")}`);

  await activateContract(tenantId, id);
  try {
    const { drainOnce, consumers } = await import("@mop/worker");
    const { pool } = await import("@/lib/db");
    await drainOnce(pool, consumers, { tenantId });
  } catch {
    // event remains queued; webhook/sweeper will process it
  }
  const sum = await getScheduleSummary(tenantId, id);
  revalidatePath(`/contracts/${id}`);
  if (sum.scheduleCount > 0 && sum.firstDate) {
    redirect(`/schedule?view=week&from=${sum.firstDate}&activated=${id}`);
  }
  redirect(`/contracts/${id}?activated=pending`);
}

// ── Attestation (mig 076) + severe infestation (mig 077) ──
export async function markAttestationAction(fd: FormData): Promise<void> {
  const session = await requirePermission("contract.edit");
  const id = String(fd.get("contract_id") ?? "");
  const to = String(fd.get("to_status") ?? "");
  if (!id || !["submitted", "attested"].includes(to)) return;
  const tenantId = await getTenantId();
  const { withRequest } = await import("@/lib/rls");
  await withRequest({ tenantId, actorId: session?.userId ?? null }, (c) =>
    c.query(
      to === "submitted"
        ? `update contracts set attestation_status='submitted', attestation_submitted_at=coalesce(attestation_submitted_at, current_date) where id=$1 and tenant_id=$2`
        : `update contracts set attestation_status='attested', attested_at=coalesce(nullif($3,'')::date, current_date),
                  attestation_receipt_no=nullif($4,''), attestation_employee_ref=nullif($5,''), attestation_fee=nullif($6,'')::numeric
             where id=$1 and tenant_id=$2`,
      to === "submitted" ? [id, tenantId] : [id, tenantId, String(fd.get("attested_at") ?? ""), String(fd.get("receipt_no") ?? ""), String(fd.get("employee_ref") ?? ""), String(fd.get("fee") ?? "")]),
  );
  revalidatePath(`/contracts/${id}`);
}

export async function openSevereEpisodeAction(fd: FormData): Promise<void> {
  const session = await requirePermission("contract.edit");
  const contractId = String(fd.get("contract_id") ?? "");
  const cause = String(fd.get("cause") ?? "").trim();
  if (!contractId || !cause) return;
  const tenantId = await getTenantId();
  const { withRequest } = await import("@/lib/rls");
  await withRequest({ tenantId, actorId: session?.userId ?? null }, (c) =>
    c.query(
      `insert into severe_infestation_episodes (tenant_id, service_line_id, contract_id, customer_id, branch_id, cause, opened_by)
       select ct.tenant_id, ct.service_line_id, ct.id, ct.customer_id, null, $3, $4
         from contracts ct where ct.id = $1 and ct.tenant_id = $2`,
      [contractId, tenantId, cause, session?.userId ?? null]),
  );
  revalidatePath(`/contracts/${contractId}`);
}

export async function resolveSevereEpisodeAction(fd: FormData): Promise<void> {
  const session = await requirePermission("contract.edit");
  const id = String(fd.get("episode_id") ?? "");
  const contractId = String(fd.get("contract_id") ?? "");
  if (!id) return;
  const tenantId = await getTenantId();
  const { withRequest } = await import("@/lib/rls");
  await withRequest({ tenantId, actorId: session?.userId ?? null }, (c) =>
    c.query(
      `update severe_infestation_episodes set resolved_at=now(), resolved_note=nullif($3,''), resolved_by=$4
        where id=$1 and tenant_id=$2 and resolved_at is null`,
      [id, tenantId, String(fd.get("note") ?? ""), session?.userId ?? null]),
  );
  revalidatePath(`/contracts/${contractId}`);
}

// §3.3 — book the first visit the office CONFIRMED. The engine only ever
// suggests; nothing reaches the schedule without this click.
export async function bookFirstVisitAction(formData: FormData): Promise<void> {
  await requirePermission("job.edit");
  const contractId = String(formData.get("contract_id"));
  const tenantId = await getTenantId();
  const serviceLineId = await getServiceLineId(tenantId);
  await bookFirstVisit(tenantId, serviceLineId, contractId, {
    date: String(formData.get("date")),
    team_id: String(formData.get("team_id") ?? "") || null,
    basis: String(formData.get("basis")) as FirstVisitBasis,
    off_pattern: String(formData.get("off_pattern")) === "true",
    reason: String(formData.get("reason") ?? ""),
  });
  revalidatePath(`/contracts/${contractId}`);
}
