import "server-only";
import { scopedRead } from "../rls";

// DEFECT 2 — what the technician SHOULD use, and what is left in the van.
//
// The dose itself is computed by fn_expected_dose (mig 131), deliberately in SQL:
// the field sync needs it for every job in one round-trip, the console shows the
// same number on the job page, and the office variance report must agree with
// both. One definition, three readers. This module is the typed door to it.
export interface ExpectedDose {
  recipe: string | null;
  recipe_version_id: string | null;
  product: { item_id: string; name: string; unit: string; substitution_group: string | null } | null;
  mixes: number | null;
  ml_per_mix: number | null;
  total_qty: number | null;
  water_litres: number | null;
  adjuvants: { item_id: string; name: string; qty: number; unit: string }[];
  category: string | null;
  category_source: "job" | "contract" | "estimate" | null;
  cap_qty: number | null;          // the category's hard cap, where it has one
  why: string;                     // shown to the technician, in words
  alternatives: { item_id: string; name: string; unit: string }[];  // same substitution group only
}

export async function expectedDose(tenantId: string, jobId: string): Promise<ExpectedDose | null> {
  const { rows } = await scopedRead(tenantId, `select fn_expected_dose($1,$2) as d`, [tenantId, jobId]);
  return (rows[0]?.d as ExpectedDose | null) ?? null;
}

// What is in the van right now: what the team lead COUNTED this morning, less
// everything recorded as used since. The declared count is the honest figure —
// the warehouse's number is what it believes it issued, which is a different
// claim and is shown separately.
export async function vanStock(tenantId: string, technicianId: string): Promise<
  { item_id: string; name: string; unit: string; declared: number; used: number; remaining: number }[]
> {
  const { rows } = await scopedRead(tenantId,
    `with declared as (
       select d.item_id, sum(d.declared_qty_base)::numeric as qty
         from preflight_stock_declarations d
         join preflight_checks pc on pc.id = d.preflight_check_id
        where pc.tenant_id = $1 and pc.technician_id = $2 and pc.check_date = current_date
        group by d.item_id
     ), used as (
       select u.item_id, sum(u.actual_qty)::numeric as qty
         from job_material_usage u
         join job_assignments ja on ja.job_id = u.job_id and ja.technician_id = $2
        where u.tenant_id = $1 and u.created_at::date = current_date
        group by u.item_id
     )
     select i.id as item_id, i.name, coalesce(un.code,'') as unit,
            coalesce(d.qty, 0)::float8 as declared,
            coalesce(us.qty, 0)::float8 as used,
            (coalesce(d.qty, 0) - coalesce(us.qty, 0))::float8 as remaining
       from declared d
       full outer join used us on us.item_id = d.item_id
       join items i on i.id = coalesce(d.item_id, us.item_id)
       left join units un on un.id = i.base_unit_id
      order by i.name`, [tenantId, technicianId]);
  return rows as never;
}
