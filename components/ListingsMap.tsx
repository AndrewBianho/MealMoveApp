"use client";

import "mapbox-gl/dist/mapbox-gl.css";
import { useEffect, useRef, useState } from "react";
import type { Map as MapboxMap } from "mapbox-gl";
import type { Listing } from "@/lib/types";
import { cn } from "./cn";
import { escapeHtml } from "@/lib/escapeHtml";
import { RAMP } from "@/lib/rampColors";
import { MAP_STYLES, createModeToggle, createHomeControl, type MapMode } from "@/lib/mapStyles";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

// White utensils glyph so each pin reads as "food here" at a glance and stands
// off the satellite imagery — mirrors the restaurant pin in RescueMap.
const ICON_LISTING = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7a2 2 0 0 0 2 2 2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1 1 2 2 2h3Zm0 0v7"/></svg>`;

// Flag glyph for drop-off destination pins — mirrors RescueMap's drop-off flag
// so a destination reads the same on both maps.
const ICON_DROP = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/></svg>`;

/** A drop-off destination pin — clay, flag glyph, optionally selectable. */
export interface MapDropOffPin {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

// Same urgency palette as the listing-card strip; hex mirrors the ramp tokens
// via lib/rampColors (raw-DOM pins can't read Tailwind).
function urgencyColor(l: Listing): string {
  if (["delivered", "expired", "failed"].includes(l.status)) return RAMP.neutral400;
  if (l.minutesLeft < 10) return RAMP.failed400;
  if (l.minutesLeft < 35) return RAMP.urgent600;
  // Plenty of time: plum, not sage — sage disappears into the green of the
  // satellite imagery, plum stands off it. (Urgent/closing keep honey/tomato.)
  return RAMP.transit600;
}

// Great-circle distance in miles.
function milesBetween(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

type Located = Listing & { lat: number; lng: number };

// Base badge for a drop-off pin; the selected one gains an ink halo (the same
// selection hue RescueMap uses — visible on the clay fill, and always paired
// with the picker's labelled selection so it never reads by hue alone).
function dropPinStyle(selected: boolean): string {
  return (
    `width:30px;height:30px;border-radius:50%;background:${RAMP.clay600};` +
    `border:3px solid #fff;display:grid;place-items:center;cursor:pointer;` +
    `box-shadow:${selected ? `0 0 0 3px ${RAMP.ink},` : "0 0 0 1.5px rgba(0,0,0,.18),"}` +
    `0 4px 10px rgba(51,52,44,.42);`
  );
}

function popupHtml(l: Located, distanceMi?: number): string {
  const distance =
    distanceMi != null
      ? `<div style="color:rgb(var(--clay-800));font-family:var(--font-sans),system-ui,sans-serif;font-size:11px;margin-bottom:6px;">${distanceMi.toFixed(1)} mi from you</div>`
      : "";
  return `<div style="font-family:var(--font-sans),system-ui,sans-serif;">
      <div style="font-family:var(--font-display),Georgia,serif;font-size:17px;font-weight:600;color:rgb(var(--n-900));">${escapeHtml(l.title)}</div>
      <div style="color:rgb(var(--n-600));font-family:var(--font-sans),system-ui,sans-serif;font-size:11px;margin:2px 0 6px;">${escapeHtml(l.source)} · ~${l.servings} servings</div>
      ${distance}
      <a href="/listings/${l.id}" style="display:inline-block;margin-top:8px;background:${RAMP.rescued600};color:#fff;font-size:14px;font-weight:600;padding:11px 16px;border-radius:9999px;text-decoration:none;">View listing →</a>
    </div>`;
}

