import { useEffect, useState } from "react";
import { authedFetch } from "./auth";
import { db, uuid } from "./db";

// §3.7 — the technician's whole day on one screen, in the order it happens:
//   here today → uniform → TIME IN → your crew and jobs → TIME OUT → hours → KPIs
//
// Built for someone wearing gloves who is not a computer user: every target is at
// least 52px, the uniform is tapped not typed, the fuel gauge is chips rather than
// a number field, and the screen always says what the NEXT thing to do is. It
// renders from cache with no signal and queues what it cannot send.
const UNIFORM = [
  { code: "tshirt", label: "T-shirt", icon: "👕" },
  { code: "pants", label: "Pants", icon: "👖" },
  { code: "socks", label: "Socks", icon: "🧦" },
  { code: "safety_shoes", label: "Safety shoes", icon: "🥾" },
  { code: "mask", label: "Mask", icon: "😷" },
];
// §3.8 — the eight bands, worded the way a person reads a gauge.
const BANDS = [
  { v: 0, label: "Empty!", danger: true }, { v: 10, label: "under 10%" },
  { v: 20, label: "under 20%" }, { v: 40, label: "under 40%" },
  { v: 60, label: "under 60%" }, { v: 80, label: "under 80%" },
  { v: 99, label: "nearly full" }, { v: 100, label: "FULL" },
];

type Day = {
  check_date: string; present: boolean; time_in: string | null; time_out: string | null;
  uniform: Record<string, boolean> | null; fuel_band: number | null; hours: string | null;
};
type MyDayData = {
  technician: { id: string; is_team_lead: boolean };
  day: Day | null;
  crew: { team_name: string; mates: string[]; vehicles: string[] } | null;
  kpis: { assigned: number; completed: number; delayed: number; cancelled: number };
  requests: { id: string; kind: string; status: string; from_date: string | null; reason: string }[];
};

const hhmm = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—";

