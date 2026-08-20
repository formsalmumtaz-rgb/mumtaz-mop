"use client";
import { useEffect, useState } from "react";

// Item 7 — the first question, because it decides everything after it.
//
// One-off or recurring determines whether a frequency exists, whether an AMC
// exists, whether the contract renews and whether the schedule generates
// visits. It was being discovered at the CONTRACT, three screens after the
// decision was actually made — so the frequency arrived as a surprise and the
// person had to go back.
//
// Recurring also shows the frequency IMMEDIATELY, defaulted from the premises
// type. A blank dropdown when the premises already implies the answer is how a
// new person gets it wrong.
export interface FreqOpt { id: string; name: string }

export function EngagementChoice({ frequencies, premisesSelectName, premises }: {
  frequencies: FreqOpt[];
  // The property-type <select> this watches. The suggested frequency comes FROM
  // the premises — F&B is 24 a year because that is what food premises need —
  // so the two controls cannot be independent, and asking twice for something
  // the first answer implies is what item 7 is about.
  premisesSelectName?: string;
  premises?: { id: string; name: string; default_frequency_id: string | null }[];
}) {
  const [kind, setKind] = useState<"" | "one_off" | "recurring">("");
  const [suggested, setSuggested] = useState<{ id: string; label: string } | null>(null);

  // Watching the DOM rather than lifting both controls into one component: the
  // property type belongs with the customer block, the engagement question
  // belongs at the top, and forcing them into one component to share a value
  // would put them in the wrong places on the screen.
  useEffect(() => {
    if (!premisesSelectName || !premises?.length) return;
    const el = document.querySelector<HTMLSelectElement>(`select[name="${premisesSelectName}"]`);
    if (!el) return;
    const sync = () => {
      const f = premises.find((x) => x.id === el.value);
      const freq = f?.default_frequency_id
        ? frequencies.find((q) => q.id === f.default_frequency_id) : undefined;
      setSuggested(freq && f ? { id: freq.id, label: `${freq.name} — the usual for ${f.name.toLowerCase()}` } : null);
    };
    sync();
    el.addEventListener("change", sync);
    return () => el.removeEventListener("change", sync);
  }, [premisesSelectName, premises, frequencies]);

  const defaultFrequencyId = suggested?.id ?? null;
  const premisesLabel = suggested?.label ?? null;
  const card = (active: boolean) =>
    `flex-1 rounded-xl border-2 px-4 py-3 text-left transition ${
      active ? "border-brand bg-brand/[0.05]" : "border-line bg-white hover:bg-neutral-50"}`;

  return (
    <div className="sm:col-span-2">
      <span className="text-xs font-medium text-muted">Is this a one-off job or a contract? *</span>
      <input type="hidden" name="engagement_type" value={kind} />
      <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
        <button type="button" onClick={() => setKind("one_off")} className={card(kind === "one_off")}>
          <span className="block font-medium">One-off</span>
          <span className="mt-0.5 block text-xs text-muted">A single visit. No frequency, no AMC, nothing renews.</span>
        </button>
        <button type="button" onClick={() => setKind("recurring")} className={card(kind === "recurring")}>
          <span className="block font-medium">Recurring (AMC)</span>
          <span className="mt-0.5 block text-xs text-muted">A contract with scheduled visits through the year.</span>
        </button>
      </div>

      {kind === "recurring" && (
        <div className="mt-3 rounded-lg border border-line bg-surface p-3">
          <label className="text-sm">
            <span className="text-xs font-medium text-muted">How often?</span>
            <select name="frequency_id" key={defaultFrequencyId ?? "none"} defaultValue={defaultFrequencyId ?? ""}
                    className="mt-1 w-full rounded-lg border border-line px-3 py-2">
              <option value="">—</option>
              {frequencies.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </label>
          {premisesLabel ? (
            <p className="mt-1.5 text-[11px] text-muted">
              {premisesLabel} — change it if this customer is different. The contract inherits this and never asks again.
            </p>
          ) : (
            <p className="mt-1.5 text-[11px] text-muted">
              Pick the property type below and this fills itself in.
            </p>
          )}
        </div>
      )}
      {kind === "one_off" && (
        <p className="mt-2 text-[11px] text-muted">
          No frequency is needed. Nothing downstream will ask you for an AMC or a renewal.
        </p>
      )}
    </div>
  );
}
