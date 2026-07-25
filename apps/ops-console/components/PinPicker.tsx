"use client";
import { useEffect, useRef, useState } from "react";
import { Loader } from "@googlemaps/js-api-loader";
import { geocodeAddressAction } from "@/app/actions/geocode";

// Google Maps GPS pin picker. The BROWSER key renders the map ONLY (Maps
// JavaScript API). Address lookup goes to a SERVER action that geocodes with the
// server key — no geocoding runs in the browser (Art. XVII §4).
const BROWSER_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY;

export function PinPicker({
  name = "location",
  initialLat = 25.3463, // Sharjah
  initialLng = 55.4209,
}: {
  name?: string;
  initialLat?: number;
  initialLng?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const resizeObs = useRef<ResizeObserver | null>(null);

  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [addr, setAddr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const place = (la: number, ln: number, recenter = false) => {
    setLat(la);
    setLng(ln);
    const pos = { lat: la, lng: ln };
    if (markerRef.current) markerRef.current.setPosition(pos);
    else if (mapRef.current) markerRef.current = new google.maps.Marker({ map: mapRef.current, position: pos });
    if (recenter && mapRef.current) {
      mapRef.current.setCenter(pos);
      mapRef.current.setZoom(15);
    }
  };

  useEffect(() => {
    if (!BROWSER_KEY) return;
    let cancelled = false;

    // Only create the map once the container is actually visible (non-zero size).
    // Google Maps painted inside a collapsed <details> stays blank forever, so we
    // wait for size (e.g. the panel opening) before initialising.
    const initMap = async () => {
      const el = containerRef.current;
      if (cancelled || mapRef.current || !el) return;
      const loader = new Loader({ apiKey: BROWSER_KEY, version: "weekly", libraries: ["maps", "marker"] });
      await loader.load();
      if (cancelled || mapRef.current || !containerRef.current) return;
      const map = new google.maps.Map(containerRef.current, {
        center: { lat: initialLat, lng: initialLng },
        zoom: 11,
        streetViewControl: false,
        mapTypeControl: false,
        fullscreenControl: false,
        // Raster tiles render without WebGL — robust on low-end devices and
        // GPU-less environments (vector needs a real GPU).
        renderingType: google.maps.RenderingType.RASTER,
      });
      mapRef.current = map;
      map.addListener("click", (e: google.maps.MapMouseEvent) => {
        if (e.latLng) place(e.latLng.lat(), e.latLng.lng());
      });
    };

    const el = containerRef.current;
    if (el && el.offsetWidth > 0 && el.offsetHeight > 0) {
      initMap().catch(() => setMsg("Could not load Google Maps (check the browser key's domain restriction)."));
    } else if (el) {
      resizeObs.current = new ResizeObserver(() => {
        if (el.offsetWidth > 0 && el.offsetHeight > 0 && !mapRef.current) {
          initMap().catch(() => setMsg("Could not load Google Maps (check the browser key's domain restriction)."));
        }
      });
      resizeObs.current.observe(el);
    }

    return () => {
      cancelled = true;
      resizeObs.current?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLat, initialLng]);

  const findAddress = async () => {
    if (!addr.trim()) return;
    setBusy(true);
    setMsg("");
    const r = await geocodeAddressAction(addr); // server-side geocode
    setBusy(false);
    if (r) place(r.lat, r.lng, true);
    else setMsg("Address not found — try a nearby landmark, or click the map.");
  };

  if (!BROWSER_KEY) {
    return (
      <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
        Google Maps browser key not set — add{" "}
        <code className="rounded bg-amber-100 px-1">NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY</code> to{" "}
        <code className="rounded bg-amber-100 px-1">.env.local</code> to enable the map. A site can still be saved without a pin.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 flex gap-2">
        <input
          value={addr}
          onChange={(e) => setAddr(e.target.value)}
          placeholder="Type an address to locate"
          className="flex-1 rounded border border-neutral-300 px-2 py-1 text-sm"
        />
        <button
          type="button"
          onClick={findAddress}
          disabled={busy}
          className="rounded border border-neutral-300 px-3 py-1 text-sm disabled:opacity-50"
        >
          {busy ? "Finding…" : "Find on map"}
        </button>
      </div>
      <div ref={containerRef} className="h-72 w-full overflow-hidden rounded border border-neutral-300" />
      <input type="hidden" name={`${name}_lat`} value={lat ?? ""} />
      <input type="hidden" name={`${name}_lng`} value={lng ?? ""} />
      <p className="mt-1 text-xs text-neutral-500">
        {lat != null ? (
          <>Pin set: <span className="font-mono">{lat.toFixed(5)}, {lng!.toFixed(5)}</span></>
        ) : (
          msg || "Search an address or click the map to drop a GPS pin (optional)."
        )}
      </p>
    </div>
  );
}
