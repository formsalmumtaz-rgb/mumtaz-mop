import Dexie, { type Table } from "dexie";
import { authedFetch } from "./auth";

// Offline data store (Constitution Art. III P1). All reads/writes are local;
// the outbox carries client-generated UUIDs (Art. VII §4). Nothing blocks on
// the network.

export interface RecipeSnapshot {
  name: string;
  dose_rate: number | null;
  dose_unit: string | null;
  dilution_ratio: string | null;
  coverage_per_unit: number | null;
  coverage_unit: string | null;
}

export interface LocalJob {
  id: string;
  customer_name: string;
  branch_name: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  scheduled_date: string | null;
  service_type: string | null;
  access_notes: string | null;
  recipe: RecipeSnapshot | null;
  // Item 18: server-derived per service — a cleaning job never asks about treatment.
  checklist_items?: string[] | null;
  local_status: "scheduled" | "in_progress" | "completed";
  checklist?: Record<string, boolean | string>;
  device_started_at?: string;
  device_completed_at?: string;
}

export interface OutboxItem {
  client_uuid: string; // client-generated idempotency key (Art. VII §4)
  event_type: string; // 'job.started' | 'job.completed'
  job_id: string;
  payload: unknown;
  device_time: string;
  synced: 0 | 1;
  created_at: string;
}

export interface MediaItem {
  id: string; // client uuid
  job_id: string;
  // "signature" = customer representative (historic name kept for stored rows);
  // "signature_tech" = technician/supervisor. Item 20: a signature says WHOSE.
  kind: "photo" | "signature" | "signature_tech";
  blob: Blob;
  created_at: string;
  synced: 0 | 1;
}

export interface MetaItem {
  key: string;
  value: unknown;
}

// Button-driven post-inspection option lists (T4), cached from sync.
export interface InspectionOption { kind: "area" | "issue_type" | "infestation"; code: string; label: string }

// Start-of-shift pre-flight (T3), queued offline; one per day, keyed by date.
export interface PreflightItem {
  check_date: string; // yyyy-mm-dd (key)
  payload: Record<string, unknown>;
  device_time: string;
  synced: 0 | 1;
  created_at: string;
}

class FieldDB extends Dexie {
  jobs!: Table<LocalJob, string>;
  outbox!: Table<OutboxItem, string>;
  media!: Table<MediaItem, string>;
  meta!: Table<MetaItem, string>;
  preflight!: Table<PreflightItem, string>;
  constructor() {
    super("mop-field");
    this.version(1).stores({
      jobs: "id, local_status, scheduled_date",
      outbox: "client_uuid, synced, job_id",
      media: "id, job_id",
      meta: "key",
    });
    this.version(2)
      .stores({ media: "id, job_id, synced" })
      .upgrade(async (tx) => {
        await tx.table("media").toCollection().modify((m: MediaItem) => {
          if (m.synced === undefined) m.synced = 0;
        });
      });
    this.version(3).stores({ preflight: "check_date, synced" });
  }
}

export const db = new FieldDB();
export const uuid = (): string => crypto.randomUUID();

export async function pendingCount(): Promise<number> {
  return db.outbox.where("synced").equals(0).count();
}

// Pull today's work from the sync endpoint (online only). Never overwrites a job
// the technician has already started/completed offline.
export async function syncPull(baseUrl: string): Promise<{ jobs: number }> {
  const res = await authedFetch(`${baseUrl}/api/field/sync`);
  if (!res.ok) throw new Error(`sync failed: ${res.status}`);
  const data = (await res.json()) as {
    jobs: LocalJob[]; inspection_options?: InspectionOption[];
    van_stock?: { item: string; unit: string | null; qty: number }[];
    me?: { name: string; is_team_lead: boolean; team_name: string | null; confirmed_today: boolean } | null;
  };
  await db.transaction("rw", db.jobs, db.meta, async () => {
    for (const j of data.jobs) {
      const existing = await db.jobs.get(j.id);
      if (existing && existing.local_status !== "scheduled") continue;
      await db.jobs.put({ ...j, local_status: existing?.local_status ?? "scheduled" });
    }
    // Cache the button-driven inspection option lists for offline use (T4).
    if (data.inspection_options) await db.meta.put({ key: "inspectionOptions", value: data.inspection_options });
    // In-hand van stock (Vision P3) — displayed on every screen, decremented
    // optimistically on the device as usage is recorded.
    if (data.van_stock) await db.meta.put({ key: "vanStock", value: data.van_stock });
    // Who am I today (Vision P5.C): team + confirmation state for the banner.
    if (data.me !== undefined) await db.meta.put({ key: "me", value: data.me });
    await db.meta.put({ key: "lastSync", value: new Date().toISOString() });
  });
  return { jobs: data.jobs.length };
}

