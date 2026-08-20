import "server-only";

// Turning what a person actually has — a Google Maps link someone WhatsApped
// them — into coordinates and a printable address.
//
// Two problems this solves, both seen in the walkthrough:
//  1. Customers were being created with no pin, because the only way to set one
//     was to know the coordinates. Everyone has the link; nobody has the numbers.
//  2. The quotation printed "7QMM+9F Ajman Sharjah" — a plus code and two
//     emirates mashed together — because the address came from Google's
//     formatted_address, which falls back to a plus code when a place has no
//     street number, and because components were being concatenated blindly.
//     Addresses are built from address_components here, and a plus code is
//     never printed to a customer.

export interface LatLng { lat: number; lng: number }

export interface AddressParts {
  street: string | null;      // route + street_number
  area: string | null;        // sublocality / neighbourhood
  district: string | null;    // locality (the town/city)
  emirate: string | null;     // administrative_area_level_1
  country: string | null;
  formatted: string | null;   // built from the parts above, never a plus code
}

// Coordinates that appear directly in the URL. Ordered most reliable first:
// !3d/!4d is the place's own pin, @lat,lng is the map viewport centre (close
// enough, and the only thing present in many links).
const PATTERNS: RegExp[] = [
  /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,          // place data — the actual pin
  /[?&]q=(-?\d+\.\d+),\s*(-?\d+\.\d+)/,      // ?q=lat,lng
  /[?&]query=(-?\d+\.\d+),\s*(-?\d+\.\d+)/,  // ?query=lat,lng
  /[?&]ll=(-?\d+\.\d+),\s*(-?\d+\.\d+)/,     // ?ll=lat,lng
  /@(-?\d+\.\d+),(-?\d+\.\d+)/,              // /@lat,lng,17z — viewport centre
  /^\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*$/, // pasted coordinates, not a link
];

export function extractCoords(text: string): LatLng | null {
  for (const re of PATTERNS) {
    const m = re.exec(text);
    if (!m) continue;
    const lat = Number(m[1]), lng = Number(m[2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    return { lat, lng };
  }
  return null;
}

// Short links (maps.app.goo.gl, goo.gl/maps) carry no coordinates at all — they
// have to be followed. One redirect chain, a short timeout, and no throw: a
// paste that cannot be resolved must not take the form down with it.
export async function resolveMapLink(text: string): Promise<LatLng | null> {
  const direct = extractCoords(text);
  if (direct) return direct;

  const url = /https?:\/\/\S+/.exec(text)?.[0];
  if (!url || !/goo\.gl|google\.[a-z.]+\/maps/i.test(url)) return null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(url, { redirect: "follow", signal: ctrl.signal,
      headers: { "user-agent": "Mozilla/5.0 (compatible; MOP/1.0)" } });
    clearTimeout(timer);
    const fromFinalUrl = extractCoords(res.url);
    if (fromFinalUrl) return fromFinalUrl;
    // Some short links land on a consent/interstitial page whose BODY carries
    // the pin even though the URL does not.
    const body = await res.text();
    return extractCoords(body);
  } catch {
    return null;
  }
}

const KEY = () => process.env.GOOGLE_GEOCODING_API_KEY;
const GEOCODE = "https://maps.googleapis.com/maps/api/geocode/json";

// Plus codes are Google's fallback when a place has no street address. They are
// meaningful to Google Maps and meaningless on a customer's quotation.
const isPlusCode = (s: string) => /^[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3}\b/i.test(s.trim());

export async function reverseGeocodeParts(loc: LatLng): Promise<AddressParts | null> {
  const key = KEY();
  if (!key) return null;
  try {
    const res = await fetch(`${GEOCODE}?latlng=${loc.lat},${loc.lng}&key=${key}`);
    const data = await res.json();
    const results: { address_components?: { long_name: string; types: string[] }[] }[] = data.results ?? [];
    if (!results.length) return null;
    // Prefer a result that actually has a street over one that is a plus code.
    const best = results.find((r) => (r.address_components ?? []).some((c) => c.types.includes("route")))
              ?? results[0];
    const get = (t: string) =>
      (best.address_components ?? []).find((c) => c.types.includes(t))?.long_name ?? null;

    const streetNumber = get("street_number");
    const route = get("route");
    const street = [streetNumber, route].filter(Boolean).join(" ") || null;
    const area = get("sublocality_level_1") ?? get("sublocality") ?? get("neighborhood");
    const district = get("locality") ?? get("administrative_area_level_2");
    const emirate = get("administrative_area_level_1");
    const country = get("country");

    // Built from the parts, de-duplicated, plus codes dropped. "Ajman Sharjah"
    // came from printing two administrative levels that happened to disagree;
    // taking each level once, in order, is what stops that.
    const seen = new Set<string>();
    const formatted = [street, area, district, emirate, country]
      .filter((p): p is string => !!p && !isPlusCode(p))
      .filter((p) => { const k = p.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
      .join(", ") || null;

    return { street, area, district, emirate, country, formatted };
  } catch {
    return null;
  }
}
