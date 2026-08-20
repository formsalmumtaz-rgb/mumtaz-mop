import { useEffect, useState } from "react";
import { authedFetch } from "./auth";
import { db, uuid, savePostflightLocal, getLocalPostflight } from "./db";

// §3.7 supervisor — closing the day, in the order the owner asked for it:
//   1. the van back      — odometer, fuel
//   2. EQUIPMENT CHECK   — what went out, ticked back in
//   3. CHEMICAL CHECK    — counted back, against what should be left
//   4. TODAY'S SUMMARY   — jobs, hours, cash, chemical, all counted for them
//   5. CONFIRMATION      — the sentence spelled out, then sign out
//
// The confirmation is deliberately NOT a tick labelled "OK". The sentence is
// spelled out, the button repeats it, and the exact wording travels with the
// confirmation, so it is provable later what was agreed to — the app's wording
// will change; what somebody signed must not. The server issues that wording
// and rejects a confirmation carrying any other.
const BANDS = [
  { v: 0, label: "Empty!", danger: true }, { v: 10, label: "under 10%" },
  { v: 20, label: "under 20%" }, { v: 40, label: "under 40%" },
  { v: 60, label: "under 60%" }, { v: 80, label: "under 80%" },
  { v: 99, label: "nearly full" }, { v: 100, label: "FULL" },
];

interface EquipItem { code: string; label: string; taken_out: boolean; already_back: boolean }
interface StockLine {
  item_id: string; product: string; unit: string;
  opened_with: number; recorded_used: number; should_have_left: number; counted_back: number | null;
}
interface Summary {
  jobs_assigned: number; jobs_completed: number; jobs_not_done: number;
  time_in: string | null; time_out: string | null; hours_so_far: number | null;
  cash_collected: number; expenses_logged: number; chemical_products_used: number;
}
interface Today {
  accountability_confirmed: boolean; odo_out: number | null;
  odometer_km: number | null; fuel_band: number | null; incidents: string | null;
  confirmed_at: string | null;
}

const n1 = (x: number) => Math.round(x * 10) / 10;

