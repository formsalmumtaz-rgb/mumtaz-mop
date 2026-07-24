import "server-only";
import type {
  RouteProvider,
  GeocodeResult,
  LatLng,
  TravelEstimate,
  OptimisedRoute,
} from "@mop/domain";
import { RouteProviderNotConfiguredError } from "@mop/domain";

// Partial Google implementation of RouteProvider. Geocoding is live now
// (server-side only, server key); ETA and route optimisation are deferred to
// Phase 4 and throw until then (Art. XVII, DECISIONS §2.B). Business logic
// depends on the RouteProvider interface, never on this class directly.
const KEY = process.env.GOOGLE_GEOCODING_API_KEY;
const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";

class GoogleRouteProvider implements RouteProvider {
  async geocode(address: string): Promise<GeocodeResult | null> {
    if (!KEY) throw new Error("GOOGLE_GEOCODING_API_KEY is not set");
    const url = `${GEOCODE_URL}?address=${encodeURIComponent(address)}&components=country:AE&key=${KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.status !== "OK" || !data.results?.[0]) return null;
    const r = data.results[0];
    return {
      location: { lat: r.geometry.location.lat, lng: r.geometry.location.lng },
      formattedAddress: r.formatted_address,
      placeId: r.place_id,
      partialMatch: !!r.partial_match,
    };
  }

  async reverseGeocode(location: LatLng): Promise<string | null> {
    if (!KEY) throw new Error("GOOGLE_GEOCODING_API_KEY is not set");
    const url = `${GEOCODE_URL}?latlng=${location.lat},${location.lng}&key=${KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    return data.results?.[0]?.formatted_address ?? null;
  }

  // Phase 4 (behind the same interface; Google Route Optimization / VROOM fallback).
  async eta(): Promise<TravelEstimate | null> {
    throw new RouteProviderNotConfiguredError();
  }
  async optimiseRoute(): Promise<OptimisedRoute[]> {
    throw new RouteProviderNotConfiguredError();
  }
}

export const routeProvider: RouteProvider = new GoogleRouteProvider();
