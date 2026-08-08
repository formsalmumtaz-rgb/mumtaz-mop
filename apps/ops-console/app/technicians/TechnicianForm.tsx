interface Initial {
  id?: string;
  code?: string | null;
  full_name?: string | null;
  phone?: string | null;
  employee_ref?: string | null;
}

// Add / edit form for a technician. Server component (no client state needed);
// the same form drives create and update via the injected server action.
export function TechnicianForm({
  action, initial, submitLabel,
}: {
  action: (fd: FormData) => Promise<void>;
  initial?: Initial;
  submitLabel: string;
}) {
  return (
    <form action={action} className="mt-3 space-y-4">
      {initial?.id && <input type="hidden" name="id" value={initial.id} />}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="text-neutral-600">Code</span>
          <input name="code" defaultValue={initial?.code ?? ""} placeholder="e.g. TECH-01"
                 className="mt-1 w-full rounded border border-neutral-300 px-2 py-2" />
        </label>
        <label className="text-sm">
          <span className="text-neutral-600">Full name</span>
          <input name="full_name" defaultValue={initial?.full_name ?? ""} placeholder="Real name"
                 className="mt-1 w-full rounded border border-neutral-300 px-2 py-2" />
        </label>
        <label className="text-sm">
          <span className="text-neutral-600">Phone</span>
          <input name="phone" defaultValue={initial?.phone ?? ""} className="mt-1 w-full rounded border border-neutral-300 px-2 py-2" />
        </label>
        <label className="text-sm">
          <span className="text-neutral-600">Employee ref</span>
          <input name="employee_ref" defaultValue={initial?.employee_ref ?? ""} placeholder="HR / payroll ref"
                 className="mt-1 w-full rounded border border-neutral-300 px-2 py-2" />
        </label>
      </div>
      <button className="w-full rounded bg-brand px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-dark sm:w-auto">{submitLabel}</button>
      {initial?.id && <p className="text-xs text-neutral-500">Entering a real name clears the ASSUMED flag. Every change is audit-logged.</p>}
    </form>
  );
}
