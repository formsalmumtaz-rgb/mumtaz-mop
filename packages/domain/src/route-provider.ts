// RouteProvider — the single seam between MOP business logic and any mapping /
// routing provider (Google, HERE, Mapbox, TomTom, VROOM, OR-Tools).
// Constitution Art. XVII §5: switching providers replaces only the implementation,
// never scheduling logic. NO implementation exists yet — Google lands in Phase 4
// (DECISIONS §1.2); VROOM/ORS is the documented availability fallback (Art. XVII §2).

export interface LatLng {
  lat: number;
  lng: number;
}

export interface GeocodeResult {
  location: LatLng;
  formattedAddress?: string;
  placeId?: string;
  partialMatch?: boolean;
}

export interface TravelEstimate {
  durationSeconds: number;
  distanceMeters: number;
}

export interface RouteStop {
  id: string;
  location: LatLng;
  serviceMinutes?: number;
  timeWindow?: { start: string; end: string };
  requiredSkills?: string[];
}

export interface RouteVehicle {
  id: string;
  start: LatLng;
  end?: LatLng;
  skills?: string[];
  shift?: { start: string; end: string };
}

export interface OptimisedRoute {
  vehicleId: string;
  orderedStopIds: string[];
  etaByStopId?: Record<string, string>;
  totalDistanceMeters?: number;
  totalDurationSeconds?: number;
}

/**
 * The only interface MOP business logic may depend on for mapping/routing.
 * Never import a provider SDK directly from scheduling or any domain code.
 */
export interface RouteProvider {
  /** Address string -> coordinates. Server-side only. */
  geocode(address: string): Promise<GeocodeResult | null>;
  /** Coordinates -> human-readable label (a suggestion; a human confirms it). */
  reverseGeocode(location: LatLng): Promise<string | null>;
  /** Travel time/distance estimate, traffic-aware where the provider supports it. */
  eta(from: LatLng, to: LatLng, departAt?: Date): Promise<TravelEstimate | null>;
  /** Sequence stops across vehicles honouring skills/time windows. Phase 4. */
  optimiseRoute(input: { vehicles: RouteVehicle[]; stops: RouteStop[] }): Promise<OptimisedRoute[]>;
}

/** Thrown by any call attempted before a provider is wired (pre-Phase 4). */
export class RouteProviderNotConfiguredError extends Error {
  constructor() {
    super("No RouteProvider is configured — mapping/routing is deferred to Phase 4 (Art. XVII).");
    this.name = "RouteProviderNotConfiguredError";
  }
}
