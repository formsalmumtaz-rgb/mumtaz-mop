// Shared shapes for location capture.
//
// Deliberately NOT in the "use server" actions file. A client component that
// imports from a "use server" module — even `import type` — creates an edge
// into the server graph, and it silently broke hydration on the whole survey
// page: React never attached, the form rendered as inert HTML, and the only
// visible symptom was Next's streaming scripts failing with "Cannot read
// properties of null (reading 'parentNode')" a hundred lines into the console.
//
// Types live here; the action stays in the actions file; neither imports the
// other's module.
export interface LatLng { lat: number; lng: number }

export interface AddressParts {
  street: string | null;
  area: string | null;
  district: string | null;
  emirate: string | null;
  country: string | null;
  formatted: string | null;   // built from the parts, never a plus code
}

export interface ResolvedLocation {
  lat: number;
  lng: number;
  parts: AddressParts | null;
  source: "link" | "coordinates" | "device";
}

export type ResolveLocationResult =
  | { ok: true; value: ResolvedLocation }
  | { ok: false; error: string };
