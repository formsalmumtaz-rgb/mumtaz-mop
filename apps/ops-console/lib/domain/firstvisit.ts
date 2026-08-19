import "server-only";
import { scopedRead } from "../rls";

// §3.3 — where the FIRST visit of a new contract should go.
//
// Entirely deterministic (Art. IV: automation first, AI last). It reads the
// schedule that already exists and reports what it finds, in the order §3.3 sets
// out. It NEVER books anything: it returns suggestions with the reason attached,
// and the office confirms. "Flags — a human decides."
//
// There is no area/route master. An "area" is the district on the customer, and a
// team's area-day pattern is derived from the jobs already scheduled — the single
// source of truth about where teams actually go.
export type FirstVisitBasis = "area_day_this_week" | "near_area_this_week" | "area_day_next_week" | "none";

export interface FirstVisitSuggestion {
  basis: FirstVisitBasis;
  date: string | null;
  team_id: string | null;
  team_name: string | null;
  area: string | null;
  reason: string;          // shown verbatim to the office
  off_pattern: boolean;    // (b) → the job is flagged "first visit — off-pattern"
  distance_km: number | null;
  assumed: string[];       // ASSUMED settings this suggestion leaned on
}

const dayName = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" });
const pretty = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

export async function suggestFirstVisit(
  tenantId: string, contractId: string,
): Promise<{ suggestions: FirstVisitSuggestion[]; area: string | null; note: string | null }> {
  // The contract's customer, its area, and its pin (if the site has one).
  const { rows: ctx } = await scopedRead(tenantId,
    `select ct.customer_id, cu.district as area, cu.trade_name as customer,
            b.location is not null as has_pin, b.id as branch_id,
            (select (value #>> '{}') from settings
              where tenant_id=$1 and service_line_id is null and key='scheduling.week_start_day') as week_start,
            (select (value #>> '{}')::numeric from settings
              where tenant_id=$1 and service_line_id is null and key='scheduling.near_area_km') as near_km
       from contracts ct
       join customers cu on cu.id = ct.customer_id
       left join lateral (
         select id, location from customer_branches
          where customer_id = ct.customer_id and archived_at is null
          order by (location is not null) desc, created_at limit 1) b on true
      where ct.id = $2 and ct.tenant_id = $1`, [tenantId, contractId]);
  const c = ctx[0];
  if (!c) return { suggestions: [], area: null, note: "Contract not found." };

  const assumed = ["scheduling.week_start_day (ASSUMED)", "scheduling.near_area_km (ASSUMED)"];
  const out: FirstVisitSuggestion[] = [];

  // (a) the area is already being served THIS WEEK, on a day still to come.
  if (c.area) {
    const { rows } = await scopedRead(tenantId,
      `select j.scheduled_date::text as date, j.team_id, tm.name as team_name, count(*)::int as jobs
         from jobs j
         join customers cu on cu.id = j.customer_id
         left join teams tm on tm.id = j.team_id
        where j.tenant_id = $1 and cu.district = $2
          and j.archived_at is null and j.status not in ('cancelled')
          and j.scheduled_date > current_date
          and j.scheduled_date < date_trunc('week', current_date) + interval '7 days'
        group by 1,2,3 order by 1 limit 1`, [tenantId, c.area]);
    if (rows[0]) {
      out.push({
        basis: "area_day_this_week", date: rows[0].date, team_id: rows[0].team_id,
        team_name: rows[0].team_name, area: c.area, off_pattern: false, distance_km: null, assumed,
        reason: `${rows[0].team_name ?? "A team"} is already in ${c.area} on ${dayName(rows[0].date)} ${pretty(rows[0].date)} `
              + `(${rows[0].jobs} job${rows[0].jobs === 1 ? "" : "s"}) — put the first visit on that day.`,
      });
    }
  }

  // (b) the area's day has passed this week — is a team passing NEAR the site on a
  //     day still to come? Distance from the site's own pin, PostGIS, no provider.
  if (!out.length && c.has_pin) {
    const { rows } = await scopedRead(tenantId,
      `select j.scheduled_date::text as date, j.team_id, tm.name as team_name,
              cu.district as their_area,
              round((st_distance(b.location, me.location) / 1000)::numeric, 1) as km
         from jobs j
         join customers cu on cu.id = j.customer_id
         join customer_branches b on b.id = j.branch_id and b.location is not null
         left join teams tm on tm.id = j.team_id
         cross join (select location from customer_branches where id = $3) me
        where j.tenant_id = $1 and j.archived_at is null and j.status not in ('cancelled')
          and j.scheduled_date > current_date
          and j.scheduled_date < date_trunc('week', current_date) + interval '7 days'
          and st_dwithin(b.location, me.location, $2 * 1000)
        order by st_distance(b.location, me.location), j.scheduled_date limit 1`,
      [tenantId, Number(c.near_km ?? 5), c.branch_id]);
    if (rows[0]) {
      out.push({
        basis: "near_area_this_week", date: rows[0].date, team_id: rows[0].team_id,
        team_name: rows[0].team_name, area: rows[0].their_area, off_pattern: true,
        distance_km: Number(rows[0].km), assumed,
        reason: `${rows[0].team_name ?? "A team"} passes ${rows[0].their_area ?? "nearby"} on ${dayName(rows[0].date)} `
              + `${pretty(rows[0].date)}, ${rows[0].km} km away — add as an extra job that day, flagged "first visit — off-pattern".`,
      });
    }
  }

  // (c) nothing near this week — when is the area next served?
  if (!out.length && c.area) {
    const { rows } = await scopedRead(tenantId,
      `select j.scheduled_date::text as date, j.team_id, tm.name as team_name
         from jobs j
         join customers cu on cu.id = j.customer_id
         left join teams tm on tm.id = j.team_id
        where j.tenant_id = $1 and cu.district = $2
          and j.archived_at is null and j.status not in ('cancelled')
          and j.scheduled_date >= date_trunc('week', current_date) + interval '7 days'
        order by j.scheduled_date limit 1`, [tenantId, c.area]);
    if (rows[0]) {
      out.push({
        basis: "area_day_next_week", date: rows[0].date, team_id: rows[0].team_id,
        team_name: rows[0].team_name, area: c.area, off_pattern: false, distance_km: null, assumed,
        reason: `${c.area} is next served on ${dayName(rows[0].date)} ${pretty(rows[0].date)}`
              + `${rows[0].team_name ? ` by ${rows[0].team_name}` : ""} — put the first visit there.`,
      });
    }
  }

  const note = out.length ? null
    : !c.area ? `No area recorded for ${c.customer ?? "this customer"} — set the district on the profile and the first visit can be slotted into a team's existing round.`
    : `Nothing is scheduled in ${c.area} yet${c.has_pin ? " and no team passes nearby" : ", and this site has no map pin to measure from"}. Choose a date.`;
  return { suggestions: out, area: c.area ?? null, note };
}
