"use server";
import { requirePermission } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { drainOnce, consumers } from "@mop/worker";
import { pool } from "@/lib/db";
import { withRequest } from "@/lib/rls";
import { getTenantId } from "@/lib/tenant";
import { getServiceLineId } from "@/lib/domain/reference";
import { updateCustomer, confirmCustomer, clearRequiredFlags } from "@/lib/domain/customers";
import { createBranch, updateBranch, archiveBranch, restoreBranch } from "@/lib/domain/branches";
import { createContact, updateContact, archiveContact, restoreContact } from "@/lib/domain/contacts";
import { createContract, activateContract } from "@/lib/domain/contracts";

const num = (v: FormDataEntryValue | null): number | null => {
  const s = String(v ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

export async function updateCustomerAction(formData: FormData): Promise<void> {
  await requirePermission("customer.edit");
  const id = String(formData.get("id"));
  const tenantId = await getTenantId();
  await updateCustomer(tenantId, id, {
    trade_name: String(formData.get("trade_name") ?? ""),
    legal_name: String(formData.get("legal_name") ?? ""),
    trn: String(formData.get("trn") ?? ""),
    trade_license: String(formData.get("trade_license") ?? ""),
    customer_type: String(formData.get("customer_type") ?? ""),
    emirate: String(formData.get("emirate") ?? ""),
  });
  revalidatePath(`/customers/${id}`);
}

export async function confirmCustomerAction(formData: FormData): Promise<void> {
  await requirePermission("customer.edit");
  const id = String(formData.get("id"));
  const tenantId = await getTenantId();
  await confirmCustomer(tenantId, id);
  revalidatePath(`/customers/${id}`);
}

export async function createBranchAction(formData: FormData): Promise<void> {
  await requirePermission("customer.edit");
  const customerId = String(formData.get("customer_id"));
  const tenantId = await getTenantId();
  const sl = await getServiceLineId(tenantId);
  await createBranch(tenantId, sl, customerId, {
    name: String(formData.get("name") ?? ""),
    address: String(formData.get("address") ?? ""),
    emirate: String(formData.get("emirate") ?? ""),
    facility_type_id: String(formData.get("facility_type_id") ?? ""),
    lat: num(formData.get("location_lat")),
    lng: num(formData.get("location_lng")),
  });
  revalidatePath(`/customers/${customerId}`);
}

export async function updateBranchAction(formData: FormData): Promise<void> {
  await requirePermission("customer.edit");
  const customerId = String(formData.get("customer_id"));
  const id = String(formData.get("id"));
  if (!id) return;
  await updateBranch(await getTenantId(), id, {
    name: String(formData.get("name") ?? ""),
    address: String(formData.get("address") ?? ""),
    emirate: String(formData.get("emirate") ?? ""),
    facility_type_id: String(formData.get("facility_type_id") ?? ""),
    lat: num(formData.get("location_lat")),
    lng: num(formData.get("location_lng")),
  });
  revalidatePath(`/customers/${customerId}`);
}

export async function archiveBranchAction(formData: FormData): Promise<void> {
  await requirePermission("customer.edit");
  const customerId = String(formData.get("customer_id"));
  const id = String(formData.get("id")); if (!id) return;
  await archiveBranch(await getTenantId(), id);
  revalidatePath(`/customers/${customerId}`);
}

export async function restoreBranchAction(formData: FormData): Promise<void> {
  await requirePermission("customer.edit");
  const customerId = String(formData.get("customer_id"));
  const id = String(formData.get("id")); if (!id) return;
  await restoreBranch(await getTenantId(), id);
  revalidatePath(`/customers/${customerId}`);
}

export async function createContactAction(formData: FormData): Promise<void> {
  await requirePermission("customer.edit");
  const customerId = String(formData.get("customer_id"));
  const tenantId = await getTenantId();
  const sl = await getServiceLineId(tenantId);
  await createContact(tenantId, sl, customerId, {
    name: String(formData.get("name") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    email: String(formData.get("email") ?? ""),
    role: String(formData.get("role") ?? ""),
    is_primary: formData.get("is_primary") === "on",
    branch_id: String(formData.get("branch_id") ?? ""),
  });
  revalidatePath(`/customers/${customerId}`);
}

export async function updateContactAction(formData: FormData): Promise<void> {
  await requirePermission("customer.edit");
  const customerId = String(formData.get("customer_id"));
  const id = String(formData.get("id")); if (!id) return;
  await updateContact(await getTenantId(), id, {
    name: String(formData.get("name") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    email: String(formData.get("email") ?? ""),
    role: String(formData.get("role") ?? ""),
    is_primary: formData.get("is_primary") === "on",
    branch_id: String(formData.get("branch_id") ?? ""),
  });
  revalidatePath(`/customers/${customerId}`);
}

export async function archiveContactAction(formData: FormData): Promise<void> {
  await requirePermission("customer.edit");
  const customerId = String(formData.get("customer_id"));
  const id = String(formData.get("id")); if (!id) return;
  await archiveContact(await getTenantId(), id);
  revalidatePath(`/customers/${customerId}`);
}

export async function restoreContactAction(formData: FormData): Promise<void> {
  await requirePermission("customer.edit");
  const customerId = String(formData.get("customer_id"));
  const id = String(formData.get("id")); if (!id) return;
  await restoreContact(await getTenantId(), id);
  revalidatePath(`/customers/${customerId}`);
}

export async function createContractAction(formData: FormData): Promise<void> {
  await requirePermission("contract.edit");
  const customerId = String(formData.get("customer_id"));
  const tenantId = await getTenantId();
  const sl = await getServiceLineId(tenantId);
  await createContract(tenantId, sl, customerId, {
    contract_number: String(formData.get("contract_number") ?? ""),
    frequency_id: String(formData.get("frequency_id") ?? ""),
    pricing_model_id: String(formData.get("pricing_model_id") ?? ""),
    contract_value: String(formData.get("contract_value") ?? ""),
    currency: String(formData.get("currency") ?? "AED"),
    start_date: String(formData.get("start_date") ?? ""),
    end_date: String(formData.get("end_date") ?? ""),
  });
  revalidatePath(`/customers/${customerId}`);
}

export async function activateContractAction(formData: FormData): Promise<void> {
  await requirePermission("contract.activate");
  const customerId = String(formData.get("customer_id"));
  const contractId = String(formData.get("contract_id"));
  const tenantId = await getTenantId();
  await activateContract(tenantId, contractId);
  // Fan out immediately (mirrors the production Supabase webhook). If the drain
  // fails, the event stays queued for the sweeper — activation still succeeds.
  try {
    await drainOnce(pool, consumers, { tenantId });
  } catch (e) {
    console.error("[activate] fan-out drain failed; event remains queued:", e);
  }
  revalidatePath(`/customers/${customerId}`);
}

// Capture what the master file could not tell us, from the customer's own profile
// (§3.1). Each answer clears ONLY its own flag, so answering the email never
// quietly closes the question about the TRN. Blank stays blank: a field left empty
// is still unknown and its flag survives.
export async function captureRequiredInfoAction(formData: FormData): Promise<void> {
  await requirePermission("customer.edit");
  const id = String(formData.get("id"));
  const tenantId = await getTenantId();
  const serviceLineId = await getServiceLineId(tenantId);
  const val = (k: string) => String(formData.get(k) ?? "").trim();
  const answered: string[] = [];
  const claim = (token: string) => { if (token) answered.push(token); };

  // ── direct customer columns ────────────────────────────────────────────────
  const direct: Record<string, string> = {};
  for (const k of ["trn", "emirate", "place_of_supply", "trade_name"]) {
    if (val(k)) direct[k] = val(k);
  }
  if (Object.keys(direct).length) {
    const sets = Object.keys(direct).map((k, i) => `${k} = $${i + 3}`).join(", ");
    await withRequest({ tenantId }, (c) => c.query(
      `update customers set ${sets}, updated_at = now() where id = $1 and tenant_id = $2`,
      [id, tenantId, ...Object.values(direct)]));
  }

  // ── a contact, when an email or a number was given ─────────────────────────
  const email = val("contact_email"), phone = val("contact_phone"), mobile = val("contact_mobile");
  if (email || phone || mobile) {
    await createContact(tenantId, serviceLineId, id, {
      name: val("contact_person") || "Primary contact",
      email: email || undefined, phone: (mobile || phone) || undefined,
      role: undefined,
    });
  }

  // ── the site address goes on the site, not the customer ────────────────────
  const address = val("site_address");
  if (address) {
    await withRequest({ tenantId }, async (c) => {
      const { rows } = await c.query(
        `select id from customer_branches where customer_id=$1 and tenant_id=$2 and archived_at is null
          order by created_at limit 1`, [id, tenantId]);
      if (rows[0]) {
        await c.query(`update customer_branches set address=$2, updated_at=now() where id=$1`, [rows[0].id, address]);
      } else {
        await c.query(
          `insert into customer_branches (tenant_id, service_line_id, customer_id, name, address, is_assumed, assumed_note)
           values ($1,$2,$3,'Main',$4,true,'Captured on the customer profile — confirm and pin')`,
          [tenantId, serviceLineId, id, address]);
      }
    });
  }

  // Only the tokens whose value actually arrived are cleared.
  for (const token of formData.getAll("answered_token").map(String)) {
    // the form submits the token alongside its input(s); claim it only if at
    // least one of those inputs came back with something in it
    const fields = String(formData.get(`fields_for:${token}`) ?? "").split(",").filter(Boolean);
    if (fields.length && fields.some((f) => val(f))) claim(token);
  }
  await clearRequiredFlags(tenantId, id, answered);
  revalidatePath(`/customers/${id}`);
}
