import type { PoolClient } from "pg";
import type { Consumer, ParsedEvent } from "./outbox";
import { generateVisitDates, buildPricingSnapshot, normaliseSpacing, type FrequencySpec, type VisitSpacing } from "./schedule";

// K2 contract fan-out. Three independent, idempotent consumers of
// contract.activated. Registered schedule-first so jobs see a committed schedule.
// Frozen snapshots (recipe version + pricing) are captured at generation, never
// re-read at service time (SCHEMA.md F2).

interface SchedSettings {
  horizonMonths: number;
  jobDays: number;
  renewalDays: number;
  spacing: VisitSpacing; // driven by the ASSUMED `visit_spacing` setting, not hardcoded
}

async function loadSettings(c: PoolClient, tenantId: string, slId: string | null): Promise<SchedSettings> {
  const { rows } = await c.query(
    `select key, value from settings
      where tenant_id = $1 and (service_line_id = $2 or service_line_id is null)
        and key in ('schedule_horizon_months','job_generation_days','renewal_reminder_days','visit_spacing')`,
    [tenantId, slId],
  );
  const m = new Map(rows.map((r) => [r.key, r.value as unknown]));
  const num = (k: string, d: number) => (m.get(k) == null ? d : Number(m.get(k)));
  return {
    horizonMonths: num("schedule_horizon_months", 12),
    jobDays: num("job_generation_days", 30),
    renewalDays: num("renewal_reminder_days", 60),
    spacing: normaliseSpacing(m.get("visit_spacing") as string | undefined),
  };
}

// Best-effort recipe resolution: a contract_service's pest type -> that pest's
// current (open) treatment recipe version. Null when nothing is configured (the
// demo has no recipes yet — snapshot records recipe=null honestly).
async function resolveRecipeVersion(c: PoolClient, contractId: string): Promise<string | null> {
  const { rows } = await c.query(
    `select rv.id
       from contract_services cs
       join treatment_recipes tr on tr.target_pest_id = cs.pest_type_id and tr.service_line_id = cs.service_line_id
       join treatment_recipe_versions rv on rv.recipe_id = tr.id and rv.effective_to is null
      where cs.contract_id = $1
      limit 1`,
    [contractId],
  );
  return rows[0]?.id ?? null;
}

const scheduleGenerator: Consumer = {
  name: "schedule-generator",
  handle: async (c: PoolClient, ev: ParsedEvent) => {
    const contractId = (ev.payload as { contract_id: string }).contract_id;

    // idempotency guard (belt & braces with the event-level claim)
    const exists = await c.query(`select 1 from contract_schedule where contract_id = $1 limit 1`, [contractId]);
    if (exists.rowCount) return;

    const { rows: ctRows } = await c.query(
      `select ct.tenant_id, ct.service_line_id, ct.customer_id, ct.frequency_id,
              ct.contract_value::float8 as contract_value, ct.currency,
              ct.start_date::text as start_date, pm.code as pricing_model_code
         from contracts ct left join pricing_models pm on pm.id = ct.pricing_model_id
        where ct.id = $1`,
      [contractId],
    );
    const ct = ctRows[0];
    if (!ct || !ct.frequency_id || !ct.start_date) return; // cannot schedule without frequency/start

    const { rows: fRows } = await c.query(
      `select period_unit, period_count, visits_per_period from frequencies where id = $1`,
      [ct.frequency_id],
    );
    const freq = fRows[0] as FrequencySpec;
    const settings = await loadSettings(c, ct.tenant_id, ct.service_line_id);
    const recipeVersionId = await resolveRecipeVersion(c, contractId);

    const dates = generateVisitDates(ct.start_date, freq, settings.horizonMonths, settings.spacing);
    const pricing = buildPricingSnapshot(
      { pricing_model_code: ct.pricing_model_code, contract_value: ct.contract_value, currency: ct.currency },
      freq,
    );
    const snapshot = JSON.stringify({ pricing, recipe_version_id: recipeVersionId, frozen_at: new Date().toISOString() });

    const { rows: brRows } = await c.query(
      `select id from customer_branches where customer_id = $1 and is_active order by created_at limit 1`,
      [ct.customer_id],
    );
    const branchId = brRows[0]?.id ?? null;

    let seq = 0;
    for (const d of dates) {
      seq += 1;
      await c.query(
        `insert into contract_schedule
           (tenant_id, service_line_id, contract_id, branch_id, scheduled_date, visit_seq, status, recipe_version_id, snapshot)
         values ($1,$2,$3,$4,$5,$6,'planned',$7,$8)`,
        [ct.tenant_id, ct.service_line_id, contractId, branchId, d, seq, recipeVersionId, snapshot],
      );
    }
  },
};

