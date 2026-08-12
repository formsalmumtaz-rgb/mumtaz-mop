# BLOCKED — items needing the owner (technician app T1–T6 autonomous run)

Autonomous build of the technician app. This file lists everything that needs
you: what, why, exactly what to do, and which phase it blocks. Work continued
around each item; nothing stalled.

Legend: 🔴 blocks a phase from completing · 🟡 works now via an ASSUMED default,
confirm/replace when you can · 🟢 device-only verification you run at the end.

---

## 🟡 A1 — Clock-drift thresholds (T1, device time)
**What:** how far off a phone clock may be before an event is flagged
`time_suspect`. Seeded ASSUMED: **future skew > 5 min**, **behind > 3 days**.
**Why:** Art. VII §4 requires flagging implausible device time; the exact window
is an operational tolerance, not a law.
**Do:** confirm or adjust the two numbers (currently constants in
`services/worker/src/ingest.ts`; will move to settings if you want them editable
without a deploy — tell me).
**Blocks:** nothing — flagging works now.

## 🟡 A2 — Supabase service-role key (T1, hard token revocation)
**What:** `SUPABASE_SERVICE_ROLE_KEY` in the ops-console environment.
**Why:** deactivating a login (`is_active=false`) already makes every
`/api/field/*` call reject that actor at sync — functional revocation, no key
needed. Revoking the actual Supabase **refresh token** (so a still-online device
can't mint a new access token) needs the admin API, which needs the service-role
key.
**Do:** add `SUPABASE_SERVICE_ROLE_KEY` to Vercel + `.env.local` (Supabase →
Project Settings → API → service_role secret). Until then, revocation relies on
the `is_active` gate (effective at next sync) rather than immediate token kill.
**Blocks:** the "immediate" part of revocation only; the review-queue + lockout
path works now.

---

## Real-device checklist (🟢 — you run these; I cannot)
Kept current as phases land. Airplane mode, camera/WebP capture, on-device PDF
rendering, GPS and Maps deep-links, and full offline-day + reconnect sync are
**unverified** until you test them on a real phone, however green the build is.
(Full checklist maintained at the bottom of this file as phases complete.)
