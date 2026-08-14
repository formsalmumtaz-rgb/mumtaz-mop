import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import imageCompression from "browser-image-compression";
import { db, enqueue, syncStatus, syncPull, syncUp, syncMedia, savePreflightLocal, syncPreflight, getLocalPreflight, uuid, type LocalJob, type InspectionOption } from "./db";
import { calcDose } from "./dose";
import { signIn, signOutLocal, getSession, authedFetch, RevokedError, authConfigured } from "./auth";

// Default to same-origin ("") so API calls go to /api/... on whatever host is serving
// the app (localhost, or a tunnel) and the dev/preview proxy forwards them to the local
// ops-console. Set VITE_SYNC_BASE only to point at an explicit absolute API host.
const SYNC_BASE = (import.meta.env.VITE_SYNC_BASE as string | undefined) ?? "";
const CHECKLIST = ["Site accessible", "Treatment applied", "Bait stations checked", "Area cleaned", "Customer briefed"];

function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  return online;
}

export function App() {
  const online = useOnline();
  const status = useLiveQuery(() => syncStatus(), [], { events: 0, media: 0, preflight: 0, total: 0 } as Awaited<ReturnType<typeof syncStatus>>);
  const jobs = useLiveQuery(() => db.jobs.orderBy("scheduled_date").toArray(), [], []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [syncMsg, setSyncMsg] = useState("");
  const [syncErr, setSyncErr] = useState("");
  // Auth gate (T1, §11.5). authed: null = checking, false = need login, true = ok.
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [revoked, setRevoked] = useState(false);
  const [showPreflight, setShowPreflight] = useState(false);

  useEffect(() => {
    (async () => setAuthed(!!(await getSession())))();
  }, []);

  // A revoked device: flush what we can (best effort), then lock and require login.
  const onRevoked = async () => {
    setRevoked(true);
    await signOutLocal();
    setAuthed(false);
  };

  // Drain the outbox to the server whenever we're online (and when new items are
  // queued). Interrupted uploads just leave items pending and retry — the server
  // dedups by client UUID. Failures are surfaced, never silent.
  useEffect(() => {
    if (!online || !authed) return;
    (async () => {
      try {
        const ev = await syncUp(SYNC_BASE);
        const md = await syncMedia(SYNC_BASE);
        await syncPreflight(SYNC_BASE);
        if (ev.uploaded + md.uploaded > 0) setSyncMsg(`Uploaded ${ev.uploaded} events, ${md.uploaded} media`);
        setSyncErr("");
      } catch (e) {
        if (e instanceof RevokedError) { await onRevoked(); return; }
        setSyncErr(`Sync failed — will retry when connection is stable. (${(e as Error).message})`);
      }
    })();
  }, [online, status.total, authed]);

  const doSync = async () => {
    setSyncMsg("Syncing…");
    try {
      const r = await syncPull(SYNC_BASE);
      setSyncMsg(`Pulled ${r.jobs} job(s)`);
    } catch (e) {
      if (e instanceof RevokedError) { await onRevoked(); return; }
      setSyncMsg("Sync failed (offline?)");
    }
  };

  if (authed === null) return <div className="app"><div className="content"><p className="muted">Loading…</p></div></div>;
  if (!authed) return <LoginScreen revoked={revoked} onDone={() => { setRevoked(false); setAuthed(true); }} />;
  if (showPreflight) return <PreflightScreen online={online} onBack={() => setShowPreflight(false)} />;

  const selected = jobs.find((j) => j.id === selectedId) ?? null;

  return (
    <div className="app">
      <div className="bar">
        <strong>Mumtaz Field</strong>
        <span className="status">
          <span className={`dot ${online ? "on" : "off"}`} />
          {online ? "Online" : "Offline"}
        </span>
        <span className="pending" title={`events ${status.events} · media ${status.media} · pre-flight ${status.preflight}`}>
          {status.total === 0 ? (online ? "All synced" : "Nothing pending") : `${status.total} to sync`}
        </span>
      </div>
      {status.total > 0 && (
        <div style={{ background: online ? "#eff6ff" : "#fffbeb", color: "#334155", padding: ".35rem .9rem", fontSize: ".78rem" }}>
          Waiting to sync: {status.events} event(s), {status.media} media, {status.preflight} pre-flight.
          {status.lastSync ? ` Last sync ${new Date(status.lastSync).toLocaleTimeString()}.` : " Not synced yet."}
          {!online && " Will send automatically when back online."}
        </div>
      )}

      {syncErr && (
        <div style={{ background: "#fef2f2", color: "#991b1b", padding: ".5rem .9rem", fontSize: ".85rem" }}>
          {syncErr}
        </div>
      )}

      <VanStockBar />

      <div className="content">
        {!selected && (
          <>
            <div className="row" style={{ marginBottom: ".7rem", gap: ".5rem" }}>
              <button className="ghost" onClick={doSync} disabled={!online} style={{ width: "auto" }}>
                Sync today's jobs
              </button>
              <button className="ghost" onClick={() => setShowPreflight(true)} style={{ width: "auto" }}>
                Pre-flight
              </button>
              {syncMsg && <span className="muted">{syncMsg}</span>}
            </div>
            {jobs.length === 0 && <p className="muted">No jobs yet. Tap “Sync” while online.</p>}
            {jobs.map((j) => (
              <div key={j.id} className="card" onClick={() => setSelectedId(j.id)} role="button">
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <h3>{j.customer_name}</h3>
                  <StatusPill s={j.local_status} />
                </div>
                <div className="muted">{j.branch_name ?? ""}{j.address ? ` · ${j.address}` : ""}</div>
                <div className="muted">{j.scheduled_date ?? ""}{j.service_type ? ` · ${j.service_type}` : ""}</div>
              </div>
            ))}
          </>
        )}

        {selected && (
          <JobDetail job={selected} onBack={() => setSelectedId(null)} />
        )}
      </div>
    </div>
  );
}

// Vision P3 — the in-hand van stock bar, always visible. Base figures come from
// the last sync; anything the technician has recorded but not yet synced
// (job.completed doses waiting in the outbox) is subtracted OPTIMISTICALLY so
// the bar moves the moment usage is recorded, not when the server confirms.
function VanStockBar() {
  const stock = useLiveQuery(async () =>
    ((await db.meta.get("vanStock"))?.value as { item: string; unit: string | null; qty: number }[] | undefined) ?? [], [], []);
  const pendingDoses = useLiveQuery(async () => {
    const pending = await db.outbox.where("synced").equals(0).toArray();
    const byItem: Record<string, number> = {};
    for (const ev of pending) {
      if (ev.event_type !== "job.completed") continue;
      const dose = (ev.payload as { dose?: { amount: number; unit: string } | null })?.dose;
      const job = await db.jobs.get(ev.job_id);
      const product = job?.recipe?.name;
      if (dose && product) byItem[product] = (byItem[product] ?? 0) + dose.amount;
    }
    return byItem;
  }, [], {} as Record<string, number>);
  if (!stock.length) return null;
  return (
    <div style={{ display: "flex", gap: ".9rem", overflowX: "auto", padding: ".45rem .9rem",
                  background: "#faf7f2", borderBottom: "1px solid #eee5d8", fontSize: ".78rem", whiteSpace: "nowrap" }}>
      <span style={{ color: "#8a6d3b", fontWeight: 700 }}>VAN</span>
      {stock.map((s) => {
        const used = pendingDoses[s.item] ?? 0;
        const left = Math.max(0, Math.round((s.qty - used) * 100) / 100);
        const low = s.qty > 0 && left / s.qty < 0.2;
        return (
          <span key={s.item} style={{ color: low ? "#b91c1c" : "#44403c" }}>
            {s.item}: <b>{left}</b>{s.unit ? ` ${s.unit}` : ""}{used > 0 ? ` (−${used} pending)` : ""}
          </span>
        );
      })}
    </div>
  );
}

function StatusPill({ s }: { s: LocalJob["local_status"] }) {
  const cls = s === "completed" ? "done" : s === "in_progress" ? "prog" : "sched";
  const label = s === "completed" ? "Completed" : s === "in_progress" ? "In progress" : "Scheduled";
  return <span className={`pill ${cls}`}>{label}</span>;
}

function JobDetail({ job, onBack }: { job: LocalJob; onBack: () => void }) {
  const media = useLiveQuery(() => db.media.where("job_id").equals(job.id).toArray(), [job.id], []);
  const [checklist, setChecklist] = useState<Record<string, boolean>>((job.checklist as Record<string, boolean>) ?? {});
  const [area, setArea] = useState("");
  // Vision P1 — what only the technician knows on site (service report S2/S7/S8):
  // who received the service, how it was treated, what we recommend.
  const [repName, setRepName] = useState("");
  const [treatMethod, setTreatMethod] = useState("");
  const [recommend, setRecommend] = useState("");
  const sigCustRef = useRef<SignaturePadHandle>(null);
  const sigTechRef = useRef<SignaturePadHandle>(null);
  // Post-inspection (T4): options cached from sync; entries accumulated per area.
  const options = useLiveQuery(async () => ((await db.meta.get("inspectionOptions"))?.value as InspectionOption[] | undefined) ?? [], [], []);
  const [inspections, setInspections] = useState<InspectionEntry[]>([]);
  const [insp, setInsp] = useState<InspectionEntry>({ area: "", issue_type: "", hygiene_score: 0, structural_score: 0, infestation_level: "" });
  const opts = (kind: string) => options.filter((o) => o.kind === kind);
  const addInspection = () => {
    if (!insp.area) return;
    setInspections((list) => [...list.filter((e) => e.area !== insp.area), insp]);
    setInsp({ area: "", issue_type: "", hygiene_score: 0, structural_score: 0, infestation_level: "" });
  };
  const mapsUrl = job.lat != null && job.lng != null
    ? `https://www.google.com/maps/dir/?api=1&destination=${job.lat},${job.lng}` : null;
  // Cash collection + expense entry (T5). Queued offline as events; the server
  // posts a cash receipt / a submitted expense claim.
  const [cashAmt, setCashAmt] = useState("");
  const [expAmt, setExpAmt] = useState("");
  const [expDesc, setExpDesc] = useState("");
  const [moneyMsg, setMoneyMsg] = useState("");
  const collectCash = async () => {
    if (!cashAmt || Number(cashAmt) <= 0) return;
    await enqueue("cash.collected", job.id, { job_id: job.id, amount: Number(cashAmt) });
    setCashAmt(""); setMoneyMsg("Cash queued.");
  };
  const logExpense = async () => {
    if (!expAmt || Number(expAmt) <= 0) return;
    await enqueue("expense.recorded", job.id, { job_id: job.id, client_uuid: uuid(), amount: Number(expAmt), description: expDesc || null });
    setExpAmt(""); setExpDesc(""); setMoneyMsg("Expense queued (needs approval).");
  };

  const start = async () => {
    const now = new Date().toISOString();
    await db.jobs.update(job.id, { local_status: "in_progress", device_started_at: now });
    await enqueue("job.started", job.id, { device_started_at: now });
  };

  const addPhoto = async (file: File) => {
    const compressed = await imageCompression(file, { maxWidthOrHeight: 1600, maxSizeMB: 0.15, fileType: "image/webp" });
    await db.media.add({ id: uuid(), job_id: job.id, kind: "photo", blob: compressed, created_at: new Date().toISOString(), synced: 0 });
  };

  // Item 20: a signature says WHOSE. "signature" = customer representative
  // (historic kind name kept so already-stored rows stay valid);
  // "signature_tech" = technician/supervisor. Both render on the report.
  const saveSignature = async (kind: "signature" | "signature_tech") => {
    const ref = kind === "signature" ? sigCustRef : sigTechRef;
    const blob = await ref.current?.toBlob();
    if (blob) await db.media.add({ id: uuid(), job_id: job.id, kind, blob, created_at: new Date().toISOString(), synced: 0 });
  };

  const complete = async () => {
    const now = new Date().toISOString();
    const photos = media.filter((m) => m.kind === "photo").map((m) => m.id);
    const signature = media.find((m) => m.kind === "signature")?.id ?? null;
    const signatureTech = media.find((m) => m.kind === "signature_tech")?.id ?? null;
    const dose = calcDose(job.recipe, Number(area));
    await db.jobs.update(job.id, { local_status: "completed", device_completed_at: now, checklist });
    // Post-inspection is its own event so it lands in the append-only inspection
    // record (T4); job.completed still carries the treatment dose/consumption.
    if (inspections.length > 0) {
      await enqueue("job.inspected", job.id, { job_id: job.id, device_time: now, entries: inspections });
    }
    await enqueue("job.completed", job.id, {
      client_uuid: uuid(),
      device_completed_at: now,
      checklist,
      dose,
      photo_ids: photos,
      signature_id: signature,
      signature_tech_id: signatureTech,
      onsite_rep_name: repName.trim() || undefined,
      treatment_method: treatMethod || undefined,
      recommendations: recommend.trim() || undefined,
    });
    onBack();
  };

  const makeReport = async () => {
    const { generateServiceReport } = await import("./pdf"); // code-split jsPDF
    const blob = await generateServiceReport(job, media);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `service-report-${job.id.slice(0, 8)}.pdf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  const photoCount = media.filter((m) => m.kind === "photo").length;
  const hasSignature = media.some((m) => m.kind === "signature");
  const hasTechSignature = media.some((m) => m.kind === "signature_tech");
  const dose = calcDose(job.recipe, Number(area));

  return (
    <div>
      <button className="ghost" onClick={onBack} style={{ width: "auto", marginBottom: ".7rem" }}>← Jobs</button>

      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3>{job.customer_name}</h3><StatusPill s={job.local_status} />
        </div>
        <div className="muted">{job.branch_name}{job.address ? ` · ${job.address}` : ""}</div>
        {job.access_notes && <div className="muted">Access: {job.access_notes}</div>}
        {job.lat != null && <div className="muted">Pin: {job.lat.toFixed(5)}, {job.lng?.toFixed(5)}</div>}
        {mapsUrl && (
          <a className="ghost" href={mapsUrl} target="_blank" rel="noreferrer"
             style={{ display: "inline-block", width: "auto", marginTop: ".5rem", textDecoration: "none" }}>
            Navigate ↗
          </a>
        )}
      </div>

      {job.local_status === "scheduled" && <button onClick={start}>Start job</button>}

      {job.local_status === "in_progress" && (
        <>
          <div className="card">
            <h3>Checklist</h3>
            {(job.checklist_items ?? CHECKLIST).map((item) => (
              <label className="chk" key={item}>
                <input type="checkbox" checked={!!checklist[item]}
                       onChange={(e) => setChecklist((c) => ({ ...c, [item]: e.target.checked }))} />
                {item}
              </label>
            ))}
          </div>

          <div className="card">
            <h3>Photos ({photoCount})</h3>
            <div className="row" style={{ flexWrap: "wrap", marginBottom: ".5rem" }}>
              {media.filter((m) => m.kind === "photo").map((m) => (
                <img key={m.id} className="thumb" src={URL.createObjectURL(m.blob)} alt="" />
              ))}
            </div>
            <input type="file" accept="image/*" capture="environment"
                   onChange={(e) => { const f = e.target.files?.[0]; if (f) addPhoto(f); e.currentTarget.value = ""; }} />
          </div>

          <div className="card">
            <h3>Chemicals used</h3>
            <label className="muted" style={{ display: "block", fontSize: ".85rem" }}>Treated area (m²)
              <input type="number" placeholder="e.g. 120" value={area} onChange={(e) => setArea(e.target.value)} />
            </label>
            <p className="muted">
              {job.recipe
                ? dose ? `${job.recipe.name}: ${dose.amount} ${dose.unit} — calculated for you from the treated area` : "Enter the treated area and the chemical amount is calculated for you."
                : "No treatment recipe on this job — tell the office what you used."}
            </p>
          </div>

          <div className="card">
            <h3>Post-inspection ({inspections.length} area{inspections.length === 1 ? "" : "s"})</h3>
            <Pick label="Area" value={insp.area} onPick={(v) => setInsp({ ...insp, area: v })} options={opts("area")} />
            <Pick label="Issue" value={insp.issue_type} onPick={(v) => setInsp({ ...insp, issue_type: v })} options={opts("issue_type")} />
            <Pick label="Infestation" value={insp.infestation_level} onPick={(v) => setInsp({ ...insp, infestation_level: v })} options={opts("infestation")} />
            <Score label="Hygiene" value={insp.hygiene_score} onPick={(n) => setInsp({ ...insp, hygiene_score: n })} />
            <Score label="Structural" value={insp.structural_score} onPick={(n) => setInsp({ ...insp, structural_score: n })} />
            <button className="secondary" style={{ width: "auto", marginTop: ".5rem" }} onClick={addInspection} disabled={!insp.area}>Add area</button>
            {inspections.length > 0 && (
              <ul className="muted" style={{ marginTop: ".5rem", paddingLeft: "1.1rem" }}>
                {inspections.map((e) => <li key={e.area}>{e.area}: {e.infestation_level || "—"} · hyg {e.hygiene_score || "—"}/5 · str {e.structural_score || "—"}/5</li>)}
              </ul>
            )}
            {options.length === 0 && <p className="muted">Inspection options load on next online sync.</p>}
          </div>

          <div className="card">
            <h3>Cash &amp; expenses</h3>
            <div className="row" style={{ gap: ".5rem", alignItems: "flex-end" }}>
              <label className="muted" style={{ flex: 1 }}>Cash collected (AED)
                <input type="number" inputMode="decimal" value={cashAmt} onChange={(e) => setCashAmt(e.target.value)} /></label>
              <button className="secondary" style={{ width: "auto" }} onClick={collectCash} disabled={!cashAmt}>Collect</button>
            </div>
            <div className="row" style={{ gap: ".5rem", alignItems: "flex-end", marginTop: ".5rem" }}>
              <label className="muted" style={{ flex: 1 }}>Expense (AED)
                <input type="number" inputMode="decimal" value={expAmt} onChange={(e) => setExpAmt(e.target.value)} /></label>
              <label className="muted" style={{ flex: 2 }}>What for
                <input value={expDesc} onChange={(e) => setExpDesc(e.target.value)} placeholder="e.g. fuel" /></label>
              <button className="secondary" style={{ width: "auto" }} onClick={logExpense} disabled={!expAmt}>Log</button>
            </div>
            <p className="muted" style={{ fontSize: ".8rem" }}>Attach a receipt via Photos above. {moneyMsg}</p>
          </div>

          <div className="card">
            <h3>How was it treated?</h3>
            <p className="muted" style={{ fontSize: ".8rem", marginTop: 0 }}>Tap the method you used. This prints on the service report.</p>
            <div className="row" style={{ flexWrap: "wrap", gap: ".4rem" }}>
              {[["gel_treatment", "Gel"], ["spray_treatment", "Spray"], ["residual_spray", "Residual spray"],
                ["fogging_ulv", "Fogging"], ["termite_treatment", "Termite"], ["rat_poison_bait_station", "Bait station"],
                ["monitoring_only", "Monitoring only"]].map(([code, label]) => (
                <button key={code} type="button" className={treatMethod === code ? "" : "ghost"}
                        style={{ width: "auto", padding: ".55rem .8rem", minHeight: 40 }}
                        onClick={() => setTreatMethod(treatMethod === code ? "" : code)}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="card">
            <h3>Site sign-off details</h3>
            <label className="muted" style={{ display: "block", fontSize: ".85rem" }}>Who received the service? (name)
              <input value={repName} onChange={(e) => setRepName(e.target.value)} placeholder="e.g. Mr. Rashid — Manager" />
            </label>
            <label className="muted" style={{ display: "block", fontSize: ".85rem", marginTop: ".5rem" }}>What should the customer fix or watch?
              <input value={recommend} onChange={(e) => setRecommend(e.target.value)} placeholder="e.g. seal the gap under the rear door" />
            </label>
          </div>

          <div className="card">
            <h3>Customer signature {hasSignature && <span className="pill done">saved</span>}</h3>
            <p className="muted" style={{ fontSize: ".8rem", marginTop: 0 }}>The customer&rsquo;s representative signs here to confirm the work.</p>
            <SignaturePad ref={sigCustRef} />
            <div className="row" style={{ marginTop: ".5rem" }}>
              <button className="ghost" style={{ width: "auto" }} onClick={() => sigCustRef.current?.clear()}>Clear</button>
              <button className="secondary" style={{ width: "auto" }} onClick={() => saveSignature("signature")}>Save customer signature</button>
            </div>
          </div>

          <div className="card">
            <h3>Your signature {hasTechSignature && <span className="pill done">saved</span>}</h3>
            <p className="muted" style={{ fontSize: ".8rem", marginTop: 0 }}>You (the technician) sign here.</p>
            <SignaturePad ref={sigTechRef} />
            <div className="row" style={{ marginTop: ".5rem" }}>
              <button className="ghost" style={{ width: "auto" }} onClick={() => sigTechRef.current?.clear()}>Clear</button>
              <button className="secondary" style={{ width: "auto" }} onClick={() => saveSignature("signature_tech")}>Save my signature</button>
            </div>
          </div>

          <button onClick={complete}>Complete job</button>
        </>
      )}

      {job.local_status === "completed" && (
        <>
          <div className="celebrate">
            <span className="tick">✓</span>
            <span>Job completed — nice work! It will sync automatically.</span>
          </div>
          <div className="card">
            <button className="secondary" onClick={makeReport}>Generate report (PDF)</button>
          </div>
        </>
      )}
    </div>
  );
}

interface SignaturePadHandle { clear: () => void; toBlob: () => Promise<Blob | null>; }
import { forwardRef, useImperativeHandle } from "react";
const SignaturePad = forwardRef<SignaturePadHandle>((_, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  useImperativeHandle(ref, () => ({
    clear: () => { const c = canvasRef.current; if (c) c.getContext("2d")!.clearRect(0, 0, c.width, c.height); },
    // PNG, not WebP: jsPDF (the on-device report renderer) cannot decode WebP —
    // a WebP signature made addImage throw and the box silently printed empty
    // (P0-2). PNG is ideal for line art and every renderer accepts it.
    toBlob: () => new Promise((res) => canvasRef.current?.toBlob((b) => res(b), "image/png") ?? res(null)),
  }));
  const pos = (e: React.PointerEvent) => {
    // Scale CSS pixels → canvas buffer pixels: the canvas is styled to the card
    // width but its buffer is fixed 560×160; without this the stroke lands
    // offset from the finger (the reported device bug).
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
  };
  return (
    <canvas
      ref={canvasRef} className="sig" width={560} height={160}
      onPointerDown={(e) => { drawing.current = true; const { x, y } = pos(e); const ctx = canvasRef.current!.getContext("2d")!; ctx.beginPath(); ctx.moveTo(x, y); }}
      onPointerMove={(e) => { if (!drawing.current) return; const { x, y } = pos(e); const ctx = canvasRef.current!.getContext("2d")!; ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.lineTo(x, y); ctx.stroke(); }}
      onPointerUp={() => { drawing.current = false; }}
      onPointerLeave={() => { drawing.current = false; }}
    />
  );
});

// Login gate (T1, DECISIONS §11.5). Online sign-in caches the session (access +
// long refresh token); after that the app works offline until the refresh token
// itself expires. `revoked` shows when the device was locked out at sync.
function LoginScreen({ revoked, onDone }: { revoked: boolean; onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const online = useOnline();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const { error } = await signIn(email.trim(), password);
    setBusy(false);
    if (error) { setErr(error); return; }
    onDone();
  };

  return (
    <div className="app">
      <div className="bar"><strong>Mumtaz Field</strong></div>
      <div className="content">
        {!authConfigured && (
          <div style={{ background: "#fef2f2", color: "#991b1b", padding: ".6rem .9rem", fontSize: ".85rem", borderRadius: 8, marginBottom: ".8rem" }}>
            Sign-in isn’t configured — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY. (See BLOCKED.md.)
          </div>
        )}
        {revoked && (
          <div style={{ background: "#fffbeb", color: "#92400e", padding: ".6rem .9rem", fontSize: ".85rem", borderRadius: 8, marginBottom: ".8rem" }}>
            This device’s access was revoked. Any completed work already queued was sent for review. Sign in again to continue.
          </div>
        )}
        <h2 style={{ margin: "0 0 .8rem" }}>Technician sign-in</h2>
        <form onSubmit={submit}>
          <label className="muted">Email
            <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className="muted">Password
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          {err && <p style={{ color: "#991b1b", fontSize: ".85rem" }}>{err}</p>}
          {!online && <p className="muted" style={{ fontSize: ".8rem" }}>You appear offline — sign-in needs a connection the first time.</p>}
          <button type="submit" disabled={busy || !authConfigured}>{busy ? "Signing in…" : "Sign in"}</button>
        </form>
      </div>
    </div>
  );
}

// Start-of-shift pre-flight (T3). Loads the configurable PPE/equipment checklist
// (online), lets the technician tick items and record vehicle/odometer/fuel, and
// saves offline-first (queued, synced on reconnect; server upserts one per day).
interface ChecklistItem { kind: "ppe" | "equipment"; code: string; label: string }
function PreflightScreen({ online, onBack }: { online: boolean; onBack: () => void }) {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [ticks, setTicks] = useState<Record<string, boolean>>({});
  const [vehicle, setVehicle] = useState("");
  const [odometer, setOdometer] = useState("");
  const [fuelL, setFuelL] = useState("");
  const [fuelAed, setFuelAed] = useState("");
  const [notes, setNotes] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    (async () => {
      // Prefer the server checklist (online); otherwise fall back to any locally
      // saved pre-flight so the screen still works offline.
      try {
        const res = await authedFetch(`${SYNC_BASE}/api/field/preflight`);
        if (res.ok) {
          const data = (await res.json()) as { checklist: ChecklistItem[] };
          setItems(data.checklist ?? []);
        }
      } catch { /* offline */ }
      const local = await getLocalPreflight();
      if (local?.payload) {
        const p = local.payload as Record<string, unknown>;
        setTicks({ ...((p.ppe as Record<string, boolean>) ?? {}), ...((p.equipment as Record<string, boolean>) ?? {}) });
        if (p.odometer_km != null) setOdometer(String(p.odometer_km));
      }
    })();
  }, []);

  const ppe = items.filter((i) => i.kind === "ppe");
  const equip = items.filter((i) => i.kind === "equipment");

  const save = async () => {
    const pick = (list: ChecklistItem[]) => Object.fromEntries(list.map((i) => [i.code, !!ticks[i.code]]));
    await savePreflightLocal({
      present: true,
      vehicle_id: vehicle || null,
      odometer_km: odometer ? Number(odometer) : null,
      fuel_litres: fuelL ? Number(fuelL) : null,
      fuel_amount: fuelAed ? Number(fuelAed) : null,
      ppe: pick(ppe),
      equipment: pick(equip),
      notes: notes || null,
    });
    setMsg("Saved.");
    if (online) { try { await syncPreflight(SYNC_BASE); setMsg("Saved & synced."); } catch { /* retries later */ } }
    setTimeout(onBack, 500);
  };

  const Toggle = ({ i }: { i: ChecklistItem }) => (
    <label className="row" style={{ justifyContent: "space-between", padding: ".35rem 0" }}>
      <span>{i.label}</span>
      <input type="checkbox" checked={!!ticks[i.code]} onChange={(e) => setTicks((t) => ({ ...t, [i.code]: e.target.checked }))} />
    </label>
  );

  return (
    <div className="app">
      <div className="bar"><strong>Pre-flight</strong></div>
      <div className="content">
        <button className="ghost" onClick={onBack} style={{ width: "auto", marginBottom: ".7rem" }}>← Jobs</button>
        <h3>PPE</h3>
        {ppe.length === 0 && <p className="muted">Checklist loads when online.</p>}
        {ppe.map((i) => <Toggle key={i.code} i={i} />)}
        <h3 style={{ marginTop: "1rem" }}>Equipment</h3>
        {equip.map((i) => <Toggle key={i.code} i={i} />)}
        <h3 style={{ marginTop: "1rem" }}>Vehicle</h3>
        <label className="muted">Vehicle (code/plate)<input value={vehicle} onChange={(e) => setVehicle(e.target.value)} /></label>
        <label className="muted">Odometer (km)<input type="number" inputMode="numeric" value={odometer} onChange={(e) => setOdometer(e.target.value)} /></label>
        <div className="row" style={{ gap: ".5rem" }}>
          <label className="muted" style={{ flex: 1 }}>Fuel added (litres)<input type="number" inputMode="decimal" value={fuelL} onChange={(e) => setFuelL(e.target.value)} /></label>
          <label className="muted" style={{ flex: 1 }}>Fuel cost (AED)<input type="number" inputMode="decimal" value={fuelAed} onChange={(e) => setFuelAed(e.target.value)} /></label>
        </div>
        <label className="muted">Notes<input value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        {msg && <p className="muted">{msg}</p>}
        <button onClick={save}>Save pre-flight</button>
      </div>
    </div>
  );
}

// T4 post-inspection helpers.
interface InspectionEntry { area: string; issue_type: string; hygiene_score: number; structural_score: number; infestation_level: string }

function Pick({ label, value, onPick, options }: { label: string; value: string; onPick: (v: string) => void; options: InspectionOption[] }) {
  return (
    <div style={{ marginBottom: ".5rem" }}>
      <div className="muted" style={{ fontSize: ".8rem", marginBottom: ".2rem" }}>{label}</div>
      <div className="row" style={{ flexWrap: "wrap", gap: ".35rem" }}>
        {options.map((o) => (
          <button key={o.code} onClick={() => onPick(o.code === value ? "" : o.code)}
                  className={o.code === value ? "secondary" : "ghost"} style={{ width: "auto", padding: ".3rem .6rem", fontSize: ".85rem" }}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Score({ label, value, onPick }: { label: string; value: number; onPick: (n: number) => void }) {
  return (
    <div style={{ marginBottom: ".5rem" }}>
      <div className="muted" style={{ fontSize: ".8rem", marginBottom: ".2rem" }}>{label} (1–5)</div>
      <div className="row" style={{ gap: ".35rem" }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} onClick={() => onPick(n === value ? 0 : n)}
                  className={n === value ? "secondary" : "ghost"} style={{ width: "auto", padding: ".3rem .7rem" }}>
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}
