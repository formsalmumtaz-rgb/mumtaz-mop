import "server-only";
import { withTenantTx } from "./tx";
import { audit } from "./audit";

export interface JobInput {
  customer_id: string;
  branch_id?: string | null;
  job_source_id?: string | null;
  service_type_id?: string | null;
  job_type_id?: string | null;
  team_id?: string | null;
  scheduled_date?: string | null;
  lat?: number | null;
  lng?: number | null;
  contract_id?: string | null; // null for ad-hoc jobs
}

const clean = (v?: string | null) => {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
};

// Create a job. Ad-hoc jobs pass no contract_id and use the same record, offline
// flow, report, and invoice path as contract jobs.
export async function createJob(
  tenantId: string,
  serviceLineId: string,
  data: JobInput,
): Promise<string> {
  return withTenantTx(tenantId, async (c) => {
    const lat = data.lat ?? null;
    const lng = data.lng ?? null;
    const { rows } = await c.query(
      `insert into jobs
         (tenant_id, service_line_id, customer_id, branch_id, contract_id,
          job_source_id, service_type_id, job_type_id, team_id, scheduled_date,
          status, location)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'scheduled',
         case when $11::float8 is null or $12::float8 is null then null
              else ST_SetSRID(ST_MakePoint($11,$12),4326)::geography end)
       returning id`,
      [
        tenantId, serviceLineId, data.customer_id, clean(data.branch_id), clean(data.contract_id),
        clean(data.job_source_id), clean(data.service_type_id), clean(data.job_type_id),
        clean(data.team_id), clean(data.scheduled_date), lng, lat,
      ],
    );
    await audit(c, tenantId, {
      table: "jobs", rowId: rows[0].id, action: "insert",
      newValue: { customer_id: data.customer_id, job_source_id: data.job_source_id, scheduled_date: data.scheduled_date, lat, lng },
      note: "ad-hoc job created in admin console",
    });
    return rows[0].id as string;
  });
}
