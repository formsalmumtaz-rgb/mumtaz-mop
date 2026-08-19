"use client";
import { useState } from "react";

// The customer registration question set (Run 8 item 1). These fields ARE the
// columns of the master import — one vocabulary for typing a customer in and for
// loading a thousand, so a record created by hand and a record imported are the
// same shape.
//
// Grouped rather than one long column: identity, contact, service preferences,
// commercial, then the first site. Everything except the trade name is optional —
// blank stays blank (Art. VI), and REQUIRED_INFO drives the capture prompt later.
const EMIRATES = ["Sharjah", "Dubai", "Ajman", "Abu Dhabi", "Umm Al Quwain", "Ras Al Khaimah", "Fujairah"];

export interface RefItem { id: string; name: string | null }

export function NewCustomerForm({ action, facilityTypes, industries = [], municipalityCategories = [] }: {
  action: (fd: FormData) => Promise<void>;
  facilityTypes: RefItem[];
  industries?: RefItem[];
  municipalityCategories?: RefItem[];
}) {
  const [sameName, setSameName] = useState(true);
  const [trade, setTrade] = useState("");
  const [sameWhatsapp, setSameWhatsapp] = useState(true);
  const [mobile, setMobile] = useState("");

  const ipt = "mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15";
  const lbl = "text-xs font-medium text-muted";
  const Section = ({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) => (
    <fieldset className="sm:col-span-2 rounded-xl border border-line bg-surface p-4">
      <legend className="px-1.5 text-[11px] font-semibold uppercase tracking-wider text-brand">{title}</legend>
      {hint && <p className="mb-3 text-xs text-muted">{hint}</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">{children}</div>
    </fieldset>
  );

  return (
    <form action={action} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Section title="Identity">
        <label className="text-sm sm:col-span-2"><span className={lbl}>Trade name *</span>
          <input name="trade_name" required value={trade} onChange={(e) => setTrade(e.target.value)} className={ipt} /></label>
        <label className="text-sm"><span className={lbl}>Also known as (alias)</span>
          <input name="alias_name" className={ipt} placeholder="the name staff actually use" /></label>

        <div className="text-sm sm:col-span-2">
          <span className={lbl}>Legal name <span className="text-amber-600">(needed for tax invoices)</span></span>
          {sameName
            ? <input name="legal_name" value={trade} readOnly className={`${ipt} bg-neutral-50 text-muted`} />
            : <input name="legal_name" className={ipt} />}
          <label className="mt-1.5 flex items-center gap-2 text-xs text-muted">
            <input type="checkbox" checked={sameName} onChange={(e) => setSameName(e.target.checked)} />
            Same as trade name
          </label>
        </div>
        <label className="text-sm"><span className={lbl}>Customer type</span>
          <select name="customer_type" defaultValue="B2B" className={ipt}>
            <option value="B2B">B2B (company)</option>
            <option value="B2C">B2C (individual)</option>
            <option value="B2G">B2G (government)</option>
          </select></label>

        <label className="text-sm"><span className={lbl}>TRN</span>
          <input name="trn" className={ipt} placeholder="15 digits, starts 1" /></label>
        <label className="text-sm"><span className={lbl}>Trade licence no.</span>
          <input name="trade_licence_no" className={ipt} /></label>
        <label className="text-sm"><span className={lbl}>Trade licence expiry</span>
          <input type="date" name="tl_expiry" className={ipt} />
          <span className="mt-0.5 block text-[11px] text-muted">Adds it to the expiry reminders.</span></label>

        <label className="text-sm"><span className={lbl}>Industry</span>
          <select name="industry_category_id" defaultValue="" className={ipt}>
            <option value="">—</option>
            {industries.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select></label>
        <label className="text-sm sm:col-span-2"><span className={lbl}>Municipality category</span>
          <select name="municipality_category_id" defaultValue="" className={ipt}>
            <option value="">—</option>
            {municipalityCategories.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <span className="mt-0.5 block text-[11px] text-muted">Drives the required visit frequency and the contract clauses.</span></label>
      </Section>

      <Section title="Contact">
        <label className="text-sm"><span className={lbl}>Contact person</span>
          <input name="contact_person" className={ipt} /></label>
        <label className="text-sm"><span className={lbl}>Designation</span>
          <input name="contact_designation" className={ipt} placeholder="Manager, Owner…" /></label>
        <label className="text-sm"><span className={lbl}>Email</span>
          <input type="email" name="contact_email" className={ipt} /></label>
        <label className="text-sm"><span className={lbl}>Phone (landline)</span>
          <input name="contact_phone" className={ipt} /></label>
        <label className="text-sm"><span className={lbl}>Mobile</span>
          <input name="contact_mobile" value={mobile} onChange={(e) => setMobile(e.target.value)} className={ipt} /></label>
        <div className="text-sm">
          <span className={lbl}>WhatsApp</span>
          {sameWhatsapp
            ? <input name="whatsapp" value={mobile} readOnly className={`${ipt} bg-neutral-50 text-muted`} />
            : <input name="whatsapp" className={ipt} />}
          <label className="mt-1.5 flex items-center gap-2 text-xs text-muted">
            <input type="checkbox" checked={sameWhatsapp} onChange={(e) => setSameWhatsapp(e.target.checked)} />
            Same as mobile
          </label>
        </div>
      </Section>

      <Section title="Service preferences" hint="Night work is scheduled AFTER the outlet closes — each site keeps its own closing time.">
        <label className="text-sm"><span className={lbl}>Night shift service?</span>
          <select name="night_shift_service" defaultValue="" className={ipt}>
            <option value="">—</option>
            <option value="yes">Yes — service after closing</option>
            <option value="no">No — day service</option>
          </select>
          <span className="mt-0.5 block text-[11px] text-muted">Restaurants and food outlets are usually night.</span></label>
        <label className="text-sm"><span className={lbl}>Outlet closing time</span>
          <input type="time" name="closing_time" className={ipt} />
          <span className="mt-0.5 block text-[11px] text-muted">The visit is sequenced after this time.</span></label>
        <label className="text-sm"><span className={lbl}>Preferred shift</span>
          <select name="preferred_shift" defaultValue="" className={ipt}>
            <option value="">—</option>
            <option value="day">Day</option>
            <option value="night">Night</option>
          </select>
          <span className="mt-0.5 block text-[11px] text-muted">Restaurants are usually night.</span></label>
        <label className="text-sm"><span className={lbl}>Preferred language</span>
          <select name="preferred_language" defaultValue="" className={ipt}>
            <option value="">—</option>
            <option value="EN">English</option>
            <option value="AR">العربية</option>
          </select></label>
        <label className="text-sm"><span className={lbl}>Priority</span>
          <select name="priority" defaultValue="" className={ipt}>
            <option value="">—</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select></label>
        <label className="text-sm sm:col-span-3"><span className={lbl}>Access notes</span>
          <textarea name="access_notes" rows={2} className={ipt}
            placeholder="Gate code, who to ask for, where to park, when NOT to come" />
          <span className="mt-0.5 block text-[11px] text-muted">Shown to the technician on the job card.</span></label>
      </Section>

      <Section title="Commercial">
        <label className="text-sm"><span className={lbl}>Payment terms</span>
          <select name="payment_terms" defaultValue="" className={ipt}>
            <option value="">—</option>
            <option value="cash_on_service">Cash on service</option>
            <option value="net_15">Net 15 days</option>
            <option value="net_30">Net 30 days</option>
          </select></label>
        <label className="text-sm"><span className={lbl}>Billing frequency</span>
          <select name="billing_frequency" defaultValue="" className={ipt}>
            <option value="">—</option>
            <option value="per_visit">Per visit</option>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="annual">Annual</option>
          </select></label>
        <label className="text-sm"><span className={lbl}>Referred by</span>
          <input name="referred_by" className={ipt} /></label>
      </Section>

      <Section title="Location" hint="Place of supply is the VAT field — it can differ from the postal emirate.">
        <label className="text-sm"><span className={lbl}>Emirate</span>
          <select name="emirate" defaultValue="Sharjah" className={ipt}>
            {EMIRATES.map((e) => <option key={e} value={e}>{e}</option>)}
          </select></label>
        <label className="text-sm"><span className={lbl}>Place of supply (VAT)</span>
          <select name="place_of_supply" defaultValue="Sharjah" className={ipt}>
            {EMIRATES.map((e) => <option key={e} value={e}>{e}</option>)}
          </select></label>
        <label className="text-sm"><span className={lbl}>District / area</span>
          <input name="district" className={ipt} /></label>
        <label className="text-sm sm:col-span-2"><span className={lbl}>Site address</span>
          <input name="site_address" placeholder="e.g. Shop 4, Al Wahda Street, Al Manakh" className={ipt} />
          <span className="mt-0.5 block text-[11px] text-muted">The map pin is looked up from this address automatically.</span></label>
        <label className="text-sm"><span className={lbl}>PO Box</span>
          <input name="po_box" className={ipt} /></label>
        <label className="text-sm sm:col-span-3"><span className={lbl}>Premises type</span>
          <select name="site_facility_type_id" defaultValue="" className={ipt}>
            <option value="">—</option>
            {facilityTypes.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <span className="mt-0.5 block text-[11px] text-muted">Drives the municipality visit-frequency rules.</span></label>
      </Section>

      <div className="sm:col-span-2">
        <button className="rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-brand-dark active:scale-[0.98]">
          Create customer
        </button>
      </div>
    </form>
  );
}
