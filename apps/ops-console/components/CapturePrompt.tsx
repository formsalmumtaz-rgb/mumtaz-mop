import Link from "next/link";
import type { RequiredFlag } from "@/lib/domain/customers";

// "This customer is missing: EMAIL, PHONE — capture now?" (§3.1)
//
// The master file recorded, per customer, what it could not tell us. 555 of the
// 599 live customers carry at least one such flag. This is how those records
// complete: the office is asked for exactly the missing fields the first time
// anyone opens the customer, and each answer clears its own flag. It is the
// alternative to a data-cleanup project nobody will run.
//
// Blank stays blank — a field left empty keeps its flag, because unknown is still
// unknown (Art. VII §5).
const EMIRATES = ["Abu Dhabi", "Dubai", "Sharjah", "Ajman", "Umm Al Quwain", "Ras Al Khaimah", "Fujairah"];
const ipt = "mt-1 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm";

function Field({ name, label, type = "text" }: { name: string; label: string; type?: string }) {
  return (
    <label className="text-sm">
      <span className="text-neutral-600">{label}</span>
      {name === "emirate" || name === "place_of_supply" ? (
        <select name={name} defaultValue="" className={ipt}>
          <option value="">—</option>{EMIRATES.map((e) => <option key={e}>{e}</option>)}
        </select>
      ) : (
        <input type={type} name={name} className={ipt} />
      )}
    </label>
  );
}

const LABELS: Record<string, string> = {
  contact_email: "Email", contact_phone: "Phone", contact_mobile: "Mobile",
  trn: "TRN (15 digits, starts 1)", site_address: "Address",
  emirate: "Emirate", place_of_supply: "Place of supply (VAT)", trade_name: "Customer name",
};

export function CapturePrompt({ customerId, flags, action }: {
  customerId: string; flags: RequiredFlag[]; action: (fd: FormData) => Promise<void>;
}) {
  if (!flags.length) return null;
  const answerable = flags.filter((f) => f.fields.length);
  const questions = flags.filter((f) => !f.fields.length);
  const fields = [...new Set(answerable.flatMap((f) => f.fields))];

  return (
    <section className="rounded-lg border border-amber-300 bg-amber-50/60 p-5">
      <h2 className="font-medium text-amber-900">
        This customer is missing: {flags.map((f) => f.label).join(", ")}
      </h2>
      <p className="mt-1 text-sm text-amber-800">
        Captured from the old system, which did not have these. Fill in what you know —
        anything left blank stays flagged.
      </p>

      {answerable.length > 0 && (
        <form action={action} className="mt-4 space-y-3">
          <input type="hidden" name="id" value={customerId} />
          {answerable.map((f) => (
            <div key={f.token}>
              <input type="hidden" name="answered_token" value={f.token} />
              <input type="hidden" name={`fields_for:${f.token}`} value={f.fields.join(",")} />
            </div>
          ))}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {fields.map((n) => (
              <Field key={n} name={n} label={LABELS[n] ?? n}
                     type={n === "contact_email" ? "email" : "text"} />
            ))}
            {fields.some((f) => f.startsWith("contact_")) && (
              <Field name="contact_person" label="Contact person" />
            )}
          </div>
          <button className="rounded bg-amber-700 px-4 py-2 text-sm font-medium text-white hover:bg-amber-800">
            Save what I know
          </button>
        </form>
      )}

      {questions.length > 0 && (
        <div className="mt-4 rounded border border-amber-300 bg-white/70 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-amber-800">Needs a decision</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-neutral-800">
            {questions.map((q) => <li key={q.token}>{q.label}</li>)}
          </ul>
        </div>
      )}

      {flags.some((f) => /LOCATION_PIN/i.test(f.token)) && (
        <p className="mt-3 text-sm text-amber-800">
          The map pin is captured at the door by the technician, or set it on a site below.{" "}
          <Link href="#sites" className="underline">Go to sites</Link>
        </p>
      )}
    </section>
  );
}
