import "server-only";
import { pool } from "../db";

// Sales pipeline (read-only projection over the pre-sales funnel:
// survey → estimate → quotation → contract). Deterministic counts + values;
// no model call. Explicit tenant filter (same pattern as the other reads).

export interface Pipeline {
  surveys: { total: number; draft: number; completed: number; cancelled: number; converted: number };
  estimates: {
    total: number; draft: number; quoted: number; accepted: number; rejected: number; expired: number;
    with_contract: number; revenue_open: number; revenue_accepted: number;
  };
  contracts: { total: number; draft: number; active: number };
  conv: { surveyToEstimate: number | null; estimateToAccepted: number | null; acceptedToContract: number | null };
  currency: string;
}

const pctOf = (n: number, d: number): number | null => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);

export async function getPipeline(tenantId: string): Promise<Pipeline> {
  const { rows: sv } = await pool.query(
    `select count(*)::int total,
            count(*) filter (where status='draft')::int draft,
            count(*) filter (where status='completed')::int completed,
            count(*) filter (where status='cancelled')::int cancelled,
            count(*) filter (where estimate_id is not null)::int converted
       from surveys where tenant_id=$1`, [tenantId]);

  const { rows: es } = await pool.query(
    `select e.status, count(*)::int n, coalesce(sum(p.revenue),0)::float8 revenue,
            count(*) filter (where e.contract_id is not null)::int with_contract
       from estimates e left join estimate_profitability p on p.estimate_id=e.id
      where e.tenant_id=$1 group by e.status`, [tenantId]);

  const { rows: ct } = await pool.query(
    `select lifecycle_status, count(*)::int n from contracts where tenant_id=$1 group by lifecycle_status`, [tenantId]);

  const eBy = (s: string) => es.find((r) => r.status === s) ?? { n: 0, revenue: 0, with_contract: 0 };
  const eTotal = es.reduce((a, r) => a + r.n, 0);
  const eOpenRevenue = es.filter((r) => r.status === "draft" || r.status === "quoted").reduce((a, r) => a + r.revenue, 0);
  const eWithContract = es.reduce((a, r) => a + r.with_contract, 0);
  const accepted = eBy("accepted").n as number;

  const cBy = (s: string) => (ct.find((r) => r.lifecycle_status === s)?.n ?? 0) as number;

  const surveys = {
    total: sv[0].total, draft: sv[0].draft, completed: sv[0].completed, cancelled: sv[0].cancelled, converted: sv[0].converted,
  };

  return {
    surveys,
    estimates: {
      total: eTotal, draft: eBy("draft").n, quoted: eBy("quoted").n, accepted, rejected: eBy("rejected").n, expired: eBy("expired").n,
      with_contract: eWithContract, revenue_open: eOpenRevenue, revenue_accepted: eBy("accepted").revenue,
    },
    contracts: { total: ct.reduce((a, r) => a + r.n, 0), draft: cBy("draft"), active: cBy("active") },
    conv: {
      surveyToEstimate: pctOf(surveys.converted, surveys.total),
      estimateToAccepted: pctOf(accepted, eTotal),
      acceptedToContract: pctOf(eWithContract, accepted),
    },
    currency: "AED",
  };
}
