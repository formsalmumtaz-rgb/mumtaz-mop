"use client";
import { useMemo, useState } from "react";

interface Initial {
  basic_salary?: string | null;
  accommodation_monthly?: string | null;
  transport_allowance_monthly?: string | null;
  medical_insurance_annual?: string | null;
  air_ticket_annual?: string | null;
  visa_cost?: string | null;
  emirates_id_cost?: string | null;
  visa_eid_amortisation_months?: number | null;
  gratuity_days_per_year?: string | null;
  productive_hours_month?: string | null;
}

const num = (v: string) => {
  const x = Number((v ?? "").trim());
  return Number.isFinite(x) ? x : 0;
};

// Live fully-loaded hourly cost — identical formula to the DB generated columns
// (mig 019): monthly = basic + accommodation + transport + medical/12 +
// air_ticket/12 + (basic/30*gratuity_days)/12 + (visa+eid)/amort; hourly = /hours.
export function EmployeeCostForm({
  action, technicianId, initial,
}: {
  action: (fd: FormData) => Promise<void>;
  technicianId: string;
  initial: Initial;
}) {
  const [f, setF] = useState({
    basic_salary: initial.basic_salary ?? "",
    accommodation_monthly: initial.accommodation_monthly ?? "",
    transport_allowance_monthly: initial.transport_allowance_monthly ?? "",
    medical_insurance_annual: initial.medical_insurance_annual ?? "",
    air_ticket_annual: initial.air_ticket_annual ?? "",
    visa_cost: initial.visa_cost ?? "",
    emirates_id_cost: initial.emirates_id_cost ?? "",
    visa_eid_amortisation_months: String(initial.visa_eid_amortisation_months ?? 24),
    gratuity_days_per_year: initial.gratuity_days_per_year ?? "21",
    productive_hours_month: initial.productive_hours_month ?? "176",
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const derived = useMemo(() => {
    const basic = num(f.basic_salary);
    const amort = num(f.visa_eid_amortisation_months) || 24;
    const hours = num(f.productive_hours_month) || 176;
    const monthly =
      basic +
      num(f.accommodation_monthly) +
      num(f.transport_allowance_monthly) +
      num(f.medical_insurance_annual) / 12 +
      num(f.air_ticket_annual) / 12 +
      (basic / 30 * num(f.gratuity_days_per_year)) / 12 +
      (num(f.visa_cost) + num(f.emirates_id_cost)) / amort;
    return { monthly, hourly: monthly / hours };
  }, [f]);

  const field = (name: keyof typeof f, label: string, hint?: string) => (
    <label className="text-sm">
      <span className="text-neutral-600">{label}{hint ? <span className="text-neutral-400"> {hint}</span> : null}</span>
      <input name={name} type="number" min="0" step="any" value={f[name]} onChange={set(name)}
             className="mt-1 w-full rounded border border-neutral-300 px-2 py-2" />
    </label>
  );

  return (
    <form action={action} className="mt-3 space-y-4">
      <input type="hidden" name="technician_id" value={technicianId} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {field("basic_salary", "Basic salary", "(monthly)")}
        {field("accommodation_monthly", "Accommodation", "(monthly)")}
        {field("transport_allowance_monthly", "Transport", "(monthly)")}
        {field("medical_insurance_annual", "Medical insurance", "(annual)")}
        {field("air_ticket_annual", "Air ticket", "(annual)")}
        {field("visa_cost", "Visa cost", "(one-off)")}
        {field("emirates_id_cost", "Emirates ID", "(one-off)")}
        {field("visa_eid_amortisation_months", "Visa/EID amortise", "(months)")}
        {field("gratuity_days_per_year", "Gratuity", "(days/yr)")}
        {field("productive_hours_month", "Productive hours", "(per month)")}
      </div>
      <div className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-4 py-3 text-sm">
        Fully-loaded cost:{" "}
        <span className="font-semibold text-neutral-900">
          AED {derived.monthly.toLocaleString(undefined, { maximumFractionDigits: 2 })}/mo
        </span>{" · "}
        <span className="font-semibold text-brand">
          AED {derived.hourly.toLocaleString(undefined, { maximumFractionDigits: 4 })}/hr
        </span>
        <span className="text-neutral-500"> (at {num(f.productive_hours_month) || 176} productive hrs/mo)</span>
      </div>
      <button className="w-full rounded bg-neutral-800 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 sm:w-auto">
        Save (new version)
      </button>
    </form>
  );
}
