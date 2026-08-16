import "server-only";
import { scopedRead } from "../rls";

// The agreement's legal content, keyed by emirate (mig 092). Transcribed from
// the signed reference contracts, editable from Settings without a deploy — the
// generator never hard-codes a clause or an entity name.

export interface BilingualLine { en: string; ar: string }
export interface ContractingEntity {
  legal_name_en: string; legal_name_ar: string; trade_licence: string; phone: string;
}
export interface AgreementTerms {
  entity: ContractingEntity | null;
  entityEmirate: string | null;      // which emirate's entity was used
  conditions: BilingualLine[];
  pests: BilingualLine[];
  missing: string[];                 // what could not be resolved, stated plainly
}

async function setting<T>(tenantId: string, key: string): Promise<T | null> {
  const { rows } = await scopedRead(tenantId,
    `select value from settings where tenant_id=$1 and key=$2 and service_line_id is null limit 1`,
    [tenantId, key]);
  return (rows[0]?.value as T) ?? null;
}

// Resolve by the SITE's emirate — a Dubai branch of a Sharjah customer is signed
// by the Dubai entity. Falls back to the customer's emirate, then to nothing:
// an unknown emirate must print a visible gap, never a guessed legal entity.
export async function getAgreementTerms(tenantId: string, emirate: string | null): Promise<AgreementTerms> {
  const [entities, conditions, pests] = await Promise.all([
    setting<Record<string, ContractingEntity>>(tenantId, "agreement.contracting_entities"),
    setting<Record<string, BilingualLine[]>>(tenantId, "agreement.special_conditions"),
    setting<BilingualLine[]>(tenantId, "agreement.targeted_pests"),
  ]);
  const missing: string[] = [];
  const key = (emirate ?? "").trim();
  const match = entities && key
    ? Object.keys(entities).find((k) => k.toLowerCase() === key.toLowerCase()) ?? null
    : null;

  if (!key) missing.push("The site has no emirate recorded, so the contracting entity and the emirate's conditions could not be selected.");
  else if (!match) missing.push(`No contracting entity is configured for ${key}. Add one in Settings → agreement.contracting_entities before this agreement is signed.`);

  return {
    entity: match && entities ? entities[match] : null,
    entityEmirate: match,
    conditions: match ? conditions?.[match] ?? [] : [],
    pests: pests ?? [],
    missing,
  };
}
