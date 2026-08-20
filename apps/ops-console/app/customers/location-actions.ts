"use server";
import { requirePermission } from "@/lib/auth";
import { extractCoords, resolveMapLink, reverseGeocodeParts, type AddressParts } from "@/lib/domain/maplink";

// Item 2c — turn what the user has into a pin and an address.
//
// Server-side because geocoding is server-side only (Art. XVII §4: the
// Geocoding key never reaches the browser) and because short links have to be
// followed, which the browser cannot do cross-origin.
export interface ResolvedLocation {
  lat: number; lng: number;
  parts: AddressParts | null;
  source: "link" | "coordinates" | "device";
}

export async function resolveLocationAction(
  input: { text?: string; lat?: number; lng?: number },
): Promise<{ ok: true; value: ResolvedLocation } | { ok: false; error: string }> {
  await requirePermission("customer.edit");

  // Device GPS — coordinates arrive already resolved, we only name the place.
  if (input.lat != null && input.lng != null) {
    const parts = await reverseGeocodeParts({ lat: input.lat, lng: input.lng });
    return { ok: true, value: { lat: input.lat, lng: input.lng, parts, source: "device" } };
  }

  const text = (input.text ?? "").trim();
  if (!text) return { ok: false, error: "Paste a Google Maps link, or use the location button." };

  const direct = extractCoords(text);
  const loc = direct ?? await resolveMapLink(text);
  if (!loc) {
    return { ok: false, error:
      "Could not find coordinates in that. Open the place in Google Maps, tap Share → Copy link, and paste the whole link — or paste coordinates as “25.4052, 55.5162”." };
  }
  const parts = await reverseGeocodeParts(loc);
  return { ok: true, value: { lat: loc.lat, lng: loc.lng, parts, source: direct ? "coordinates" : "link" } };
}
