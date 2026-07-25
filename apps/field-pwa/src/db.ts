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

// Append an event to the outbox. Pure local write — the sync-up happens in K4.
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
