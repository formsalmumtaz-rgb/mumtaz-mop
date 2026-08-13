// Costing engine (mig 060–062) — fn_pest_treatment_costing.
// Deterministic, read-only (STABLE) engine: given a site's area + distance it
// returns the annual pest-treatment costing from the real (owner-confirmed) config.
// Asserts the medium-restaurant demo (200 m², 16 km one-way, 24 visits, 6 gel) at
// both the ad-hoc (250) and AMC (100) per-visit prices. No writes; scoped to reads.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { pool } from "../src/db.js";

let tenantId: string, slId: string;

const near = (a: number, b: number, eps = 0.011) =>
  assert.ok(Math.abs(a - b) <= eps, `expected ${a} ≈ ${b}`);

before(async () => {
  tenantId = (await pool.query(`select id from tenants where name='Mumtaz Integrated Services Group'`)).rows[0].id;
  slId = (await pool.query(`select id from service_lines where tenant_id=$1 and code='pest_control'`, [tenantId])).rows[0].id;
});

async function cost(price: number | null) {
  const r = await pool.query(
    `select fn_pest_treatment_costing($1,$2, 200, 16, 24, 6, 0.35, $3) as j`,
    [tenantId, slId, price],
  );
  return r.rows[0].j as any;
}

test("per-visit breakdown: travel folded into labour, material from landed cost", async () => {
  const j = await cost(250);
  // labour = treatment 1h + travel 1h (32km round trip ÷ 32km/h) = 2h × 10.6196 ≈ 21.24
  near(Number(j.per_visit.labour_hours), 2);
  near(Number(j.per_visit.travel_hours), 1);
  near(Number(j.per_visit.labour_cost), 21.24);
  // fuel = 32km ÷ 5km/L × 3.49 ≈ 22.34
  near(Number(j.per_visit.fuel_cost), 22.34);
  // spray material = 200 m² × (0.25×0.08925 Blitz + 0.025×0.42 Surfactant) = 6.56 (CHEMICAL_LIST 13 Aug)
  near(Number(j.per_visit.spray.material_cost), 6.56);
  // gel material = 200 m² × 0.105 × 1.20 (Power Gel 40/35g ex-VAT +5%) = 25.20
  near(Number(j.per_visit.gel.material_cost), 25.2);
});

test("annual direct cost and suggested price are deterministic", async () => {
  const j = await cost(null);
  near(Number(j.annual.total_direct_cost), 1391.76);
  near(Number(j.annual.cost_per_visit_blended), 57.99);
  // suggested min at 35% margin = 57.99 / 0.65 ≈ 89.22 (default margin is now 70%; the test passes 0.35 explicitly)
  near(Number(j.pricing.suggested_min_price_per_visit), 89.22);
  assert.equal(Number(j.pricing.adhoc_reference_per_visit), 250);
  assert.equal(Number(j.pricing.amc_reference_per_visit), 100);
});

test("margin at ad-hoc 250 vs AMC 100 (the flagged discrepancy)", async () => {
  const adhoc = await cost(250);
  near(Number(adhoc.at_price.margin_pct), 76.8);
  near(Number(adhoc.at_price.annual_profit), 4608.24);

  const amc = await cost(100);
  near(Number(amc.at_price.margin_pct), 42.0);
  near(Number(amc.at_price.annual_profit), 1008.24);
});

test("every figure is flagged assumed until inputs are confirmed", async () => {
  const j = await cost(250);
  assert.equal(j.is_assumed, true);
  // Pro Surfactant price is REAL now (CHEMICAL_LIST) — no longer in the list;
  // the consumption coverage rates remain assumed until the owner confirms areas.
  assert.ok(!j.assumptions.includes("material:Pro Surfactant"));
  assert.ok(j.assumptions.includes("consumption:spray"));
});