const jobGenerator: Consumer = {
  name: "job-generator",
  handle: async (c: PoolClient, ev: ParsedEvent) => {
    const contractId = (ev.payload as { contract_id: string }).contract_id;

    const { rows: ctRows } = await c.query(
      `select tenant_id, service_line_id, customer_id from contracts where id = $1`,
      [contractId],
    );
    const ct = ctRows[0];
    if (!ct) return;
    const settings = await loadSettings(c, ct.tenant_id, ct.service_line_id);

    const { rows: srcRows } = await c.query(
      `select id from job_sources where tenant_id = $1 and code = 'contract_scheduled' limit 1`,
      [ct.tenant_id],
    );
    const jobSourceId = srcRows[0]?.id ?? null;

    // planned schedule rows inside the job-generation horizon
    const { rows: sched } = await c.query(
      `select id, branch_id, scheduled_date, recipe_version_id, snapshot
         from contract_schedule
        where contract_id = $1 and status = 'planned'
          and scheduled_date <= current_date + ($2 || ' days')::interval`,
      [contractId, settings.jobDays],
    );

    for (const s of sched) {
      await c.query(
        `insert into jobs
           (tenant_id, service_line_id, customer_id, branch_id, contract_id, contract_schedule_id,
            job_source_id, scheduled_date, status, recipe_version_id, generation_snapshot)
         values ($1,$2,$3,$4,$5,$6,$7,$8,'scheduled',$9,$10)`,
        [ct.tenant_id, ct.service_line_id, ct.customer_id, s.branch_id, contractId, s.id,
         jobSourceId, s.scheduled_date, s.recipe_version_id, s.snapshot],
      );
      await c.query(`update contract_schedule set status = 'job_created' where id = $1`, [s.id]);
    }
  },
};

const renewalReminder: Consumer = {
  name: "renewal-reminder",
  handle: async (c: PoolClient, ev: ParsedEvent) => {
    const contractId = (ev.payload as { contract_id: string }).contract_id;
    const { rows } = await c.query(
      `select tenant_id, service_line_id, end_date::text as end_date, contract_number from contracts where id = $1`,
      [contractId],
    );
    const ct = rows[0];
    if (!ct || !ct.end_date) return;
    const settings = await loadSettings(c, ct.tenant_id, ct.service_line_id);

    const due = new Date(`${ct.end_date}T00:00:00Z`);
    due.setUTCDate(due.getUTCDate() - settings.renewalDays);

    await c.query(
      `insert into reminders (tenant_id, service_line_id, reminder_type, entity_type, entity_id, due_date, note)
       values ($1,$2,'contract_renewal','contract',$3,$4,$5)
       on conflict (tenant_id, reminder_type, entity_id, due_date) do nothing`,
      [ct.tenant_id, ct.service_line_id, contractId, due.toISOString().slice(0, 10),
       `Contract ${ct.contract_number ?? contractId} renewal due`],
    );
  },
};

// Order matters: schedule commits before jobs read it.
export const fanoutConsumers: Consumer[] = [scheduleGenerator, jobGenerator, renewalReminder];
