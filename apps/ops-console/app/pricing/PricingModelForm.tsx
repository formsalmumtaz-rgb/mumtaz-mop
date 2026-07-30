"use client";
import { useMemo, useState } from "react";

const MODEL_TYPES = [
  "fixed", "per_hour", "per_day", "per_person", "per_month", "per_visit",
  "per_sqm", "per_apartment", "per_room", "per_floor", "per_duct",
  "per_linear_metre", "quantity_unit", "formula", "custom",
];
const n = (v: string) => { const x = Number((v ?? "").trim()); return Number.isFinite(x) ? x : 0; };

interface Term { measure_key: string; rate: string }
interface Initial { id?: string; name?: string; model_type?: string; formula_spec?: { base?: number; terms?: { measure_key: string; rate: number }[] } }

// Deterministic mirror of fn_price (mig 028) for the live preview.
function price(modelType: string, unit: number, measure: number, base: number, terms: Term[], measures: Record<string, number>): number {
  if (modelType === "fixed" || modelType === "custom") return unit;
  if (modelType === "formula") return base + terms.reduce((s, t) => s + n(t.rate) * (measures[t.measure_key] ?? 0), 0);
  return unit * measure;
}

export function PricingModelForm({ action, initial, submitLabel }: {
  action: (fd: FormData) => Promise<void>; initial?: Initial; submitLabel: string;
}) {
  const [modelType, setModelType] = useState(initial?.model_type ?? "fixed");
  const [base, setBase] = useState(String(initial?.formula_spec?.base ?? ""));
  const [terms, setTerms] = useState<Term[]>(
    (initial?.formula_spec?.terms ?? []).map((t) => ({ measure_key: t.measure_key, rate: String(t.rate) })),
  );
  // preview inputs
  const [unit, setUnit] = useState("100");
  const [measure, setMeasure] = useState("1");
  const [measures, setMeasures] = useState<Record<string, string>>({});

  const isFormula = modelType === "formula";
  const isFlat = modelType === "fixed" || modelType === "custom";

  const preview = useMemo(() => {
    const mv: Record<string, number> = {};
    for (const t of terms) mv[t.measure_key] = n(measures[t.measure_key] ?? "");
    return price(modelType, n(unit), n(measure), n(base), terms, mv);
  }, [modelType, unit, measure, base, terms, measures]);

  return (
    <form action={action} className="mt-3 space-y-4">
      {initial?.id && <input type="hidden" name="id" value={initial.id} />}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="text-neutral-600">Name *</span>
          <input name="name" required defaultValue={initial?.name ?? ""} className="mt-1 w-full rounded border border-neutral-300 px-2 py-2" />
        </label>
        <label className="text-sm">
          <span className="text-neutral-600">Model type</span>
          <select name="model_type" value={modelType} onChange={(e) => setModelType(e.target.value)} className="mt-1 w-full rounded border border-neutral-300 px-2 py-2">
            {MODEL_TYPES.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
      </div>

      {isFormula && (
        <div className="rounded border border-neutral-200 p-3">
          <div className="text-sm font-medium text-neutral-700">Structured formula — base + Σ (measure × rate)</div>
          <label className="mt-2 block text-sm">
            <span className="text-neutral-600">Base</span>
            <input name="formula_base" type="number" min="0" step="any" value={base} onChange={(e) => setBase(e.target.value)} className="mt-1 w-32 rounded border border-neutral-300 px-2 py-1" />
          </label>
          <div className="mt-2 space-y-2">
            {terms.map((t, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <input name="formula_key" value={t.measure_key} placeholder="measure key (e.g. rooms)"
                       onChange={(e) => setTerms(terms.map((x, j) => j === i ? { ...x, measure_key: e.target.value } : x))}
                       className="w-48 rounded border border-neutral-300 px-2 py-1 text-sm" />
                <span className="text-neutral-400">×</span>
                <input name="formula_rate" type="number" step="any" value={t.rate} placeholder="rate"
                       onChange={(e) => setTerms(terms.map((x, j) => j === i ? { ...x, rate: e.target.value } : x))}
                       className="w-28 rounded border border-neutral-300 px-2 py-1 text-sm" />
                <button type="button" onClick={() => setTerms(terms.filter((_, j) => j !== i))} className="text-xs text-neutral-500 hover:text-red-600">remove</button>
              </div>
            ))}
            <button type="button" onClick={() => setTerms([...terms, { measure_key: "", rate: "" }])} className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50">+ add term</button>
          </div>
        </div>
      )}

      {/* Live preview */}
      <div className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-4 py-3 text-sm">
        <div className="mb-2 font-medium text-neutral-700">Price preview</div>
        <div className="flex flex-wrap items-end gap-3">
          {isFlat && (
            <label className="text-sm"><span className="text-neutral-600">Price (AED)</span>
              <input type="number" value={unit} onChange={(e) => setUnit(e.target.value)} className="mt-1 w-28 rounded border border-neutral-300 px-2 py-1" /></label>
          )}
          {!isFlat && !isFormula && (
            <>
              <label className="text-sm"><span className="text-neutral-600">Unit price</span>
                <input type="number" value={unit} onChange={(e) => setUnit(e.target.value)} className="mt-1 w-28 rounded border border-neutral-300 px-2 py-1" /></label>
              <label className="text-sm"><span className="text-neutral-600">Measure ({modelType.replace("per_", "").replace("_", " ")})</span>
                <input type="number" value={measure} onChange={(e) => setMeasure(e.target.value)} className="mt-1 w-28 rounded border border-neutral-300 px-2 py-1" /></label>
            </>
          )}
          {isFormula && terms.map((t, i) => (
            <label key={i} className="text-sm"><span className="text-neutral-600">{t.measure_key || `measure ${i + 1}`}</span>
              <input type="number" value={measures[t.measure_key] ?? ""} onChange={(e) => setMeasures({ ...measures, [t.measure_key]: e.target.value })} className="mt-1 w-24 rounded border border-neutral-300 px-2 py-1" /></label>
          ))}
          <div className="ml-auto text-right">
            <div className="text-xs text-neutral-500">computed</div>
            <div className="text-lg font-semibold">AED {preview.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
          </div>
        </div>
      </div>

      <button className="w-full rounded bg-brand px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-dark sm:w-auto">{submitLabel}</button>
    </form>
  );
}
