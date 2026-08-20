import "server-only";
import type { AppSession } from "./auth";

// Item 4 — one sign-in, routed by role AFTER authentication.
//
// The two apps stay separate on purpose. The field PWA is offline-first — a
// service worker, an IndexedDB outbox, a full working day with no connectivity
// — and the console is server-rendered and needs a connection per page. Merging
// them would either break offline for technicians or force pointless offline
// machinery on the office. So this is routing and a shared sign-in, not a
// rebuild: same credentials, and nobody has to know which URL is "theirs".
const FIELD_ROLES = ["technician", "team_lead", "supervisor"];
const CONSOLE_ROLES = ["admin", "management", "operations", "finance", "viewer", "auditor"];

export type Destination =
  | { kind: "field"; url: string }
  | { kind: "console"; url: string }
  | { kind: "choose"; field: string; console: string }
  | { kind: "pending" };

// Where the field app lives. Set FIELD_APP_URL in the hosting environment; the
// tunnel/preview URL changes per session, so it is configuration, not a constant.
export function fieldAppUrl(): string | null {
  return process.env.FIELD_APP_URL || process.env.NEXT_PUBLIC_FIELD_APP_URL || null;
}

export function destinationFor(session: AppSession | null): Destination {
  if (!session) return { kind: "pending" };
  const roles = new Set(session.roles);
  const field = FIELD_ROLES.some((r) => roles.has(r));
  const console_ = CONSOLE_ROLES.some((r) => roles.has(r));
  const fieldUrl = fieldAppUrl();

  // Someone holding both — a supervisor who also does office work — chooses.
  // Guessing for them is how a technician ends up on a page that needs signal.
  if (field && console_ && fieldUrl) return { kind: "choose", field: fieldUrl, console: "/dashboard" };
  if (field && fieldUrl) return { kind: "field", url: fieldUrl };
  if (console_) return { kind: "console", url: "/dashboard" };
  // A field role with no field URL configured would otherwise be sent nowhere.
  // The console is the honest fallback: they will see the dashboard's own
  // permission-shaped emptiness rather than a dead link.
  if (field) return { kind: "console", url: "/dashboard" };
  return { kind: "pending" };
}
