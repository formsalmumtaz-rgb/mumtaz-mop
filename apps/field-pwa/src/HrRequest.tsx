import { useState } from "react";
import { authedFetch } from "./auth";
import { db, uuid } from "./db";

// §3.7 — sick leave and other requests, from the phone.
//
// Chips instead of a dropdown, and the only typing is the reason, because that is
// the one thing the system genuinely cannot know. Works offline: the request is
// queued with a client_uuid, so syncing it three times still makes one request.
const KINDS = [
  { v: "sick_leave", label: "Sick leave", icon: "🤒", dated: true },
  { v: "annual_leave", label: "Annual leave", icon: "🏖️", dated: true },
  { v: "unpaid_leave", label: "Unpaid leave", icon: "📅", dated: true },
  { v: "advance", label: "Salary advance", icon: "💵", dated: false },
  { v: "document", label: "Document request", icon: "📄", dated: false },
  { v: "other", label: "Something else", icon: "💬", dated: false },
];
const today = () => new Date().toISOString().slice(0, 10);

export function HrRequest({ base, onBack, recent }: {
  base: string; onBack: () => void;
  recent: { id: string; kind: string; status: string; from_date: string | null; reason: string }[];
}) {
  const [kind, setKind] = useState<string>("sick_leave");
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [reason, setReason] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const dated = KINDS.find((k) => k.v === kind)?.dated ?? false;

  const submit = async () => {
    setBusy(true);
    const body = { client_uuid: uuid(), device_time: new Date().toISOString(), kind, reason: reason.trim(),
                   from_date: dated ? from : null, to_date: dated ? to : null };
    try {
      const r = await authedFetch(`${base}/api/field/hr-requests`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(await r.text());
    } catch {
      // queued like any other field write; the office sees it when the phone syncs
      await db.outbox.put({ client_uuid: body.client_uuid, synced: 0, job_id: null,
        event_type: "hr.request", payload: body, device_time: body.device_time } as never);
    }
    setSent(true); setBusy(false);
  };

  if (sent) return (
    <div>
      <div className="celebrate">
        <div className="big">✅</div>
        <h3>Request sent</h3>
        <div>The office will see it and get back to you.</div>
      </div>
      <button className="ghost" onClick={onBack} style={{ marginTop: ".9rem" }}>Back to my day</button>
    </div>
  );

  return (
    <div>
      <div className="card">
        <h3>What do you need?</h3>
        <div className="chips" style={{ marginBottom: ".8rem" }}>
          {KINDS.map((k) => (
            <button key={k.v} className="chip" aria-pressed={kind === k.v} onClick={() => setKind(k.v)}>
              {k.icon} {k.label}
            </button>
          ))}
        </div>

        {dated && (
          <div style={{ display: "flex", gap: ".5rem", marginBottom: ".8rem" }}>
            <label style={{ flex: 1 }}>From
              <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); if (to < e.target.value) setTo(e.target.value); }} />
            </label>
            <label style={{ flex: 1 }}>To
              <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
            </label>
          </div>
        )}

        <label>Tell the office why
          <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Fever since last night, doctor advised two days rest"
            style={{ width: "100%", padding: ".7rem", borderRadius: ".7rem", border: "1px solid #d4d4d4", fontSize: "1rem" }} />
        </label>

        <button className="big-btn" disabled={busy || reason.trim().length < 3} onClick={submit}>
          {reason.trim().length < 3 ? "Add a short reason first" : "Send request"}
        </button>
      </div>

      {recent.length > 0 && (
        <div className="card">
          <h3>Your recent requests</h3>
          {recent.map((r) => (
            <div key={r.id} style={{ display: "flex", justifyContent: "space-between", gap: ".5rem", padding: ".45rem 0", borderBottom: "1px solid var(--line)" }}>
              <div>
                <div style={{ fontWeight: 600 }}>{KINDS.find((k) => k.v === r.kind)?.label ?? r.kind}</div>
                <div style={{ fontSize: ".82rem", color: "var(--muted)" }}>{r.from_date ?? ""} {r.reason.slice(0, 40)}</div>
              </div>
              <span className={`pill ${r.status === "approved" ? "ok" : r.status === "declined" ? "warn" : "info"}`}>{r.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