export function CloseDay({ base, onBack }: { base: string; onBack: () => void }) {
  const [today, setToday] = useState<Today | null>(null);
  const [equipment, setEquipment] = useState<EquipItem[]>([]);
  const [back, setBack] = useState<Record<string, boolean>>({});
  const [stock, setStock] = useState<StockLine[]>([]);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [summary, setSummary] = useState<Summary | null>(null);
  const [statement, setStatement] = useState("");
  const [odo, setOdo] = useState("");
  const [band, setBand] = useState<number | null>(null);
  const [incidents, setIncidents] = useState("");
  const [allowed, setAllowed] = useState(true);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");
  const [offline, setOffline] = useState(false);
  const [queued, setQueued] = useState(false);

  type Payload = {
    today: Today | null; equipment: EquipItem[]; stock: StockLine[];
    summary: Summary | null; is_team_lead: boolean; statement: string;
  };

  const apply = (d: Payload) => {
    setToday(d.today); setAllowed(!!d.is_team_lead); setStatement(d.statement ?? "");
    setEquipment(d.equipment ?? []); setStock(d.stock ?? []); setSummary(d.summary ?? null);
    if (d.today?.accountability_confirmed) setDone(true);
    if (d.today?.odometer_km != null) setOdo(String(d.today.odometer_km));
    if (d.today?.fuel_band != null) setBand(d.today.fuel_band);
    if (d.today?.incidents) setIncidents(d.today.incidents);
    // Anything already ticked back, or already counted, comes back pre-filled —
    // a supervisor interrupted halfway never counts the van twice.
    setBack((v) => (Object.keys(v).length ? v
      : Object.fromEntries((d.equipment ?? []).filter((e) => e.already_back).map((e) => [e.code, true]))));
    setCounts((v) => (Object.keys(v).length ? v
      : Object.fromEntries((d.stock ?? []).filter((s) => s.counted_back != null)
          .map((s) => [s.item_id, String(s.counted_back)]))));
  };

  // The van comes back to a yard at the end of a shift, which is where the
  // signal is worst. Everything this screen needs is cached on the way in, and
  // the close itself queues (Art. III P1) — a day is never lost to a dead bar.
  const load = async () => {
    try {
      const r = await authedFetch(`${base}/api/field/postflight`);
      if (r.ok) {
        const d = (await r.json()) as Payload;
        await db.meta.put({ key: "closeDay", value: d });
        apply(d);
        setOffline(false);
      }
    } catch { /* fall through to the cache */ }
    const cached = (await db.meta.get("closeDay"))?.value as Payload | undefined;
    if (cached) { apply(cached); setOffline(true); }
    // and anything already entered on this phone but not yet sent
    const local = await getLocalPostflight();
    if (local?.payload) {
      const q = local.payload as Record<string, unknown>;
      if (q.odometer_km != null) setOdo(String(q.odometer_km));
      if (q.fuel_band != null) setBand(Number(q.fuel_band));
      if (q.incidents) setIncidents(String(q.incidents));
      if (q.equipment) setBack((v) => (Object.keys(v).length ? v : q.equipment as Record<string, boolean>));
      const lines = q.stock_counted as { item_id: string; qty: number }[] | undefined;
      if (lines?.length) setCounts((v) => (Object.keys(v).length ? v
        : Object.fromEntries(lines.map((l) => [l.item_id, String(l.qty)]))));
      if (q.accountability_confirmed === true) { setDone(true); setQueued(true); }
    }
  };
  useEffect(() => { void load(); }, []);

  const save = async (confirm: boolean) => {
    setBusy(true); setErr("");
    const body = {
      client_uuid: uuid(), device_time: new Date().toISOString(),
      odometer_km: odo ? Number(odo) : null, fuel_band: band, incidents: incidents.trim() || null,
      equipment: Object.fromEntries(equipment.map((e) => [e.code, !!back[e.code]])),
      stock_counted: stock
        .filter((s) => counts[s.item_id] !== undefined && counts[s.item_id] !== "")
        .map((s) => ({ item_id: s.item_id, qty: Number(counts[s.item_id]) })),
      accountability_confirmed: confirm,
      accountability_statement: confirm ? statement : null,
    };
    // Local first, always. The queue is the record; the network is an optimisation.
    await savePostflightLocal(body);
    try {
      const r = await authedFetch(`${base}/api/field/postflight`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error((await r.text()).slice(0, 160));
      await db.postflight.update(new Date().toISOString().slice(0, 10), { synced: 1 });
      if (confirm) { setDone(true); setQueued(false); }
      else { await load(); setErr("Saved. Nothing is confirmed yet."); }
    } catch (e) {
      // Queued, not lost. The day still closes on the phone; the office sees it
      // the moment there is signal.
      if (confirm) { setDone(true); setQueued(true); }
      else setErr(`Saved on this phone. It will reach the office when there is signal. (${(e as Error).message.slice(0, 90)})`);
    }
    setBusy(false);
  };

  if (!allowed) return (
    <div className="card"><h3>Your supervisor closes the day</h3>
      <p className="muted">Only the team lead checks the van back in and confirms the day&rsquo;s figures.</p>
      <button className="ghost" onClick={onBack} style={{ marginTop: ".6rem" }}>Back</button>
    </div>
  );

  if (done) return (
    <div>
      <div className="celebrate">
        <div className="big">🔒</div>
        <h3>Day closed</h3>
        <div>Equipment and chemicals checked in, figures confirmed, and you are signed out. Thank you.</div>
        {queued && <div style={{ fontSize: ".85rem", marginTop: ".5rem", fontWeight: 400 }}>
          Saved on this phone — it reaches the office at the next sync.
        </div>}
      </div>
      <p className="muted" style={{ fontSize: ".8rem", marginTop: ".8rem" }}>&ldquo;{statement}&rdquo;</p>
      <button className="ghost" onClick={onBack} style={{ marginTop: ".6rem" }}>Back</button>
    </div>
  );

  const km = today?.odo_out != null && odo ? Number(odo) - today.odo_out : null;
  const missingKit = equipment.filter((e) => e.taken_out && !back[e.code]);
  const counted = stock.filter((s) => counts[s.item_id] !== undefined && counts[s.item_id] !== "");
  const canConfirm = !!statement && !busy;

  return (
    <div>
      <div className="day-hero"><h2>Closing the day</h2><div className="sub">Van back, kit and chemicals checked in, then confirm</div></div>

      {offline && (
        <div className="card" style={{ borderColor: "var(--warn)", background: "var(--warn-bg)" }}>
          <b>No signal — working from what this phone last loaded.</b>
          <p className="muted" style={{ margin: ".3rem 0 0", fontSize: ".82rem" }}>
            You can still count everything in and confirm. It is saved here and sent when you have a connection.
          </p>
        </div>
      )}

      {/* ── 1. the van ────────────────────────────────────────────── */}
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

      {/* ── 2. EQUIPMENT CHECK ────────────────────────────────────── */}
      <div className="card">
        <h3>Equipment back on the van</h3>
        <p className="muted" style={{ marginTop: 0, fontSize: ".8rem" }}>
          Tap each one you have. What went out this morning is marked. Anything missing is recorded — it does not stop you closing.
        </p>
        {equipment.length === 0 && <p className="muted">Equipment list loads when online.</p>}
        {equipment.map((e) => (
          <button key={e.code} type="button" className="tick" aria-pressed={!!back[e.code]}
                  onClick={() => setBack((all) => ({ ...all, [e.code]: !all[e.code] }))}>
            <span className="box">{back[e.code] ? "✓" : ""}</span>
            <span style={{ flex: 1, textAlign: "left" }}>
              {e.label}
              {e.taken_out && <span className="muted" style={{ display: "block", fontSize: ".76rem", fontWeight: 400 }}>went out this morning</span>}
            </span>
          </button>
        ))}
        {missingKit.length > 0 && (
          <p style={{ color: "var(--warn)", fontSize: ".85rem", marginTop: ".5rem" }}>
            {missingKit.length} item{missingKit.length === 1 ? "" : "s"} went out and {missingKit.length === 1 ? "is" : "are"} not back:
            {" "}{missingKit.map((e) => e.label).join(", ")}. Say so in the notes below.
          </p>
        )}
      </div>

      {/* ── 3. CHEMICAL CHECK ─────────────────────────────────────── */}
      <div className="card">
        <h3>Chemicals back on the van</h3>
        <p className="muted" style={{ marginTop: 0, fontSize: ".8rem" }}>
          Count what is left. The system works out what it expects — you only enter what you see.
        </p>
        {stock.length === 0 && <p className="muted">Nothing was declared on this van this morning, so there is nothing to count back.</p>}
        {stock.map((s) => {
          const v = counts[s.item_id];
          const gap = v !== undefined && v !== "" ? n1(Number(v) - s.should_have_left) : null;
          return (
            <div key={s.item_id} style={{ padding: ".55rem 0", borderBottom: "1px solid #f0ece6" }}>
              <div className="row" style={{ justifyContent: "space-between", gap: ".6rem", alignItems: "flex-start" }}>
                <span style={{ flex: 1 }}>
                  <b>{s.product}</b>
                  <span className="muted" style={{ display: "block", fontSize: ".78rem" }}>
                    started {n1(s.opened_with)} {s.unit} · used {n1(s.recorded_used)} {s.unit} ·
                    {" "}should be <b>{n1(s.should_have_left)} {s.unit}</b>
                  </span>
                </span>
                <input type="number" inputMode="decimal" placeholder="count" value={v ?? ""}
                       onChange={(e) => setCounts((all) => ({ ...all, [s.item_id]: e.target.value }))}
                       style={{ width: "6.5rem", minHeight: 52, fontSize: "1.05rem" }} />
              </div>
              {gap !== null && gap !== 0 && (
                <div style={{ fontSize: ".8rem", marginTop: ".25rem", color: "var(--warn)" }}>
                  {gap > 0 ? `${gap} ${s.unit} more` : `${Math.abs(gap)} ${s.unit} less`} than expected — recorded for the office.
                </div>
              )}
              {gap === 0 && (
                <div style={{ fontSize: ".8rem", marginTop: ".25rem", color: "var(--ok)" }}>Adds up ✓</div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── 4. TODAY'S SUMMARY ────────────────────────────────────── */}
      <div className="card">
        <h3>Today</h3>
        {!summary && <p className="muted">Your figures load when online.</p>}
        {summary && (
          <>
            <div className="kpis" style={{ marginBottom: ".6rem" }}>
              <div className="kpi good"><div className="n">{summary.jobs_completed}</div><div className="l">jobs completed</div></div>
              <div className={`kpi${summary.jobs_not_done > 0 ? " warn" : ""}`}>
                <div className="n">{summary.jobs_not_done}</div><div className="l">delayed or cancelled</div>
              </div>
            </div>
            <ul className="muted" style={{ paddingLeft: "1.1rem", margin: 0, lineHeight: 1.7, fontSize: ".88rem" }}>
              <li>{summary.jobs_assigned} job{summary.jobs_assigned === 1 ? "" : "s"} were assigned to you today.</li>
              <li>
                {summary.time_in
                  ? summary.time_out
                    ? `On shift ${summary.time_in} → ${summary.time_out}.`
                    : `Started at ${summary.time_in}${summary.hours_so_far != null ? ` — ${summary.hours_so_far} hours so far.` : "."}`
                  : "No time in recorded today."}
              </li>
              <li>
                {summary.chemical_products_used === 0
                  ? "No chemical was recorded as used today."
                  : `${summary.chemical_products_used} chemical${summary.chemical_products_used === 1 ? "" : "s"} recorded as used across your jobs — the amounts are in the check above.`}
              </li>
              <li>AED {summary.cash_collected.toFixed(2)} collected in cash{summary.expenses_logged > 0 ? `, AED ${summary.expenses_logged.toFixed(2)} spent on expenses` : ""}.</li>
              <li>{counted.length} of {stock.length} chemical{stock.length === 1 ? "" : "s"} counted back, {equipment.filter((e) => back[e.code]).length} of {equipment.length} kit items ticked.</li>
            </ul>
          </>
        )}
      </div>

      <div className="card">
        <h3>Anything go wrong?</h3>
        <textarea rows={3} value={incidents} onChange={(e) => setIncidents(e.target.value)}
          placeholder="Leave empty if the day was normal"
          style={{ width: "100%", padding: ".7rem", borderRadius: ".7rem", border: "1px solid #d4d4d4", fontSize: "1rem" }} />
      </div>

      {/* ── 5. CONFIRMATION AND SIGN OUT ──────────────────────────── */}
      <div className="card" style={{ borderColor: "var(--warn)", background: "var(--warn-bg)" }}>
        <h3>Confirm and sign out</h3>
        <p style={{ fontSize: ".95rem", marginBottom: ".7rem" }}>
          {statement ? <>&ldquo;{statement}&rdquo;</> : "The confirmation wording loads when online — it is not written on the phone."}
        </p>
        <button className="big-btn" disabled={!canConfirm} onClick={() => save(true)}>
          ✓ I confirm this is true — sign me out
        </button>
        <button className="ghost" disabled={busy} onClick={() => save(false)} style={{ marginTop: ".5rem" }}>
          Save without confirming yet
        </button>
        {err && <p style={{ color: "#991b1b", fontSize: ".85rem", marginTop: ".5rem" }}>{err}</p>}
      </div>
    </div>
  );
}
