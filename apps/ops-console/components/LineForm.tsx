"use client";
import { useEffect, useMemo, useRef, useState } from "react";

interface Opt { id: string; name: string | null }
interface ModelOpt { id: string; name: string; model_type: string; formula_spec?: { base?: number; terms?: { measure_key: string; rate: number }[] } }
interface Rates { labour: number; vehicle: number; overheadOn: boolean; overhead: number }

// Flow item 5 — engine-computed prefills. Every value here arrives computed
// (labour standard, travel from the site pin, materials from the recipe at real
// batch costs) and is shown WITH ITS BASIS, editable. See getLineDefaults.
export interface LineDefaultsProps {
  treatment_hours: number;
  travel_hours: number;
  labour_hours: number;
  round_trip_km: number;
  distance_basis: string;
  material_rate_spray_per_m2: number;
  material_rate_gel_per_m2: number;
  target_margin: number | null;
  reference_rates: { label: string; aed: number }[];
  assumed_keys: string[];
}

const nn = (v: string) => { const x = Number((v ?? "").trim()); return Number.isFinite(x) ? x : 0; };
const fmt = (n: number, dp = 2) => n.toLocaleString(undefined, { maximumFractionDigits: dp });

// Mirrors fn_price (028) + fn_estimate_cost (029) for a live line preview.
// Shared by estimate lines and survey lines so the preview is identical.
function price(mt: string, unit: number, measure: number, spec: ModelOpt["formula_spec"], m: Record<string, number>): number {
  if (mt === "fixed" || mt === "custom") return unit;
  if (mt === "formula") return (spec?.base ?? 0) + (spec?.terms ?? []).reduce((s, t) => s + t.rate * (m[t.measure_key] ?? 0), 0);
  return unit * measure;
}

// Which of the entered measures is a treatable area (m²)? Drives the material
// prefill: recipe per-m² rate × area. Matches the common measure key names.
const AREA_KEY = /area|sqm|m2|sq_m/i;

