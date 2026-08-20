import "server-only";
import { canSeeProfit } from "./auth";

// DOCUMENT 9 §A / the sales-capable operations role: revenue is visible to
// everyone who sells; what the work COSTS us and what it EARNS us is not.
//
// Hiding those fields in the page was never enough. Next.js server components
// pass their props to client components through the RSC payload, so a number a
// server component fetched and did not render can still arrive in the browser —
// `LineForm` was receiving the labour rate, the vehicle rate, the overhead rate
// and the per-m² material rates as props, on a screen the engineer opens daily.
// Nothing was displayed. Everything was shipped.
//
// So the redaction happens HERE, at the data layer, on the way out of the domain
// getters. A caller cannot forget it, a new screen inherits it, and a field that
// was never fetched into the response cannot leak from it. The engine still
// computes all of it server-side — the suggested price depends on it — the role
// simply never receives it.
//
// The fields, named once so a new cost column added to a query without being
// listed here is a visible omission rather than a silent leak.
export const COST_FIELDS = [
  "est_cost", "gross_profit", "est_material_cost", "est_labour_hours",
  "labour_rate", "vehicle_rate", "overhead_rate", "overhead_enabled",
  "material_rate_spray_per_m2", "material_rate_gel_per_m2", "material_floor_aed",
  "target_margin", "margin", "margin_pct", "cost", "direct_cost",
  "est_distance_km",
] as const;

// Deliberately `object`, not Record<string, unknown>: these are real domain
// interfaces (EstimateHeader, LineDefaults…), and requiring an index signature
// on every one of them to be redactable would put the burden in the wrong place.
function redactRow<T extends object>(row: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if ((COST_FIELDS as readonly string[]).includes(k)) continue;
    out[k] = v;
  }
  return out as T;
}

/** True when this session may see cost and margin at all. */
export async function costVisible(): Promise<boolean> {
  return canSeeProfit();
}

/**
 * Strip every cost/margin field from a row or list unless the session holds
 * profit.view. Returns the same shape minus those keys — not zeroed, not
 * nulled: ABSENT, so `"est_cost" in row` is false and no consumer can render a
 * misleading 0.00 or infer a margin from it.
 */
export async function redactCosting<T extends object>(data: T): Promise<T>;
export async function redactCosting<T extends object>(data: T[]): Promise<T[]>;
export async function redactCosting<T extends object>(data: T | T[]): Promise<T | T[]> {
  if (await costVisible()) return data;
  return Array.isArray(data) ? data.map(redactRow) : redactRow(data);
}
