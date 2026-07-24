// Deterministic scheduling — pure functions, no DB, no AI (Art. IV). Given a
// contract's frequency, produce visit dates; given its pricing model, produce
// the frozen pricing snapshot.

export interface FrequencySpec {
  period_unit: "day" | "week" | "month" | "year";
  period_count: number;
  visits_per_period: number;
}

const UNIT_DAYS: Record<string, number> = { day: 1, week: 7, month: 30, year: 365 };

function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + days);
  return r;
}
function addMonths(d: Date, months: number): Date {
  const r = new Date(d);
  r.setUTCMonth(r.getUTCMonth() + months);
  return r;
}
function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}
function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Even-spacing rule (ASSUMED, editable). Month-based periods use exact month
// arithmetic so counts are clean (monthly×2 → 24/yr, monthly×1 → 12, bimonthly → 6).
export function generateVisitDates(startISO: string, freq: FrequencySpec, horizonMonths: number): string[] {
  const start = new Date(`${startISO}T00:00:00Z`);
  const out: string[] = [];

  if (freq.period_unit === "month") {
    const periods = Math.floor(horizonMonths / freq.period_count);
    for (let p = 0; p < periods; p++) {
      const periodStart = addMonths(start, p * freq.period_count);
      const periodEnd = addMonths(start, (p + 1) * freq.period_count);
      const periodDays = daysBetween(periodStart, periodEnd);
      for (let v = 0; v < freq.visits_per_period; v++) {
        const offset = Math.round(((v + 0.5) / freq.visits_per_period) * periodDays);
        out.push(iso(addDays(periodStart, offset)));
      }
    }
    return out;
  }

  // day/week/year: step by an even interval across the horizon
  const periodDays = (UNIT_DAYS[freq.period_unit] ?? 30) * freq.period_count;
  const interval = periodDays / freq.visits_per_period;
  const horizonDays = horizonMonths * 30;
  for (let i = 0; ; i++) {
    const d = addDays(start, Math.round(i * interval));
    if (daysBetween(start, d) >= horizonDays) break;
    out.push(iso(d));
  }
  return out;
}

export interface ContractPricing {
  pricing_model_code: string | null;
  contract_value: number | null;
  currency: string;
}

// Frozen pricing snapshot. fixed_period bills once per period; per_treatment bills
// per visit. per_treatment interprets contract_value as the per-visit rate —
// ASSUMED and UNTESTED (the demo contract is fixed-annual); flagged in the snapshot.
export function buildPricingSnapshot(p: ContractPricing, freq: FrequencySpec) {
  const base = { pricing_model: p.pricing_model_code, currency: p.currency };
  if (p.pricing_model_code === "per_treatment") {
    return {
      ...base,
      billing: "per_visit",
      per_visit_price: p.contract_value,
      assumed: true,
      assumed_note: "per_treatment: contract_value taken as the per-visit rate — UNTESTED (demo is fixed-annual). Confirm.",
    };
  }
  return {
    ...base,
    billing: "fixed_period",
    period_total: p.contract_value,
    visits_per_period: freq.visits_per_period,
  };
}