export function LineForm({ action, entityId, idFieldName = "estimate_id", services, models, rates, defaults, showObservedNotes = false, submitLabel = "Add line" }: {
  action: (fd: FormData) => Promise<void>;
  entityId: string; idFieldName?: string; services: Opt[]; models: ModelOpt[]; rates: Rates;
  defaults?: LineDefaultsProps;
  showObservedNotes?: boolean; submitLabel?: string;
}) {
  const [modelId, setModelId] = useState("");
  const [unit, setUnit] = useState("");
  const [measure, setMeasure] = useState("1");
  const [fMeasures, setFMeasures] = useState<Record<string, string>>({});
  const [hours, setHours] = useState(defaults ? String(defaults.labour_hours) : "");
  const [km, setKm] = useState(defaults ? String(defaults.round_trip_km) : "");
  const [mat, setMat] = useState("");
  const matTouched = useRef(false);

  const model = models.find((m) => m.id === modelId);
  const mt = model?.model_type ?? "fixed";
  const isFlat = mt === "fixed" || mt === "custom";
  const isFormula = mt === "formula";

  // The area the user typed for REVENUE (per-unit measure or a formula term) is
  // reused for the material prefill — never asked twice (the governing rule).
  const area = useMemo(() => {
    if (isFormula) {
      for (const t of model?.formula_spec?.terms ?? []) {
        if (AREA_KEY.test(t.measure_key)) return nn(fMeasures[t.measure_key] ?? "");
      }
      return 0;
    }
    return AREA_KEY.test(model?.name ?? "") || mt === "per_unit" ? nn(measure) : nn(measure);
  }, [isFormula, model, fMeasures, measure, mt]);

  const materialRate = defaults ? defaults.material_rate_spray_per_m2 : 0;
  useEffect(() => {
    if (!defaults || matTouched.current) return;
    if (area > 0 && materialRate > 0) setMat(String(Math.round(area * materialRate * 100) / 100));
  }, [area, materialRate, defaults]);

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

  const tm = defaults?.target_margin ?? null;
  const suggested = tm != null && tm < 1 && cost > 0 ? Math.round((cost / (1 - tm)) * 100) / 100 : null;
  const setPrice = (v: number) => {
    if (isFlat || !isFormula) setUnit(String(v));
  };

  const assumed = (key: string) => defaults?.assumed_keys.includes(key);
  const basisNote = (text: string, isAssumed?: boolean) => (
    <span className="mt-0.5 block text-xs text-neutral-400">
      {text}
      {isAssumed && <span className="ml-1 rounded bg-amber-100 px-1 py-0.5 text-[10px] font-semibold text-amber-800" title="ASSUMED value — confirm in Cost setup">ASSUMED</span>}
    </span>
  );

  return (
    <form action={action} className="mt-3 space-y-3">
      <input type="hidden" name={idFieldName} value={entityId} />
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

      {/* price guidance — suggested at target margin + the real reference rates */}
      {defaults && (suggested != null || defaults.reference_rates.length > 0) && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {suggested != null && (
            <button type="button" onClick={() => setPrice(suggested)}
              className="rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 font-medium text-emerald-800 hover:bg-emerald-100"
              title={`Covers the computed cost at the ${((tm ?? 0) * 100).toFixed(0)}% target margin — click to use`}>
              Suggested {fmt(suggested)} at {((tm ?? 0) * 100).toFixed(0)}%{assumed("cost.target_margin_default") ? " (assumed)" : ""}
            </button>
          )}
          {defaults.reference_rates.map((rr) => (
            <button key={rr.label} type="button" onClick={() => setPrice(rr.aed)}
              className="rounded-full border border-neutral-300 bg-white px-2.5 py-1 text-neutral-700 hover:bg-neutral-50"
              title={`Real reference rate — ${rr.label}. Click to use.`}>
              {rr.label}: {fmt(rr.aed)}
            </button>
          ))}
        </div>
      )}

      {/* cost inputs — COMPUTED, shown with their basis, editable (never asked blind) */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="text-sm"><span className="text-neutral-600">Labour hours</span>
          <input name="est_labour_hours" type="number" min="0" step="any" value={hours} onChange={(e) => setHours(e.target.value)} className="mt-1 w-full rounded border border-neutral-300 px-2 py-2" />
          {defaults && basisNote(
            `${fmt(defaults.treatment_hours)}h treatment + ${fmt(defaults.travel_hours)}h travel @ ${fmt(rates.labour)}/hr`,
            assumed("cost.treatment_hours_per_visit") || assumed("cost.travel_speed_kmh"))}
        </label>
        <label className="text-sm"><span className="text-neutral-600">Distance (km, round trip)</span>
          <input name="est_distance_km" type="number" min="0" step="any" value={km} onChange={(e) => setKm(e.target.value)} className="mt-1 w-full rounded border border-neutral-300 px-2 py-2" />
          {defaults && basisNote(`${defaults.distance_basis} @ ${fmt(rates.vehicle)}/km`,
            assumed("cost.default_job_one_way_km") || assumed("cost.road_distance_factor"))}
        </label>
        <label className="text-sm"><span className="text-neutral-600">Material (AED)</span>
          <input name="est_material_cost" type="number" min="0" step="any" value={mat}
            onChange={(e) => { matTouched.current = true; setMat(e.target.value); }}
            className="mt-1 w-full rounded border border-neutral-300 px-2 py-2" />
          {defaults && basisNote(
            materialRate > 0
              ? (area > 0 ? `recipe: ${fmt(area, 0)} m² × ${fmt(materialRate, 4)}/m² (real batch costs)` : `enter an area above — recipe costs ${fmt(materialRate, 4)}/m²`)
              : "no consumption recipe for this line — enter if chemicals will be used")}
        </label>
      </div>

      {showObservedNotes && (
        <label className="block text-sm"><span className="text-neutral-600">Observed on site</span>
          <input name="observed_notes" className="mt-1 w-full rounded border border-neutral-300 px-2 py-2" placeholder="e.g. heavy activity near kitchen drains" /></label>
      )}

      <div className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-4 py-3 text-sm flex flex-wrap gap-x-6">
        <span>Revenue <span className="font-semibold">AED {fmt(revenue)}</span></span>
        <span>Est. cost <span className="font-semibold">AED {fmt(cost)}</span></span>
        <span>Margin <span className={`font-semibold ${margin != null && tm != null && margin < tm * 100 ? "text-red-600" : margin != null ? "text-emerald-700" : ""}`}>{margin == null ? "—" : margin.toFixed(1) + "%"}</span>{tm != null && <span className="text-neutral-400"> (target {(tm * 100).toFixed(0)}%)</span>}</span>
      </div>
      <button className="w-full rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark sm:w-auto">{submitLabel}</button>
    </form>
  );
}
