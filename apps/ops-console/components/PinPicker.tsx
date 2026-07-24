"use client";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";

// Click-to-drop GPS pin picker. MapLibre GL (MIT, no API key) with OpenStreetMap
// raster tiles as a demo quick-start. Production switches to self-hosted
// Protomaps PMTiles on R2 (CONTEXT §9; tracked as future work).
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
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);

  useEffect(() => {
    let map: import("maplibre-gl").Map | undefined;
    let marker: import("maplibre-gl").Marker | undefined;
    let cancelled = false;

    (async () => {
      const maplibregl = (await import("maplibre-gl")).default;
      if (cancelled || !containerRef.current) return;
      map = new maplibregl.Map({
        container: containerRef.current,
        style: {
          version: 8,
          sources: {
            osm: {
              type: "raster",
              tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
              tileSize: 256,
              attribution: "© OpenStreetMap contributors",
            },
          },
          layers: [{ id: "osm", type: "raster", source: "osm" }],
        },
        center: [initialLng, initialLat],
        zoom: 10,
      });
      map.addControl(new maplibregl.NavigationControl(), "top-right");
      map.on("click", (e) => {
        const { lng: clng, lat: clat } = e.lngLat;
        setLat(clat);
        setLng(clng);
        if (marker) marker.setLngLat([clng, clat]);
        else marker = new maplibregl.Marker({ color: "#A31E22" }).setLngLat([clng, clat]).addTo(map!);
      });
    })();

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [initialLat, initialLng]);

  return (
    <div>
      <div ref={containerRef} className="h-72 w-full overflow-hidden rounded border border-neutral-300" />
      <input type="hidden" name={`${name}_lat`} value={lat ?? ""} />
      <input type="hidden" name={`${name}_lng`} value={lng ?? ""} />
      <p className="mt-1 text-xs text-neutral-500">
        {lat != null ? (
          <>Pin set: <span className="font-mono">{lat.toFixed(5)}, {lng!.toFixed(5)}</span></>
        ) : (
          "Click the map to drop a GPS pin (optional)."
        )}
      </p>
    </div>
  );
}
