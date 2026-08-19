import "server-only";
import { scopedRead } from "../rls";

// §3.5 — one tap on a category produces a costed, quotable service.
//
// Deterministic throughout (Art. IV): dosage comes from the preset, material cost
// from the REAL batch cost where a purchase exists, labour from the standard rate,
// and travel from the actual distance between the depot and the site pin. Nothing
// here is a model call and nothing is rounded on the owner's behalf.
//
// Every figure carries where it came from, because a quote built on an ASSUMED
// preset must not look like a quote built on a known one.
export interface QuickPrice {
  category: { code: string; name: string; is_assumed: boolean; assumed_note: string | null; notes: string | null };
  dose: { mixes: number | null; ml_per_mix: number | null; total_ml: number | null; max_ml: number | null; at_cap: boolean };
  crew_size: number | null;
  service_minutes: number | null;
  material_cost: number | null;
  material_basis: "batch" | "fallback" | "unknown";
  material_note: string | null;
  price_per_litre: number | null;
  labour_cost: number | null;
  labour_basis: string | null;
  distance_km: number | null;
  travel_cost: number | null;
  travel_basis: string | null;
  base_total: number | null;
  emirate: string | null;
  emirate_factor: number | null;      // e.g. 0.15
  suggested_with_factor: number | null;
  assumptions: string[];              // shown in the UI, never hidden
}

