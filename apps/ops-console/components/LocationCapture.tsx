"use client";
import { useState, useTransition } from "react";
// NOTHING is imported from the actions module here — not the action, not even
// a type. That module imports requirePermission, which imports lib/auth, which
// imports "server-only" and pg; pulling any of it into the client graph breaks
// hydration for the WHOLE route, and the only symptom is Next's streaming
// scripts failing with "Cannot read properties of null (reading parentNode)".
// The action arrives as a prop; the types come from a neutral module.
import type { ResolvedLocation, ResolveLocationResult } from "@/lib/domain/location-types";

// Item 2 — capture the pin AT CREATION, because item 12 is what happens when
// you do not: a technician standing outside a building the system cannot point
// them at.
//
// Two ways in, because those are the two things a person actually has:
//   · the phone they are holding  → "Use my current location"
//   · the link someone sent them  → paste it
// Either one fills street, area, district, emirate and country from the geocode,
// so the address is never typed twice (Art. VI).
async function resolve(i: { text?: string; lat?: number; lng?: number }): Promise<ResolveLocationResult> {
  const r = await fetch("/api/location/resolve", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(i),
  });
  if (!r.ok && r.status !== 200) return { ok: false, error: "Could not reach the server. Try again." };
  return (await r.json()) as ResolveLocationResult;
}

export function LocationCapture({ compact = false }: { compact?: boolean }) {
  const [link, setLink] = useState("");
  const [loc, setLoc] = useState<ResolvedLocation | null>(null);
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();

  const apply = (r: ResolveLocationResult) => {
    if (r.ok) { setLoc(r.value); setErr(""); } else { setErr(r.error); setLoc(null); }
  };

  const fromLink = () => start(async () => apply(await resolve({ text: link })));

  const fromDevice = () => {
    setErr("");
    if (!navigator.geolocation) { setErr("This browser cannot give a location. Paste a Google Maps link instead."); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => start(async () => apply(await resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }))),
      (e) => setErr(e.code === e.PERMISSION_DENIED
        ? "Location permission was refused. Allow it in the browser, or paste a Google Maps link instead."
        : "Could not read this device's location. Paste a Google Maps link instead."),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const p = loc?.parts;
  return (
    <div className={compact ? "" : "sm:col-span-3"}>
      {/* The values that actually get submitted — filled from the geocode, never retyped. */}
      <input type="hidden" name="site_lat" value={loc?.lat ?? ""} />
      <input type="hidden" name="site_lng" value={loc?.lng ?? ""} />
      <input type="hidden" name="site_street" value={p?.street ?? ""} />
      <input type="hidden" name="site_area" value={p?.area ?? ""} />
      <input type="hidden" name="site_district" value={p?.district ?? ""} />
      <input type="hidden" name="site_country" value={p?.country ?? ""} />
      <input type="hidden" name="site_address" value={p?.formatted ?? ""} />
      {p?.emirate && <input type="hidden" name="geocoded_emirate" value={p.emirate} />}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={fromDevice} disabled={pending}
          className="rounded-lg border border-line bg-white px-3 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50">
          📍 Use my current location
        </button>
        <span className="text-xs text-muted">or paste a Google Maps link</span>
      </div>
      <div className="mt-2 flex gap-2">
        <input value={link} onChange={(e) => setLink(e.target.value)}
          onPaste={(e) => { const t = e.clipboardData.getData("text"); if (t) { setLink(t); setTimeout(() => start(async () => apply(await resolve({ text: t }))), 0); } }}
          placeholder="https://maps.app.goo.gl/…  or  25.4052, 55.5162"
          className="flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15" />
        <button type="button" onClick={fromLink} disabled={pending || !link.trim()}
          className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50">
          {pending ? "Finding…" : "Find"}
        </button>
      </div>

      {err && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{err}</p>}

      {loc && (
        <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm">
          <div className="font-medium text-emerald-900">
            📍 Pin set{loc.source === "device" ? " from this device" : loc.source === "link" ? " from the link" : ""}
          </div>
          <div className="mt-1 text-emerald-800">{p?.formatted ?? `${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}`}</div>
          <div className="mt-1 font-mono text-[11px] text-emerald-700">{loc.lat.toFixed(6)}, {loc.lng.toFixed(6)}</div>
          {p && (
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px] text-emerald-800 sm:grid-cols-4">
              <span>street: {p.street ?? "—"}</span><span>area: {p.area ?? "—"}</span>
              <span>district: {p.district ?? "—"}</span><span>emirate: {p.emirate ?? "—"}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
