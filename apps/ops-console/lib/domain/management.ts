import "server-only";
import { scopedRead } from "../rls";

// Management analytics (mig 025 fn_management_profit). Operating Profit is the
// operational default (labour + vehicle running cost + material + optional
// overhead); Net Profit additionally allocates vehicle depreciation/lease.
// Depreciation/lease appears ONLY here — never in operational job profitability.

export interface ManagementProfit {
  operating_revenue: number;
  operating_cost: number;
  operating_profit: number;
  depreciation_lease: number;
  net_profit: number;
}

function parse(m: Record<string, unknown>): ManagementProfit {
  return {
    operating_revenue: Number(m.operating_revenue ?? 0),
    operating_cost: Number(m.operating_cost ?? 0),
    operating_profit: Number(m.operating_profit ?? 0),
    depreciation_lease: Number(m.depreciation_lease ?? 0),
    net_profit: Number(m.net_profit ?? 0),
  };
}

export async function getManagementProfit(tenantId: string, from: string, to: string): Promise<ManagementProfit> {
  const { rows } = await scopedRead(tenantId, `select fn_management_profit($1, $2::date, $3::date) as m`, [tenantId, from, to]);
  return parse(rows[0].m);
}

export interface ManagementMonth extends ManagementProfit {
  month: string;
}

// Per-calendar-month breakdown across the range (each bucket = one month of
// depreciation). Capped to keep the query bounded.
export async function listManagementMonths(tenantId: string, from: string, to: string): Promise<ManagementMonth[]> {
  const { rows } = await scopedRead(tenantId, 
    `select to_char(m, 'YYYY-MM') as month,
            fn_management_profit($1, m::date, (m + interval '1 month')::date) as data
       from generate_series(date_trunc('month', $2::date), date_trunc('month', $3::date), interval '1 month') m
      order by m
      limit 24`,
    [tenantId, from, to],
  );
  return rows.map((r) => ({ month: r.month, ...parse(r.data) }));
}