// Drain the outbox to the server on reconnect. Marks synced ONLY the client_uuids
// the server confirms it holds — so an interrupted upload or a lost ack just leaves
// items pending and they re-post next time (server dedups by client_uuid).
export async function syncUp(baseUrl: string): Promise<{ uploaded: number; remaining: number }> {
  const pending = await db.outbox.where("synced").equals(0).toArray();
  if (pending.length === 0) return { uploaded: 0, remaining: 0 };
  const res = await authedFetch(`${baseUrl}/api/field/upload`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      events: pending.map((p) => ({
        client_uuid: p.client_uuid, event_type: p.event_type, job_id: p.job_id, payload: p.payload, device_time: p.device_time,
      })),
    }),
  });
  if (!res.ok) throw new Error(`upload failed: ${res.status}`);
  const { accepted } = (await res.json()) as { accepted: string[] };
  const acc = new Set(accepted);
  let uploaded = 0;
  await db.transaction("rw", db.outbox, async () => {
    for (const p of pending) {
      if (acc.has(p.client_uuid)) {
        await db.outbox.update(p.client_uuid, { synced: 1 });
        uploaded++;
      }
    }
  });
  return { uploaded, remaining: await pendingCount() };
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onloadend = () => res((r.result as string).split(",")[1]);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}

// Upload pending photos/signatures to R2 (via the server). Idempotent by media id
// (server dedups); marks synced only what the server confirms. Same interrupted-
// sync safety as the event outbox.
export async function syncMedia(baseUrl: string): Promise<{ uploaded: number }> {
  const pending = await db.media.where("synced").equals(0).toArray();
  if (pending.length === 0) return { uploaded: 0 };
  const media = await Promise.all(
    pending.map(async (m) => ({
      id: m.id, job_id: m.job_id, kind: m.kind,
      content_type: m.blob.type || "image/webp",
      data_base64: await blobToBase64(m.blob),
    })),
  );
  const res = await authedFetch(`${baseUrl}/api/field/media`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ media }),
  });
  if (!res.ok) throw new Error(`media upload failed: ${res.status}`);
  const { accepted } = (await res.json()) as { accepted: string[] };
  const acc = new Set(accepted);
  let uploaded = 0;
  await db.transaction("rw", db.media, async () => {
    for (const m of pending) {
      if (acc.has(m.id)) {
        await db.media.update(m.id, { synced: 1 });
        uploaded++;
      }
    }
  });
  return { uploaded };
}

// Append an event to the outbox. Pure local write — never blocks on the network.
export async function enqueue(event_type: string, job_id: string, payload: unknown): Promise<string> {
  const item: OutboxItem = {
    client_uuid: uuid(),
    event_type,
    job_id,
    payload,
    device_time: new Date().toISOString(),
    synced: 0,
    created_at: new Date().toISOString(),
  };
  await db.outbox.add(item);
  return item.client_uuid;
}

// Save today's pre-flight locally (offline-first) and try to push it. Keyed by
// date so re-saving the same day overwrites (correctable). Server upserts.
export async function savePreflightLocal(payload: Record<string, unknown>): Promise<void> {
  const check_date = new Date().toISOString().slice(0, 10);
  await db.preflight.put({
    check_date, payload: { ...payload, check_date }, device_time: new Date().toISOString(), synced: 0, created_at: new Date().toISOString(),
  });
}

export async function syncPreflight(baseUrl: string): Promise<{ uploaded: number }> {
  const pending = await db.preflight.where("synced").equals(0).toArray();
  let uploaded = 0;
  for (const p of pending) {
    const res = await authedFetch(`${baseUrl}/api/field/preflight`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...p.payload, device_time: p.device_time }),
    });
    if (res.ok) { await db.preflight.update(p.check_date, { synced: 1 }); uploaded++; }
  }
  return { uploaded };
}

export async function getLocalPreflight(): Promise<PreflightItem | undefined> {
  return db.preflight.get(new Date().toISOString().slice(0, 10));
}

// Honest sync status (T6): everything still waiting to reach the server, plus the
// last successful sync. Drives the status indicator; nothing is hidden.
export async function syncStatus(): Promise<{ events: number; media: number; preflight: number; total: number; lastSync?: string }> {
  const [events, media, preflight, last] = await Promise.all([
    db.outbox.where("synced").equals(0).count(),
    db.media.where("synced").equals(0).count(),
    db.preflight.where("synced").equals(0).count(),
    db.meta.get("lastSync"),
  ]);
  return { events, media, preflight, total: events + media + preflight, lastSync: last?.value as string | undefined };
}
