import { useEffect, useState } from "react";
import { authedFetch } from "./auth";
import { uuid } from "./db";

// §3.7 supervisor — closing the day. Van back, fuel, anything that went wrong,
// and then putting your name to it.
//
// The confirmation is deliberately NOT a tick labelled "OK". The sentence is
// spelled out, the button repeats it, and the exact wording is sent with the
// confirmation so it is provable later what was agreed to — the app's wording
// will change, what somebody signed must not.
const STATEMENT =
  "I confirm the jobs, hours, stock and fuel recorded today are true and complete to the best of my knowledge.";
const BANDS = [
  { v: 0, label: "Empty!", danger: true }, { v: 10, label: "under 10%" },
  { v: 20, label: "under 20%" }, { v: 40, label: "under 40%" },
  { v: 60, label: "under 60%" }, { v: 80, label: "under 80%" },
  { v: 99, label: "nearly full" }, { v: 100, label: "FULL" },
];

export function CloseDay({ base, onBack }: { base: string; onBack: () => void }) {
  const [today, setToday] = useState<{ accountability_confirmed: boolean; odo_out: number | null;
                                       odometer_km: number | null; confirmed_at: string | null } | null>(null);
  const [odo, setOdo] = useState("");
  const [band, setBand] = useState<number | null>(null);
  const [incidents, setIncidents] = useState("");
  const [allowed, setAllowed] = useState(true);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const load = async () => {
    try {
      const r = await authedFetch(`${base}/api/field/postflight`);
      if (r.ok) {
        const d = await r.json();
        setToday(d.today); setAllowed(!!d.is_team_lead);
        if (d.today?.accountability_confirmed) setDone(true);
        if (d.today?.odometer_km != null) setOdo(String(d.today.odometer_km));
      }
    } catch { /* offline: the screen still works, the save queues */ }
  };
  useEffect(() => { void load(); }, []);

  const save = async (confirm: boolean) => {
    setBusy(true);
    const body = {
      client_uuid: uuid(), device_time: new Date().toISOString(),
      odometer_km: odo ? Number(odo) : null, fuel_band: band, incidents: incidents.trim() || null,
      accountability_confirmed: confirm,
      accountability_statement: confirm ? STATEMENT : null,
    };
    try {
      const r = await authedFetch(`${base}/api/field/postflight`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(await r.text());
      if (confirm) setDone(true); else await load();
    } catch { /* queued by the outbox on the next sync attempt */ }
    setBusy(false);
  };

  if (!allowed) return (
    <div>
      <div className="card"><h3>Your supervisor closes the day</h3>
        <p className="muted">Only the team lead records the van back and confirms the day&rsquo;s figures.</p></div>
    </div>
  );

  if (done) return (
    <div>
      <div className="celebrate">
        <div className="big">🔒</div>
        <h3>Day closed</h3>
        <div>You confirmed today&rsquo;s figures. Thank you.</div>
      </div>
      <p className="muted" style={{ fontSize: ".8rem", marginTop: ".8rem" }}>&ldquo;{STATEMENT}&rdquo;</p>
      <button className="ghost" onClick={onBack} style={{ marginTop: ".6rem" }}>Back</button>
    </div>
  );

  const km = today?.odo_out != null && odo ? Number(odo) - today.odo_out : null;

  return (
    <div>
      <div className="day-hero"><h2>Closing the day</h2><div className="sub">Van back, then confirm</div></div>

      <div className="card">
        <h3>Odometer now</h3>
        <input inputMode="numeric" value={odo} onChange={(e) => setOdo(e.target.value.replace(/[^0-9]/g, ""))}
               placeholder={today?.odo_out != null ? `Out at ${today.odo_out}` : "km on the clock"} />
        {km != null && km >= 0 && <p className="muted" style={{ marginTop: ".4rem" }}>{km} km driven today</p>}
        {km != null && km < 0 && <p style={{ color: "var(--warn)", marginTop: ".4rem" }}>That is lower than this morning — check the reading.</p>}
      </div>

      <div className="card">
        <h3>Fuel now</h3>
        <div className="chips">
          {BANDS.map((b) => (
            <button key={b.v} className={`chip${b.danger ? " danger" : ""}`} aria-pressed={band === b.v}
                    onClick={() => setBand(b.v)}>{b.label}</button>
          ))}
        </div>
      </div>

      <div className="card">
        <h3>Anything go wrong?</h3>
        <textarea rows={3} value={incidents} onChange={(e) => setIncidents(e.target.value)}
          placeholder="Leave empty if the day was normal"
          style={{ width: "100%", padding: ".7rem", borderRadius: ".7rem", border: "1px solid #d4d4d4", fontSize: "1rem" }} />
      </div>

      <div className="card" style={{ borderColor: "var(--warn)", background: "var(--warn-bg)" }}>
        <h3>Confirm the day</h3>
        <p style={{ fontSize: ".95rem", marginBottom: ".7rem" }}>&ldquo;{STATEMENT}&rdquo;</p>
        <button className="big-btn" disabled={busy} onClick={() => save(true)}>
          ✓ I confirm this is true
        </button>
        <button className="ghost" disabled={busy} onClick={() => save(false)} style={{ marginTop: ".5rem" }}>
          Save without confirming yet
        </button>
      </div>
    </div>
  );
}
