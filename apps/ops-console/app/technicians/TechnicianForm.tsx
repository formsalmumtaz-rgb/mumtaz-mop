import { Field, Input, Button } from "@/components/ui";

interface Initial {
  id?: string;
  code?: string | null;
  full_name?: string | null;
  phone?: string | null;
  employee_ref?: string | null;
}

// Add / edit form for a technician. The same form drives create and update via
// the injected server action.
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
        <Field label="Code"><Input name="code" defaultValue={initial?.code ?? ""} placeholder="e.g. TECH-01" /></Field>
        <Field label="Full name"><Input name="full_name" defaultValue={initial?.full_name ?? ""} placeholder="Real name" /></Field>
        <Field label="Phone"><Input name="phone" defaultValue={initial?.phone ?? ""} /></Field>
        <Field label="Employee ref"><Input name="employee_ref" defaultValue={initial?.employee_ref ?? ""} placeholder="HR / payroll ref" /></Field>
      </div>
      <Button type="submit">{submitLabel}</Button>
      {initial?.id && <p className="text-xs text-neutral-500">Entering a real name clears the ASSUMED flag. Every change is audit-logged.</p>}
    </form>
  );
}