export async function quickPrice(
  tenantId: string, categoryCode: string, opts: { customerId?: string } = {},
): Promise<QuickPrice | null> {
  const { rows } = await scopedRead(tenantId,
    `with cat as (
       select code, name, is_assumed, assumed_note, notes, crew_size,
              est_duration_hours, buffer_minutes, mixes, ml_per_mix, max_ml
         from service_categories where tenant_id=$1 and code=$2 limit 1
     ), batch as (
       -- the most recent real purchase price, per LITRE (batches are costed per ml)
       select b.unit_cost * 1000 as per_litre
         from item_batches b join items i on i.id = b.item_id
        where i.tenant_id=$1 and i.code='BLITZ' and b.unit_cost is not null
        order by b.received_at desc nulls last limit 1
     ), cfg as (
       select
         (select (value #>> '{}')::numeric from settings
           where tenant_id=$1 and service_line_id is null and key='pricing.blitz_price_per_litre') as fallback_per_litre,
         (select value from settings
           where tenant_id=$1 and service_line_id is null and key='pricing.emirate_factor') as factors,
         (select value from settings
           where tenant_id=$1 and service_line_id is null and key='operations.home_base') as home,
         -- cost.* are scoped to the SERVICE LINE (that is where the costing engine
         -- writes them); the rest are tenant-wide. Prefer the service-line row and
         -- fall back to a tenant-wide one, so neither scope is silently ignored.
         (select (value #>> '{}')::numeric from settings
           where tenant_id=$1 and key='cost.standard_labour_rate_hourly'
           order by service_line_id nulls last limit 1) as labour_rate,
         (select (value #>> '{}')::numeric from settings
           where tenant_id=$1 and key='cost.overhead_rate_per_labour_hour'
           order by service_line_id nulls last limit 1) as overhead_rate,
         (select (value #>> '{}')::numeric from settings
           where tenant_id=$1 and key='cost.fuel_price_per_litre'
           order by service_line_id nulls last limit 1) as fuel_price,
         -- The costing engine already derives AED/km as fuel price / km per litre
         -- (cost.standard_vehicle_rate_per_km = 0.698 = 3.49 / 5). Read it rather
         -- than recomputing: a second copy of a number the platform already owns
         -- is how two figures start disagreeing. mig 108 added exactly such a
         -- duplicate and mig 110 removed it.
         (select (value #>> '{}')::numeric from settings
           where tenant_id=$1 and key='cost.standard_vehicle_rate_per_km'
           order by service_line_id nulls last limit 1) as km_rate,
         (select is_assumed from settings
           where tenant_id=$1 and key='cost.standard_vehicle_rate_per_km'
           order by service_line_id nulls last limit 1) as km_rate_assumed,
         (select is_assumed from settings
           where tenant_id=$1 and service_line_id is null and key='pricing.emirate_factor') as factor_assumed
     ), site as (
       select cu.emirate,
              (select b.location from customer_branches b
                where b.customer_id = cu.id and b.location is not null and b.archived_at is null
                order by b.created_at limit 1) as loc
         from customers cu where cu.tenant_id=$1 and cu.id = $3::uuid
     )
     select cat.*, batch.per_litre as batch_per_litre, cfg.fallback_per_litre,
            cfg.factors, cfg.factor_assumed, cfg.home,
            cfg.labour_rate, cfg.overhead_rate, cfg.fuel_price,
            cfg.km_rate, cfg.km_rate_assumed,
            site.emirate,
            case when site.loc is not null and (cfg.home->>'lat') is not null
                 then round((st_distance(site.loc,
                        ST_SetSRID(ST_MakePoint((cfg.home->>'lng')::float8,
                                                (cfg.home->>'lat')::float8),4326)::geography) / 1000)::numeric, 1)
            end as distance_km
       from cat left join batch on true left join cfg on true left join site on true`,
    [tenantId, categoryCode, opts.customerId ?? null]);
  const r = rows[0];
  if (!r) return null;

  const assumptions: string[] = [];
  if (r.is_assumed) assumptions.push(`the "${r.name}" preset itself is ASSUMED — ${r.assumed_note ?? "confirm before quoting from it"}`);

  const totalMl = r.mixes != null && r.ml_per_mix != null ? Number(r.mixes) * Number(r.ml_per_mix) : null;
  const atCap = totalMl != null && r.max_ml != null && totalMl >= Number(r.max_ml);

  const perLitre = r.batch_per_litre != null ? Number(r.batch_per_litre)
                 : r.fallback_per_litre != null ? Number(r.fallback_per_litre) : null;
  const materialBasis: QuickPrice["material_basis"] =
    r.batch_per_litre != null ? "batch" : r.fallback_per_litre != null ? "fallback" : "unknown";
  // The settings price is the owner-confirmed STANDARD cost, not a guess, so it
  // is not an assumption to flag. It is still worth saying which of the two the
  // number came from, because a real goods receipt supersedes it automatically.
  const materialNote = materialBasis === "batch"
    ? "from the last recorded purchase"
    : materialBasis === "fallback" ? "at the standard cost (no goods receipt yet)" : null;
  const materialCost = totalMl != null && perLitre != null ? +( (totalMl / 1000) * perLitre ).toFixed(2) : null;

  const serviceMinutes = r.est_duration_hours != null
    ? Math.round(Number(r.est_duration_hours) * 60) + Number(r.buffer_minutes ?? 0) : null;

  const distanceKm = r.distance_km != null ? Number(r.distance_km) : null;
  if (opts.customerId && distanceKm == null) {
    assumptions.push("no distance — the site has no map pin yet, so travel is not costed");
  }

  const emirate: string | null = r.emirate ?? null;
  const factors = (r.factors ?? {}) as Record<string, number>;
  const factor = emirate && factors[emirate] != null ? Number(factors[emirate]) : null;
  if (factor != null && r.factor_assumed) {
    assumptions.push(`the ${emirate} uplift of +${Math.round(factor * 100)}% is ASSUMED — the owner gave a range of +10–20%`);
  }

  // Labour: crew x hours x the standard rate, plus the overhead recovery the
  // costing engine already applies per labour hour. Same settings the job costing
  // uses, read rather than re-stated, so the quote and the actual job agree.
  const hours = serviceMinutes != null ? serviceMinutes / 60 : null;
  const crew = r.crew_size != null ? Number(r.crew_size) : null;
  const labourCost = hours != null && crew != null && r.labour_rate != null
    ? +((hours * crew) * (Number(r.labour_rate) + Number(r.overhead_rate ?? 0))).toFixed(2) : null;
  const labourBasis = labourCost != null
    ? `${crew} x ${hours!.toFixed(2)} h at AED ${Number(r.labour_rate).toFixed(2)}/h + AED ${Number(r.overhead_rate ?? 0).toFixed(2)}/h overhead`
    : "no rate configured — set it in Cost setup";

  // Travel: the round trip from the depot at the costing engine's own per-km rate.
  const travelCost = distanceKm != null && r.km_rate != null
    ? +((distanceKm * 2) * Number(r.km_rate)).toFixed(2) : null;
  if (travelCost != null && r.km_rate_assumed) {
    assumptions.push(`vehicle running cost of AED ${Number(r.km_rate)}/km is ASSUMED`);
  }

  const baseTotal = [materialCost, labourCost, travelCost].some((x) => x != null)
    ? +[materialCost, labourCost, travelCost].reduce((a: number, x) => a + (x ?? 0), 0).toFixed(2)
    : null;

  return {
    category: { code: r.code, name: r.name, is_assumed: r.is_assumed, assumed_note: r.assumed_note, notes: r.notes },
    dose: { mixes: r.mixes != null ? Number(r.mixes) : null, ml_per_mix: r.ml_per_mix != null ? Number(r.ml_per_mix) : null,
            total_ml: totalMl, max_ml: r.max_ml != null ? Number(r.max_ml) : null, at_cap: atCap },
    crew_size: r.crew_size != null ? Number(r.crew_size) : null,
    service_minutes: serviceMinutes,
    material_cost: materialCost, material_basis: materialBasis, price_per_litre: perLitre,
    material_note: materialNote,
    labour_cost: labourCost, labour_basis: labourBasis,
    distance_km: distanceKm, travel_cost: travelCost,
    travel_basis: distanceKm != null
      ? `${distanceKm} km each way from the Ajman depot, round trip at AED ${r.km_rate ?? "?"}/km`
      : null,
    base_total: baseTotal,
    emirate, emirate_factor: factor,
    suggested_with_factor: baseTotal != null && factor != null ? +(baseTotal * (1 + factor)).toFixed(2) : null,
    assumptions,
  };
}

// Every preset for a service line, costed, for the picker. One round trip per
// preset is fine at this size (18 categories) and keeps the costing in ONE place
// rather than duplicating the SQL into a list query.
export async function quickPriceAll(
  tenantId: string, opts: { customerId?: string; prefix?: string } = {},
): Promise<QuickPrice[]> {
  const { rows } = await scopedRead(tenantId,
    `select code from service_categories
      where tenant_id=$1 and is_active
        and ($2::text is null or code like $2 || '%')
      order by code`, [tenantId, opts.prefix ?? null]);
  const out: QuickPrice[] = [];
  for (const r of rows as { code: string }[]) {
    const q = await quickPrice(tenantId, r.code, { customerId: opts.customerId });
    if (q) out.push(q);
  }
  return out;
}
