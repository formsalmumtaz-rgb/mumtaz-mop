import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { authEnforced } from "@/lib/auth-flags";
import { extractCoords, resolveMapLink, reverseGeocodeParts } from "@/lib/domain/maplink";
import type { ResolveLocationResult } from "@/lib/domain/location-types";

// Item 2c — turn a pasted Google Maps link, or the device's coordinates, into a
// pin and a printable address.
//
// A ROUTE HANDLER rather than a server action, deliberately. The action version
// lived in a "use server" module that imports requirePermission → lib/auth →
// "server-only" and pg. Passing it to a client component as a prop, or importing
// it there, pulled that graph toward the browser and broke hydration for the
// entire /surveys route — React never attached, the form rendered as inert HTML,
// and the only clue was Next's streaming scripts failing with "Cannot read
// properties of null (reading 'parentNode')". A fetch has no such edge.
//
// Geocoding stays server-side either way (Art. XVII §4 — the key never reaches
// the browser).
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  if (authEnforced()) {
    const s = await getSession();
    if (!s || !s.permissions.has("customer.edit")) {
      return NextResponse.json({ ok: false, error: "Not authorised." } satisfies ResolveLocationResult, { status: 403 });
    }
  }
  const body = (await req.json().catch(() => ({}))) as { text?: string; lat?: number; lng?: number };

  if (body.lat != null && body.lng != null) {
    const parts = await reverseGeocodeParts({ lat: body.lat, lng: body.lng });
    return NextResponse.json({ ok: true, value: { lat: body.lat, lng: body.lng, parts, source: "device" } } satisfies ResolveLocationResult);
  }

  const text = (body.text ?? "").trim();
  if (!text) {
    return NextResponse.json({ ok: false, error: "Paste a Google Maps link, or use the location button." } satisfies ResolveLocationResult);
  }
  const direct = extractCoords(text);
  const loc = direct ?? await resolveMapLink(text);
  if (!loc) {
    return NextResponse.json({ ok: false, error:
      "Could not find coordinates in that. Open the place in Google Maps, tap Share → Copy link, and paste the whole link — or paste coordinates as “25.4052, 55.5162”." } satisfies ResolveLocationResult);
  }
  const parts = await reverseGeocodeParts(loc);
  return NextResponse.json({ ok: true, value: { lat: loc.lat, lng: loc.lng, parts, source: direct ? "coordinates" : "link" } } satisfies ResolveLocationResult);
}
