import type { QuickPrice } from "@/lib/domain/quickprice";
import { AssumedBadge } from "./AssumedBadge";

// §3.5 — the category picker, alive. One tap shows what a preset actually costs:
// dosage, crew, time, and the three cost lines behind the number. Nothing is
// hidden and nothing is rounded on the owner's behalf — the emirate uplift is
// shown BESIDE the figure as guidance, never folded into it.
const aed = (n: number | null) => (n == null ? "—" : `AED ${n.toFixed(2)}`);

export function QuickPricePanel({ presets, customerLabel }: {
  presets: QuickPrice[]; customerLabel?: string | null;
}) {
  if (presets.length === 0) return null;
  return (
    <div className="space-y-3">
      {customerLabel && (
        <p className="text-sm text-neutral-600">
          Costed for <strong>{customerLabel}</strong> — travel is the real distance from the Ajman depot to that site.
        </p>
      )}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {presets.map((p) => (
          <div key={p.category.code}
               className={`rounded-lg border p-4 ${p.category.is_assumed ? "border-amber-300 bg-amber-50/40" : "border-neutral-200 bg-white"}`}>
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="font-medium">{p.category.name}</h3>
              {p.category.is_assumed && <AssumedBadge />}
            </div>

            <p className="mt-1 text-xs text-neutral-600">
              {p.dose.total_ml != null
                ? <>{p.dose.mixes} mix{p.dose.mixes === 1 ? "" : "es"} · {p.dose.total_ml} ml
                    {p.dose.max_ml != null && <> · cap {p.dose.max_ml} ml{p.dose.at_cap && <strong> (at cap)</strong>}</>}</>
                : "no dosage set"}
              {p.crew_size != null && <> · crew {p.crew_size}</>}
              {p.service_minutes != null && <> · {p.service_minutes} min</>}
            </p>

            <dl className="mt-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-neutral-500">Material{p.material_note && <span className="block text-xs text-neutral-400">{p.material_note}</span>}</dt>
                <dd>{aed(p.material_cost)}</dd>
              </div>
              <div className="flex justify-between"><dt className="text-neutral-500">Labour</dt><dd>{aed(p.labour_cost)}</dd></div>
              <div className="flex justify-between"><dt className="text-neutral-500">Travel</dt><dd>{aed(p.travel_cost)}</dd></div>
              <div className="mt-1 flex justify-between border-t border-neutral-200 pt-1 font-medium">
                <dt>Direct cost</dt><dd>{aed(p.base_total)}</dd>
              </div>
            </dl>

            {p.emirate_factor != null && (
              <p className="mt-2 rounded bg-sky-50 px-2 py-1 text-xs text-sky-900">
                {p.emirate} guidance +{Math.round(p.emirate_factor * 100)}% → <strong>{aed(p.suggested_with_factor)}</strong>
                <span className="block text-sky-700">Guidance only — not applied, not rounded.</span>
              </p>
            )}

            {p.travel_basis && <p className="mt-2 text-xs text-neutral-500">{p.travel_basis}</p>}
            {p.labour_basis && <p className="text-xs text-neutral-500">{p.labour_basis}</p>}
            {p.category.notes && <p className="mt-2 text-xs text-neutral-600">{p.category.notes}</p>}

            {p.assumptions.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-xs text-amber-800">
                {p.assumptions.map((a, i) => <li key={i}>! {a}</li>)}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
