import { Field, Input, Select, Button } from "@/components/ui";
import { PROPERTY_TYPES, type ServiceCategory } from "@/lib/domain/categories";

type PM = { id: string; name: string };

// Add / edit form for a service category. Same form drives create and update.
export function CategoryForm({ action, pricingModels, initial, submitLabel }: {
  action: (fd: FormData) => Promise<void>;
  pricingModels: PM[];
  initial?: ServiceCategory;
  submitLabel: string;
}) {
  return (
    <form action={action} className="mt-3 space-y-4">
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Code"><Input name="code" defaultValue={initial?.code ?? ""} placeholder="e.g. res_2bhk" required /></Field>
        <Field label="Name"><Input name="name" defaultValue={initial?.name ?? ""} placeholder="e.g. 2 BHK" required /></Field>
        <Field label="Property type">
          <Select name="property_type" defaultValue={initial?.property_type ?? ""}>
            <option value="">—</option>
            {PROPERTY_TYPES.map((p) => <option key={p} value={p} className="capitalize">{p}</option>)}
          </Select>
        </Field>
      </div>

      <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Operational assumptions (deterministic)</div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Crew size"><Input name="crew_size" type="number" min="1" step="1" defaultValue={initial?.crew_size ?? 1} /></Field>
          <Field label="Duration (hrs)"><Input name="est_duration_hours" type="number" min="0" step="any" defaultValue={initial?.est_duration_hours ?? ""} /></Field>
          <Field label="Buffer (min)"><Input name="buffer_minutes" type="number" min="0" step="1" defaultValue={initial?.buffer_minutes ?? 0} /></Field>
          <Field label="Material cost (AED)"><Input name="est_material_cost" type="number" min="0" step="any" defaultValue={initial?.est_material_cost ?? ""} /></Field>
        </div>
        <p className="mt-2 text-xs text-neutral-500">Labour person-hours = crew × duration; these feed the deterministic estimate cost (fn_estimate_cost). No AI.</p>
      </div>

      <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Pricing recommendation</div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Pricing model">
            <Select name="default_pricing_model_id" defaultValue={initial?.default_pricing_model_id ?? ""}>
              <option value="">—</option>
              {pricingModels.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <Field label="Measure"><Input name="default_measure" type="number" min="0" step="any" defaultValue={initial?.default_measure ?? 1} /></Field>
          <Field label="Unit price (AED)"><Input name="default_unit_price" type="number" min="0" step="any" defaultValue={initial?.default_unit_price ?? ""} /></Field>
          <Field label="Recommended price (AED)"><Input name="recommended_price" type="number" min="0" step="any" defaultValue={initial?.recommended_price ?? ""} /></Field>
        </div>
      </div>

      <Field label="Notes"><Input name="notes" defaultValue={initial?.notes ?? ""} placeholder="Optional guidance for surveyors" /></Field>
      <Button type="submit">{submitLabel}</Button>
      {initial && <p className="text-xs text-neutral-500">Saving clears the ASSUMED flag. Estimates already created keep their snapshotted figures. Every change is audit-logged.</p>}
    </form>
  );
}
