"use client";
import { useState } from "react";

// Fast location capture for ad-hoc jobs — no geocoding call. Either use the
// device's current GPS, or paste a Google Maps link and parse the coordinates
// out of it. Writes lat/lng into hidden form inputs.
export function QuickLocation({ name = "location" }: { name?: string }) {
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [status, setStatus] = useState("");

  const useMyLocation = () => {
    if (!("geolocation" in navigator)) {
      setStatus("Geolocation not available on this device.");
      return;
    }
    setStatus("Locating…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude);
        setLng(pos.coords.longitude);
        setStatus("");
      },
      () => setStatus("Couldn't get your location — paste a Google Maps link instead."),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const parseLink = (url: string) => {
    if (!url.trim()) return;
    const m =
      url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) ||
      url.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/) ||
      url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
    if (m) {
      setLat(parseFloat(m[1]));
      setLng(parseFloat(m[2]));
      setStatus("");
    } else {
      setStatus("No coordinates in that link. Open it in Google Maps and copy the full URL (a short goo.gl link won't contain coordinates).");
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={useMyLocation}
          className="rounded bg-neutral-800 px-3 py-2 text-sm font-medium text-white"
        >
          📍 Use my current location
        </button>
        <input
          onChange={(e) => parseLink(e.target.value)}
          placeholder="…or paste a Google Maps link"
          className="min-w-[12rem] flex-1 rounded border border-neutral-300 px-2 py-2 text-sm"
        />
      </div>
      <input type="hidden" name={`${name}_lat`} value={lat ?? ""} />
      <input type="hidden" name={`${name}_lng`} value={lng ?? ""} />
      <p className="text-xs text-neutral-500">
        {lat != null ? (
          <>Location set: <span className="font-mono">{lat.toFixed(5)}, {lng!.toFixed(5)}</span></>
        ) : (
          status || "Optional — capture where the job is."
        )}
      </p>
    </div>
  );
}
