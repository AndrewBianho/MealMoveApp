"use client";

import "mapbox-gl/dist/mapbox-gl.css";
import { useEffect, useRef, useState } from "react";
import type {
  Map as MapboxMap,
  Marker as MapboxMarker,
  GeoJSONSource,
} from "mapbox-gl";
import type { FeatureCollection } from "geojson";
import { rankDropOffs } from "@/lib/recommend";
import type { DropOffLocation, MapRestaurant } from "@/lib/types";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
const REST = "#3B6D11"; // rescued-600 — restaurants
const DROP = "#185FA5"; // transit-600 — drop-offs
const REC = "#BA7517"; // urgent-600 — recommended highlight

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string
  );
}

function boundsOf(pts: [number, number][]): [[number, number], [number, number]] {
  const lngs = pts.map((p) => p[0]);
  const lats = pts.map((p) => p[1]);
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
}

const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };

export function RescueMap({
  restaurants,
  dropOffs,
}: {
  restaurants: MapRestaurant[];
  dropOffs: DropOffLocation[];
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap>();
  const restMarkers = useRef(new Map<string, MapboxMarker>());
  const dropMarkers = useRef(new Map<string, MapboxMarker>());
  const [selected, setSelected] = useState<string | null>(null);

  const selectedRest = selected
    ? restaurants.find((r) => r.id === selected) ?? null
    : null;
  const recommendation = selectedRest
    ? rankDropOffs(selectedRest, dropOffs).find((x) => x.eligible) ?? null
    : null;

  // Build the map once (restaurants + drop-offs are stable per page load).
  useEffect(() => {
    if (!TOKEN || !container.current) return;
    let cancelled = false;
    const rMarkers = restMarkers.current;
    const dMarkers = dropMarkers.current;

    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled || !container.current) return;
      mapboxgl.accessToken = TOKEN;

      const map = new mapboxgl.Map({
        container: container.current,
        style: "mapbox://styles/mapbox/light-v11",
        center: [-75.34, 40.04],
        zoom: 13,
      });
      mapRef.current = map;
      map.addControl(new mapboxgl.NavigationControl(), "top-right");
      map.addControl(
        new mapboxgl.GeolocateControl({
          positionOptions: { enableHighAccuracy: true },
          trackUserLocation: true,
          showUserHeading: true,
        }),
        "top-right"
      );

      // Restaurant markers — round, green; clicking isolates.
      for (const r of restaurants) {
        const el = document.createElement("div");
        // No transform/transition on the marker root — Mapbox owns its transform
        // for positioning; styling it would make the pin lag the map.
        el.style.cssText = `width:20px;height:20px;border-radius:50%;background:${REST};border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.25);cursor:pointer;`;
        el.addEventListener("click", (ev) => {
          ev.stopPropagation();
          setSelected((cur) => (cur === r.id ? null : r.id));
        });
        const popup = new mapboxgl.Popup({ offset: 14, closeButton: false }).setHTML(
          `<div style="font-family:-apple-system,system-ui,sans-serif;">
             <div style="font-size:13px;font-weight:500;">${esc(r.name)}</div>
             <div style="color:#5F5E5A;font-family:monospace;font-size:11px;margin:2px 0;">${r.count} listing${r.count > 1 ? "s" : ""} · ${r.servings} servings</div>
             <div style="color:#5F5E5A;font-size:12px;">${esc(r.categories.join(", "))}${r.perishable ? " · perishable" : ""}</div>
             <div style="color:#3B6D11;font-size:12px;font-weight:500;margin-top:4px;">Click pin → eligible drop-offs</div>
           </div>`
        );
        restMarkers.current.set(
          r.id,
          new mapboxgl.Marker(el).setLngLat([r.lng, r.lat]).setPopup(popup).addTo(map)
        );
      }

      // Drop-off markers — square, blue; popup shows constraints.
      for (const d of dropOffs) {
        // Root is the positioned element (Mapbox sets its transform); the inner
        // dot carries the visual so highlight scaling never disturbs position.
        const el = document.createElement("div");
        el.style.cssText = `width:18px;height:18px;cursor:pointer;`;
        const dot = document.createElement("div");
        dot.style.cssText = `width:18px;height:18px;border-radius:4px;background:${DROP};border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.25);transition:transform .12s,outline .12s;`;
        el.appendChild(dot);
        const popup = new mapboxgl.Popup({ offset: 14, closeButton: false }).setHTML(
          `<div style="font-family:-apple-system,system-ui,sans-serif;">
             <div style="font-size:13px;font-weight:500;">${esc(d.name)}</div>
             <div style="color:#5F5E5A;font-family:monospace;font-size:11px;margin:2px 0;">accepts: ${esc(d.acceptedCategories.join(", "))}</div>
             <div style="color:#5F5E5A;font-size:12px;">${d.refrigerated ? "❄ refrigerated" : "not refrigerated"} · holds ${d.capacity}</div>
             ${d.notes ? `<div style="color:#5F5E5A;font-size:12px;margin-top:4px;">${esc(d.notes)}</div>` : ""}
           </div>`
        );
        dropMarkers.current.set(
          d.id,
          new mapboxgl.Marker(el).setLngLat([d.lng, d.lat]).setPopup(popup).addTo(map)
        );
      }

      map.on("click", () => setSelected(null)); // click empty space to reset

      map.on("load", () => {
        map.addSource("rec-line", { type: "geojson", data: EMPTY });
        map.addLayer({
          id: "rec-line",
          type: "line",
          source: "rec-line",
          paint: { "line-color": REC, "line-width": 2, "line-dasharray": [2, 1] },
        });
        const pts = [
          ...restaurants.map((r) => [r.lng, r.lat]),
          ...dropOffs.map((d) => [d.lng, d.lat]),
        ] as [number, number][];
        if (pts.length > 1) map.fitBounds(boundsOf(pts), { padding: 64, maxZoom: 15 });
      });
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = undefined;
      rMarkers.clear();
      dMarkers.clear();
    };
  }, [restaurants, dropOffs]);

  // Apply isolation whenever the selection changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || restMarkers.current.size === 0) return;

    const apply = () => {
      const r = selected ? restaurants.find((x) => x.id === selected) : null;
      const ranked = r ? rankDropOffs(r, dropOffs) : [];
      const eligibleIds = new Set(
        ranked.filter((x) => x.eligible).map((x) => x.dropOff.id)
      );
      const recId = ranked.find((x) => x.eligible)?.dropOff.id ?? null;

      restMarkers.current.forEach((m, id) => {
        m.getElement().style.display = !selected || id === selected ? "" : "none";
      });

      dropMarkers.current.forEach((m, id) => {
        const el = m.getElement();
        const dot = el.firstElementChild as HTMLElement | null;
        if (!selected) {
          el.style.display = "";
          if (dot) {
            dot.style.outline = "";
            dot.style.transform = "";
          }
          return;
        }
        if (eligibleIds.has(id)) {
          el.style.display = "";
          const isRec = id === recId;
          if (dot) {
            dot.style.outline = isRec ? `3px solid ${REC}` : "";
            dot.style.outlineOffset = isRec ? "2px" : "";
            dot.style.transform = isRec ? "scale(1.3)" : "";
          }
        } else {
          el.style.display = "none";
        }
      });

      const src = map.getSource("rec-line") as GeoJSONSource | undefined;
      if (src) {
        const rec = recId ? dropOffs.find((d) => d.id === recId) : null;
        src.setData(
          r && rec
            ? {
                type: "FeatureCollection",
                features: [
                  {
                    type: "Feature",
                    properties: {},
                    geometry: {
                      type: "LineString",
                      coordinates: [
                        [r.lng, r.lat],
                        [rec.lng, rec.lat],
                      ],
                    },
                  },
                ],
              }
            : EMPTY
        );
      }

      if (r) {
        const elig = ranked.filter((x) => x.eligible).map((x) => x.dropOff);
        const pts = [
          [r.lng, r.lat],
          ...elig.map((d) => [d.lng, d.lat]),
        ] as [number, number][];
        if (pts.length > 1) map.fitBounds(boundsOf(pts), { padding: 90, maxZoom: 15 });
      }
    };

    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [selected, restaurants, dropOffs]);

  if (!TOKEN) {
    return (
      <div className="grid h-[60vh] place-items-center rounded-xl border border-dashed border-neutral-200 bg-white text-center">
        <div>
          <p className="text-sm text-neutral-600">The map needs a Mapbox token.</p>
          <p className="mt-1 font-mono text-xs text-neutral-400">
            Add NEXT_PUBLIC_MAPBOX_TOKEN to Code/.env, then restart the dev server.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <div
        ref={container}
        className="h-[60vh] w-full overflow-hidden rounded-xl border border-neutral-200/40"
      />

      {/* Legend */}
      <div className="absolute left-3 top-3 space-y-1 rounded-md border border-neutral-200/60 bg-white/95 px-3 py-2 text-xs text-neutral-700">
        <div className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-full" style={{ background: REST }} />
          Restaurant
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-[3px]" style={{ background: DROP }} />
          Drop-off
        </div>
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-3 w-3 rounded-[3px]"
            style={{ background: DROP, outline: `2px solid ${REC}`, outlineOffset: "1px" }}
          />
          Recommended
        </div>
      </div>

      {/* Selection bar */}
      {selectedRest && (
        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-3 rounded-md border border-neutral-200/60 bg-white/95 px-4 py-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{selectedRest.name}</div>
            <div className="truncate font-mono text-xs text-neutral-600">
              {recommendation
                ? `→ ${recommendation.dropOff.name} · ${recommendation.miles.toFixed(1)} mi`
                : "no eligible drop-off for this food"}
            </div>
          </div>
          <button
            onClick={() => setSelected(null)}
            className="shrink-0 text-sm font-medium text-rescued-600 hover:underline"
          >
            Show all
          </button>
        </div>
      )}
    </div>
  );
}
