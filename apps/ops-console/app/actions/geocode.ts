"use server";
import { routeProvider } from "@/lib/route-provider";

// Server action: geocode an address for the pin picker. Runs server-side only,
// with the server key (Art. XVII §4). Returns coordinates or null.
export async function geocodeAddressAction(
  address: string,
): Promise<{ lat: number; lng: number; label?: string } | null> {
  const clean = (address ?? "").trim();
  if (!clean) return null;
  try {
    const r = await routeProvider.geocode(clean);
    if (!r) return null;
    return { lat: r.location.lat, lng: r.location.lng, label: r.formattedAddress };
  } catch {
    return null;
  }
}
