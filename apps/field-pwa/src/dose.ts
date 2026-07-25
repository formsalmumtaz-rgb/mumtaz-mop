import type { RecipeSnapshot } from "./db";

// Deterministic chemical dose (Constitution Art. IV — no AI, a formula). Given a
// frozen recipe snapshot and a treated area (m²), compute the product amount.
export function calcDose(recipe: RecipeSnapshot | null, areaM2: number): { amount: number; unit: string } | null {
  if (!recipe || recipe.dose_rate == null || !Number.isFinite(areaM2) || areaM2 <= 0) return null;
  const coverageUnits =
    recipe.coverage_per_unit && recipe.coverage_per_unit > 0 ? areaM2 / recipe.coverage_per_unit : areaM2;
  const amount = Math.round(recipe.dose_rate * coverageUnits * 100) / 100;
  return { amount, unit: recipe.dose_unit ?? "" };
}