export function MyDay({ base, online, jobCount }: {
  base: string; online: boolean; jobCount: number;
}) {
  const [data, setData] = useState<MyDayData | null>(null);
  const [uniform, setUniform] = useState<Record<string, boolean>>({});
  const [band, setBand] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = async () => {
    try {
      const r = await authedFetch(`${base}/api/field/my-day`);
      if (r.ok) {
        const d = (await r.json()) as MyDayData;
        setData(d); setUniform(d.day?.uniform ?? {}); setBand(d.day?.fuel_band ?? null);
        await db.meta.put({ key: "myDay", value: d });
        return;
      }
    } catch { /* offline — fall through to cache */ }
    const cached = (await db.meta.get("myDay"))?.value as MyDayData | undefined;
    if (cached) { setData(cached); setUniform(cached.day?.uniform ?? {}); setBand(cached.day?.fuel_band ?? null); }
  };
  useEffect(() => { void load(); }, []);

  // One writer for the whole screen. Offline it is queued as a pre-flight and
  // synced later — the technician never loses a clock-in to a dead signal.
  const save = async (patch: Record<string, unknown>, note: string) => {
    setBusy(true); setMsg("");
    const body = { client_uuid: uuid(), device_time: new Date().toISOString(), ...patch };
    try {
      const r = await authedFetch(`${base}/api/field/my-day`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(await r.text());
      setMsg(note); await load();
    } catch {
      await db.preflight.put({ check_date: new Date().toISOString().slice(0, 10), synced: 0, payload: body } as never);
      setMsg(`${note} — saved on the phone, will sync`);
    } finally { setBusy(false); }
  };

  if (!data) return <div className="card"><div className="skeleton" style={{ height: 120 }} /></div>;

  const day = data.day;
  const uniformDone = UNIFORM.every((u) => uniform[u.code]);
  const clockedIn = !!day?.time_in;
  const clockedOut = !!day?.time_out;

  return (
    <div>
      <div className="day-hero">
        <h2>{clockedOut ? "Day finished" : clockedIn ? "You're on shift" : "Good morning"}</h2>
        <div className="sub">
          {clockedOut ? `${hhmm(day!.time_in)} → ${hhmm(day!.time_out)} · ${day!.hours ?? "—"} hours`
            : clockedIn ? `Started ${hhmm(day!.time_in)}`
            : "Three quick things and you're ready"}
        </div>
      </div>

      {/* 1 · here today */}
      <div className={`step ${day?.present ? "done" : "now"}`}>
        <span className="dot">{day?.present ? "✓" : "1"}</span>
        <div style={{ flex: 1 }}>
          <div className="label">I'm here today</div>
          <div className="hint">{day?.present ? "Marked present" : "Tap to mark yourself present"}</div>
        </div>
        {!day?.present && (
          <button style={{ width: "auto" }} disabled={busy}
            onClick={() => save({ present: true }, "Marked present")}>I'm here</button>
        )}
      </div>

      {/* 2 · uniform */}
      <div className={`step ${uniformDone ? "done" : day?.present ? "now" : ""}`}>
        <span className="dot">{uniformDone ? "✓" : "2"}</span>
        <div style={{ flex: 1 }}>
          <div className="label">Uniform check</div>
          <div className="hint">{uniformDone ? "All five ticked" : "Tap each one you have on"}</div>
        </div>
      </div>
      {!uniformDone && (
        <div style={{ marginBottom: ".8rem" }}>
          {UNIFORM.map((u) => (
            <button key={u.code} className="tick" aria-pressed={!!uniform[u.code]}
              onClick={() => setUniform((s) => ({ ...s, [u.code]: !s[u.code] }))}>
              <span className="box">{uniform[u.code] ? "✓" : ""}</span>
              <span style={{ fontSize: "1.3rem" }}>{u.icon}</span>
              <span>{u.label}</span>
            </button>
          ))}
          <button disabled={busy || !UNIFORM.every((u) => uniform[u.code])}
            onClick={() => save({ uniform, present: true }, "Uniform checked")}>
            {UNIFORM.every((u) => uniform[u.code]) ? "All good — save" : "Tick all five to continue"}
          </button>
        </div>
      )}

      {/* 3 · fuel gauge, chips not typing */}
      <div className="card">
        <h3>Fuel in the van</h3>
        <div className="chips">
          {BANDS.map((b) => (
            <button key={b.v} className={`chip${b.danger ? " danger" : ""}`} aria-pressed={band === b.v}
              onClick={() => { setBand(b.v); void save({ fuel_band: b.v, present: true }, `Fuel: ${b.label}`); }}>
              {b.label}
            </button>
          ))}
        </div>
      </div>

      {/* 4 · the clock */}
      {!clockedIn ? (
        <button className="big-btn go" disabled={busy || !uniformDone}
          onClick={() => save({ time_in: new Date().toISOString(), present: true, uniform }, "Timed in")}>
          ▶ TIME IN
        </button>
      ) : !clockedOut ? (
        <button className="big-btn stop" disabled={busy}
          onClick={() => save({ time_out: new Date().toISOString() }, "Timed out")}>
          ■ TIME OUT
        </button>
      ) : (
        <div className="celebrate">
          <div className="big">🎉</div>
          <h3>{data.kpis.completed} job{data.kpis.completed === 1 ? "" : "s"} done</h3>
          <div>{day!.hours} hours today. See you tomorrow.</div>
        </div>
      )}

      {/* crew */}
      {data.crew && (
        <div className="card" style={{ marginTop: ".9rem" }}>
          <h3>Today's crew — {data.crew.team_name}</h3>
          <div style={{ color: "var(--muted)", fontSize: ".92rem" }}>
            {data.crew.mates.length ? `With ${data.crew.mates.join(", ")}` : "Working solo today"}
            {data.crew.vehicles.length ? ` · ${data.crew.vehicles.join(", ")}` : ""}
          </div>
        </div>
      )}

      {/* KPIs */}
      <div className="card">
        <h3>Today</h3>
        <div className="kpis">
          <div className="kpi"><div className="n">{jobCount || data.kpis.assigned}</div><div className="l">jobs assigned</div></div>
          <div className="kpi good"><div className="n">{data.kpis.completed}</div><div className="l">completed</div></div>
          <div className="kpi warn"><div className="n">{data.kpis.delayed}</div><div className="l">delayed</div></div>
          <div className="kpi"><div className="n">{day?.hours ?? "—"}</div><div className="l">hours</div></div>
        </div>
      </div>

      {msg && <p style={{ color: "var(--ok)", fontWeight: 600 }}>{msg}</p>}
      {!online && <p style={{ color: "var(--warn)" }}>Offline — everything you tap is saved and sent when signal returns.</p>}
    </div>
  );
}