// `className` controls the map's height/shape, so the same map can be the full
// 60vh panel in the toggle view or fill a tall sticky column in the wide
// side-by-side layout. Defaults to the standalone panel height.
export function ListingsMap({
  listings,
  dropOffs = [],
  selectedDropOffId = null,
  onSelectDropOff,
  className = "h-[60vh]",
}: {
  listings: Listing[];
  /** Drop-off destination pins (clay flag) — the listing detail side map uses
   * these to place the destination choices next to the pickup. */
  dropOffs?: MapDropOffPin[];
  /** Highlighted drop-off — an ink halo, mirroring RescueMap's selection cue. */
  selectedDropOffId?: string | null;
  /** When set, tapping a drop-off pin selects it (wired to the detail picker). */
  onSelectDropOff?: (id: string) => void;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap>();
  const [mode, setMode] = useState<MapMode>("satellite");
  const modeRef = useRef(mode);
  modeRef.current = mode;
  // Raw-DOM marker elements by drop-off id, so the selection halo can restyle
  // them without rebuilding the map.
  const dropElsRef = useRef<globalThis.Map<string, HTMLDivElement>>(new globalThis.Map());
  const selectedRef = useRef(selectedDropOffId);
  selectedRef.current = selectedDropOffId;
  const onSelectRef = useRef(onSelectDropOff);
  onSelectRef.current = onSelectDropOff;

  useEffect(() => {
    if (!TOKEN || !ref.current) return;
    const withCoords = listings.filter(
      (l): l is Located => typeof l.lat === "number" && typeof l.lng === "number"
    );
    // Stable handle for creation and cleanup within this effect run.
    const dropEls = dropElsRef.current;

    let map: MapboxMap | undefined;
    let cancelled = false;

    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled || !ref.current) return;
      mapboxgl.accessToken = TOKEN;

      map = new mapboxgl.Map({
        container: ref.current,
        style: MAP_STYLES[modeRef.current],
        center: withCoords.length
          ? [withCoords[0].lng, withCoords[0].lat]
          : [-75.34, 40.04],
        zoom: 13,
      });
      mapRef.current = map;

      // Frame the map to fit all pins — listings and any drop-off destinations
      // (the "good zoom"); used on load and by the home button.
      const points: [number, number][] = [
        ...withCoords.map((l) => [l.lng, l.lat] as [number, number]),
        ...dropOffs.map((d) => [d.lng, d.lat] as [number, number]),
      ];
      const resetView = () => {
        if (!map) return;
        if (points.length > 1) {
          const bounds = new mapboxgl.LngLatBounds();
          points.forEach((p) => bounds.extend(p));
          map.fitBounds(bounds, { padding: 64, maxZoom: 15, bearing: 0, pitch: 0 });
        } else {
          map.flyTo({
            center: points[0] ?? [-75.34, 40.04],
            zoom: 13,
            bearing: 0,
            pitch: 0,
          });
        }
      };

      // Compass only — zoom +/- is handled by pinch/scroll; the home button
      // restores the framed view.
      map.addControl(
        new mapboxgl.NavigationControl({ showZoom: false, showCompass: true }),
        "top-right"
      );
      map.addControl(createHomeControl({ onClick: resetView }), "top-right");
      map.addControl(
        createModeToggle({ initial: modeRef.current, onChange: setMode }),
        "top-right"
      );

      // "You are here" — live location with a recenter button.
      const geolocate = new mapboxgl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
        showUserHeading: true,
      });
      map.addControl(geolocate, "top-right");

      const entries = withCoords.map((l) => {
        const el = document.createElement("div");
        // A glyph badge with a crisp double-shadow — a dark hairline ring for
        // edge definition on bright imagery, a soft drop to lift off the map.
        el.style.cssText = `width:30px;height:30px;border-radius:50%;background:${urgencyColor(l)};border:3px solid #fff;box-shadow:0 0 0 1.5px rgba(0,0,0,.18),0 4px 10px rgba(51,52,44,.42);display:grid;place-items:center;cursor:pointer;`;
        el.innerHTML = ICON_LISTING;
        const popup = new mapboxgl.Popup({ offset: 16, closeButton: false }).setHTML(
          popupHtml(l)
        );
        new mapboxgl.Marker(el).setLngLat([l.lng, l.lat]).setPopup(popup).addTo(map!);
        return { listing: l, popup };
      });

      // Drop-off destination pins — clay flag badges. On the listing detail
      // side map, tapping one selects it in the picker (onSelectDropOff).
      dropEls.clear();
      for (const d of dropOffs) {
        const el = document.createElement("div");
        el.style.cssText = dropPinStyle(selectedRef.current === d.id);
        el.innerHTML = ICON_DROP;
        el.setAttribute("role", onSelectRef.current ? "button" : "img");
        el.setAttribute("aria-label", `Drop-off: ${d.name}`);
        const popup = new mapboxgl.Popup({ offset: 16, closeButton: false }).setHTML(
          `<div style="font-family:var(--font-sans),system-ui,sans-serif;">
            <div style="font-family:var(--font-display),Georgia,serif;font-size:15px;font-weight:600;color:rgb(var(--n-900));">${escapeHtml(d.name)}</div>
            <div style="color:rgb(var(--n-600));font-family:var(--font-mono),monospace;font-size:10px;letter-spacing:.05em;text-transform:uppercase;margin-top:2px;">drop-off</div>
          </div>`
        );
        el.addEventListener("click", () => onSelectRef.current?.(d.id));
        new mapboxgl.Marker(el).setLngLat([d.lng, d.lat]).setPopup(popup).addTo(map!);
        dropEls.set(d.id, el);
      }

      // Once located, fold "distance from you" into every popup.
      geolocate.on("geolocate", (e) => {
        const { latitude, longitude } = (e as GeolocationPosition).coords;
        for (const { listing, popup } of entries) {
          const d = milesBetween(latitude, longitude, listing.lat, listing.lng);
          popup.setHTML(popupHtml(listing, d));
        }
      });

      map.on("load", () => {
        if (points.length > 1) resetView();
        // Auto-locate the volunteer (prompts for permission; harmless if denied).
        geolocate.trigger();
      });
    })();

    return () => {
      cancelled = true;
      dropEls.clear();
      map?.remove();
      mapRef.current = undefined;
    };
  }, [listings, dropOffs]);

  // Restyle the drop-off halo when the picker selection changes — the markers
  // are raw DOM, so this bypasses React and never rebuilds the map.
  useEffect(() => {
    dropElsRef.current.forEach((el, id) => {
      el.style.cssText = dropPinStyle(id === selectedDropOffId);
    });
  }, [selectedDropOffId]);

  // Swap the base style on mode change. Markers/popups are DOM and persist
  // across setStyle; the first run is skipped since the map is built with the
  // initial style already.
  const styleInit = useRef(false);
  useEffect(() => {
    if (!styleInit.current) {
      styleInit.current = true;
      return;
    }
    mapRef.current?.setStyle(MAP_STYLES[mode]);
  }, [mode]);

  if (!TOKEN) {
    return (
      <div className={cn("grid place-items-center rounded-2xl border border-dashed border-neutral-200 bg-card text-center", className)}>
        <div>
          <p className="text-sm text-neutral-700">The map needs a Mapbox token.</p>
          <p className="mt-1 font-mono text-xs text-neutral-700">
            Add NEXT_PUBLIC_MAPBOX_TOKEN to Code/.env, then restart the dev server.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className={cn(
        "w-full overflow-hidden rounded-2xl border border-neutral-900/10 shadow-card",
        className
      )}
    />
  );
}
