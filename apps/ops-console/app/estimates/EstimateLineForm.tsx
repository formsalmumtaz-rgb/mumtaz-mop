"use client";
import { useMemo, useState } from "react";

interface Opt { id: string; name: string | null }
interface ModelOpt { id: string; name: string; model_type: string; formula_spec?: { base?: number; terms?: { measure_key: string; rate: number }[] } }
interface Rates { labour: number; vehicle: number; overheadOn: boolean; overhead: number }

const nn = (v: string) => { const x = Number((v ?? "").trim()); return Number.isFinite(x) ? x : 0; };

// Mirrors fn_price (028) + fn_estimate_cost (029) for a live line preview.
function price(mt: string, unit: number, measure: number, spec: ModelOpt["formula_spec"], m: Record<string, number>): number {
  if (mt === "fixed" || mt === "custom") return unit;
  if (mt === "formula") return (spec?.base ?? 0) + (spec?.terms ?? []).reduce((s, t) => s + t.rate * (m[t.measure_key] ?? 0), 0);
  return unit * measure;
}

export function EstimateLineForm({ action, estimateId, services, models, rates }: {
  action: (fd: FormData) => Promise<void>;
  estimateId: string; services: Opt[]; models: ModelOpt[]; rates: Rates;
}) {
  const [modelId, setModelId] = useState("");
  const [unit, setUnit] = useState("");
  const [measure, setMeasure] = useState("1");
  const [fMeasures, setFMeasures] = useState<Record<string, string>>({});
  const [hours, setHours] = useState("");
  const [km, setKm] = useState("");
  const [mat, setMat] = useState("");

  const model = models.find((m) => m.id === modelId);
  const mt = model?.model_type ?? "fixed";
  const isFlat = mt === "fixed" || mt === "custom";
  const isFormula = mt === "formula";

  const revenue = useMemo(() => {
    const mv: Record<string, number> = {};
    for (const t of model?.formula_spec?.terms ?? []) mv[t.measure_key] = nn(fMeasures[t.measure_key] ?? "");
    return price(mt, nn(unit), nn(measure), model?.formula_spec, mv);
  }, [mt, unit, measure, fMeasures, model]);
  const cost = useMemo(() => {
    const c = nn(mat) + rates.labour * nn(hours) + rates.vehicle * nn(km) + (rates.overheadOn ? rates.overhead * nn(hours) : 0);
    return Math.round(c * 100) / 100;
  }, [mat, hours, km, rates]);
  const margin = revenue > 0 ? ((revenue - cost) / revenue) * 100 : null;

  return (
    <form action={action} className="mt-3 space-y-3">
      <input type="hidden" name="estimate_id" value={estimateId} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="text-sm"><span className="text-neutral-600">Service</span>
          <select name="service_type_id" className="mt-1 w-full rounded border border-neutral-300 px-2 py-2">
            <option value="">—</option>{services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select></label>
        <label className="text-sm"><span className="text-neutral-600">Pricing model *</span>
          <select name="pricing_model_id" required value={modelId} onChange={(e) => setModelId(e.target.value)} className="mt-1 w-full rounded border border-neutral-300 px-2 py-2">
            <option value="">Select…</option>{models.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.model_type})</option>)}
          </select></label>
        <label className="text-sm"><span className="text-neutral-600">Description</span>
          <input name="description" className="mt-1 w-full rounded border border-neutral-300 px-2 py-2" /></label>
      </div>

      {/* revenue inputs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        {isFlat && <label className="text-sm"><span className="text-neutral-600">Price (AED)</span>
          <input name="unit_price" type="number" min="0" step="any" value={unit} onChange={(e) => setUnit(e.target.value)} className="mt-1 w-full rounded border border-neutral-300 px-2 py-2" /></label>}
        {!isFlat && !isFormula && <>
          <label className="text-sm"><span className="text-neutral-600">Unit price</span>
            <input name="unit_price" type="number" min="0" step="any" value={unit} onChange={(e) => setUnit(e.target.value)} className="mt-1 w-full rounded border border-neutral-300 px-2 py-2" /></label>
          <label className="text-sm"><span className="text-neutral-600">Measure</span>
            <input name="measure" type="number" min="0" step="any" value={measure} onChange={(e) => setMeasure(e.target.value)} className="mt-1 w-full rounded border border-neutral-300 px-2 py-2" /></label>
        </>}
        {isFormula && (model?.formula_spec?.terms ?? []).map((t, i) => (
          <label key={i} className="text-sm"><span className="text-neutral-600">{t.measure_key}</span>
            <input type="number" step="any" value={fMeasures[t.measure_key] ?? ""} onChange={(e) => setFMeasures({ ...fMeasures, [t.measure_key]: e.target.value })} className="mt-1 w-full rounded border border-neutral-300 px-2 py-2" />
            <input type="hidden" name="measure_key" value={t.measure_key} /><input type="hidden" name="measure_val" value={fMeasures[t.measure_key] ?? "0"} />
          </label>
        ))}
      </div>

      {/* cost inputs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="text-sm"><span className="text-neutral-600">Est. labour hours</span>
          <input name="est_labour_hours" type="number" min="0" step="any" value={hours} onChange={(e) => setHours(e.target.value)} className="mt-1 w-full rounded border border-neutral-300 px-2 py-2" /></label>
        <label className="text-sm"><span className="text-neutral-600">Est. distance (km)</span>
          <input name="est_distance_km" type="number" min="0" step="any" value={km} onChange={(e) => setKm(e.target.value)} className="mt-1 w-full rounded border border-neutral-300 px-2 py-2" /></label>
        <label className="text-sm"><span className="text-neutral-600">Est. material (AED)</span>
          <input name="est_material_cost" type="number" min="0" step="any" value={mat} onChange={(e) => setMat(e.target.value)} className="mt-1 w-full rounded border border-neutral-300 px-2 py-2" /></label>
      </div>

      <div className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-4 py-3 text-sm flex flex-wrap gap-x-6">
        <span>Revenue <span className="font-semibold">AED {revenue.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span></span>
        <span>Est. cost <span className="font-semibold">AED {cost.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span></span>
        <span>Margin <span className="font-semibold">{margin == null ? "—" : margin.toFixed(1) + "%"}</span></span>
      </div>
      <button className="w-full rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark sm:w-auto">Add line</button>
    </form>
  );
}
