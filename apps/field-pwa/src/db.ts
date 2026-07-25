import Dexie, { type Table } from "dexie";

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
  kind: "photo" | "signature";
  blob: Blob;
  created_at: string;
}

export interface MetaItem {
  key: string;
  value: unknown;
}

class FieldDB extends Dexie {
  jobs!: Table<LocalJob, string>;
  outbox!: Table<OutboxItem, string>;
  media!: Table<MediaItem, string>;
  meta!: Table<MetaItem, string>;
  constructor() {
    super("mop-field");
    this.version(1).stores({
      jobs: "id, local_status, scheduled_date",
      outbox: "client_uuid, synced, job_id",
      media: "id, job_id",
      meta: "key",
    });
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
  const res = await fetch(`${baseUrl}/api/field/sync`);
  if (!res.ok) throw new Error(`sync failed: ${res.status}`);
  const data = (await res.json()) as { jobs: LocalJob[] };
  await db.transaction("rw", db.jobs, db.meta, async () => {
    for (const j of data.jobs) {
      const existing = await db.jobs.get(j.id);
      if (existing && existing.local_status !== "scheduled") continue;
      await db.jobs.put({ ...j, local_status: existing?.local_status ?? "scheduled" });
    }
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
  const res = await fetch(`${baseUrl}/api/field/upload`, {
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
