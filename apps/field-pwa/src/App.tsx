import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import imageCompression from "browser-image-compression";
import { db, enqueue, pendingCount, syncPull, syncUp, uuid, type LocalJob } from "./db";
import { calcDose } from "./dose";

const SYNC_BASE = (import.meta.env.VITE_SYNC_BASE as string) || "http://localhost:3100";
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
  const pending = useLiveQuery(() => pendingCount(), [], 0);
  const jobs = useLiveQuery(() => db.jobs.orderBy("scheduled_date").toArray(), [], []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [syncMsg, setSyncMsg] = useState("");
  const [syncErr, setSyncErr] = useState("");

  // Drain the outbox to the server whenever we're online (and when new items are
  // queued). Interrupted uploads just leave items pending and retry — the server
  // dedups by client UUID. Failures are surfaced, never silent.
  useEffect(() => {
    if (!online) return;
    syncUp(SYNC_BASE)
      .then((r) => { if (r.uploaded > 0) setSyncMsg(`Uploaded ${r.uploaded}`); setSyncErr(""); })
      .catch((e) => setSyncErr(`Sync failed — will retry when connection is stable. (${e.message})`));
  }, [online, pending]);

  const doSync = async () => {
    setSyncMsg("Syncing…");
    try {
      const r = await syncPull(SYNC_BASE);
      setSyncMsg(`Pulled ${r.jobs} job(s)`);
    } catch {
      setSyncMsg("Sync failed (offline?)");
    }
  };

  const selected = jobs.find((j) => j.id === selectedId) ?? null;

  return (
    <div className="app">
      <div className="bar">
        <strong>Mumtaz Field</strong>
        <span className="status">
          <span className={`dot ${online ? "on" : "off"}`} />
          {online ? "Online" : "Offline"}
        </span>
        <span className="pending">{pending} to sync</span>
      </div>

      {syncErr && (
        <div style={{ background: "#fef2f2", color: "#991b1b", padding: ".5rem .9rem", fontSize: ".85rem" }}>
          {syncErr}
        </div>
      )}

      <div className="content">
        {!selected && (
          <>
            <div className="row" style={{ marginBottom: ".7rem" }}>
              <button className="ghost" onClick={doSync} disabled={!online} style={{ width: "auto" }}>
                Sync today's jobs
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

function StatusPill({ s }: { s: LocalJob["local_status"] }) {
  const cls = s === "completed" ? "done" : s === "in_progress" ? "prog" : "sched";
  const label = s === "completed" ? "Completed" : s === "in_progress" ? "In progress" : "Scheduled";
  return <span className={`pill ${cls}`}>{label}</span>;
}

function JobDetail({ job, onBack }: { job: LocalJob; onBack: () => void }) {
  const media = useLiveQuery(() => db.media.where("job_id").equals(job.id).toArray(), [job.id], []);
  const [checklist, setChecklist] = useState<Record<string, boolean>>((job.checklist as Record<string, boolean>) ?? {});
  const [area, setArea] = useState("");
  const sigRef = useRef<SignaturePadHandle>(null);

  const start = async () => {
    const now = new Date().toISOString();
    await db.jobs.update(job.id, { local_status: "in_progress", device_started_at: now });
    await enqueue("job.started", job.id, { device_started_at: now });
  };

  const addPhoto = async (file: File) => {
    const compressed = await imageCompression(file, { maxWidthOrHeight: 1600, maxSizeMB: 0.15, fileType: "image/webp" });
    await db.media.add({ id: uuid(), job_id: job.id, kind: "photo", blob: compressed, created_at: new Date().toISOString() });
  };

  const saveSignature = async () => {
    const blob = await sigRef.current?.toBlob();
    if (blob) await db.media.add({ id: uuid(), job_id: job.id, kind: "signature", blob, created_at: new Date().toISOString() });
  };

  const complete = async () => {
    const now = new Date().toISOString();
    const photos = media.filter((m) => m.kind === "photo").map((m) => m.id);
    const signature = media.find((m) => m.kind === "signature")?.id ?? null;
    const dose = calcDose(job.recipe, Number(area));
    await db.jobs.update(job.id, { local_status: "completed", device_completed_at: now, checklist });
    await enqueue("job.completed", job.id, {
      client_uuid: uuid(),
      device_completed_at: now,
      checklist,
      dose,
      photo_ids: photos,
      signature_id: signature,
    });
    onBack();
  };

  const photoCount = media.filter((m) => m.kind === "photo").length;
  const hasSignature = media.some((m) => m.kind === "signature");
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
      </div>

      {job.local_status === "scheduled" && <button onClick={start}>Start job</button>}

      {job.local_status === "in_progress" && (
        <>
          <div className="card">
            <h3>Checklist</h3>
            {CHECKLIST.map((item) => (
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
            <h3>Chemical dose</h3>
            <div className="row">
              <input type="number" placeholder="Area (m²)" value={area} onChange={(e) => setArea(e.target.value)} />
            </div>
            <p className="muted">
              {job.recipe
                ? dose ? `${job.recipe.name}: ${dose.amount} ${dose.unit}` : "Enter an area to calculate."
                : "No treatment recipe configured for this job (recipe table not yet seeded)."}
            </p>
          </div>

          <div className="card">
            <h3>Signature {hasSignature && <span className="pill done">saved</span>}</h3>
            <SignaturePad ref={sigRef} />
            <div className="row" style={{ marginTop: ".5rem" }}>
              <button className="ghost" style={{ width: "auto" }} onClick={() => sigRef.current?.clear()}>Clear</button>
              <button className="secondary" style={{ width: "auto" }} onClick={saveSignature}>Save signature</button>
            </div>
          </div>

          <button onClick={complete}>Complete job</button>
        </>
      )}

      {job.local_status === "completed" && <div className="card"><span className="pill done">Completed ✓</span> — queued to sync.</div>}
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
    toBlob: () => new Promise((res) => canvasRef.current?.toBlob((b) => res(b), "image/webp") ?? res(null)),
  }));
  const pos = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
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
