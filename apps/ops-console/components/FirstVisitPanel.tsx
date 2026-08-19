import type { FirstVisitSuggestion } from "@/lib/domain/firstvisit";

// §3.3 — "Surface as suggestions with reasons. The office confirms; never silent
// auto-booking." The engine has already read the schedule and worked out where
// this contract's first visit belongs; this shows what it found, WHY, and books
// only when someone clicks.
export function FirstVisitPanel({
  contractId, suggestions, area, note, booked, action,
}: {
  contractId: string;
  suggestions: FirstVisitSuggestion[];
  area: string | null;
  note: string | null;
  booked: { date: string; off_pattern: boolean } | null;
  action: (fd: FormData) => Promise<void>;
}) {
  if (booked) {
    return (
      <section className="rounded-lg border border-emerald-300 bg-emerald-50/60 p-4">
        <h2 className="font-medium text-emerald-900">First visit booked — {booked.date}</h2>
        {booked.off_pattern && (
          <p className="mt-1 text-sm text-emerald-800">
            Flagged <strong>first visit — off-pattern</strong>: it was added to a round passing nearby,
            not to this area&rsquo;s own day.
          </p>
        )}
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-sky-300 bg-sky-50/60 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-medium text-sky-900">First visit</h2>
        {area && <span className="text-xs text-sky-800">area: {area}</span>}
      </div>

      {suggestions.length === 0 ? (
        <p className="mt-2 text-sm text-sky-900">{note}</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {suggestions.map((s) => (
            <li key={`${s.basis}-${s.date}`} className="rounded border border-sky-200 bg-white p-3">
              <p className="text-sm text-neutral-800">{s.reason}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <form action={action}>
                  <input type="hidden" name="contract_id" value={contractId} />
                  <input type="hidden" name="date" value={s.date ?? ""} />
                  <input type="hidden" name="team_id" value={s.team_id ?? ""} />
                  <input type="hidden" name="basis" value={s.basis} />
                  <input type="hidden" name="off_pattern" value={String(s.off_pattern)} />
                  <input type="hidden" name="reason" value={s.reason} />
                  <button className="rounded bg-sky-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-800">
                    Book {s.date}
                  </button>
                </form>
                {s.off_pattern && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                    off-pattern{s.distance_km != null ? ` · ${s.distance_km} km` : ""}
                  </span>
                )}
                {s.assumed.length > 0 && (
                  <span className="text-xs text-neutral-500">based on {s.assumed.join(", ")}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-sky-800">
        Nothing is booked until you press a button. From the second visit onward the customer
        joins this area&rsquo;s normal pattern.
      </p>
    </section>
  );
}
