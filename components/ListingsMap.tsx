"use client";

import "mapbox-gl/dist/mapbox-gl.css";
import { useEffect, useRef, useState } from "react";
import type { Map as MapboxMap } from "mapbox-gl";
import type { Listing } from "@/lib/types";
import { escapeHtml } from "@/lib/escapeHtml";
import { RAMP } from "@/lib/rampColors";
import { MAP_STYLES, createModeToggle, createHomeControl, type MapMode } from "@/lib/mapStyles";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

// White utensils glyph so each pin reads as "food here" at a glance and stands
// off the satellite imagery — mirrors the restaurant pin in RescueMap.
const ICON_LISTING = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7a2 2 0 0 0 2 2 2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1 1 2 2 2h3Zm0 0v7"/></svg>`;

// Same urgency palette as the listing-card strip; hex mirrors the ramp tokens
// via lib/rampColors (raw-DOM pins can't read Tailwind).
function urgencyColor(l: Listing): string {
  if (["delivered", "expired", "failed"].includes(l.status)) return RAMP.neutral400;
  if (l.minutesLeft < 10) return RAMP.failed400;
  if (l.minutesLeft < 35) return RAMP.urgent600;
  return RAMP.rescued600;
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

export function ListingsMap({ listings }: { listings: Listing[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap>();
  const [mode, setMode] = useState<MapMode>("satellite");
  const modeRef = useRef(mode);
  modeRef.current = mode;

  useEffect(() => {
    if (!TOKEN || !ref.current) return;
    const withCoords = listings.filter(
      (l): l is Located => typeof l.lat === "number" && typeof l.lng === "number"
    );

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

      // Frame the map to fit all listings (the "good zoom"); used on load and by
      // the home button.
      const resetView = () => {
        if (!map) return;
        if (withCoords.length > 1) {
          const bounds = new mapboxgl.LngLatBounds();
          withCoords.forEach((l) => bounds.extend([l.lng, l.lat]));
          map.fitBounds(bounds, { padding: 64, maxZoom: 15, bearing: 0, pitch: 0 });
        } else {
          map.flyTo({
            center: withCoords.length ? [withCoords[0].lng, withCoords[0].lat] : [-75.34, 40.04],
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

      // Once located, fold "distance from you" into every popup.
      geolocate.on("geolocate", (e) => {
        const { latitude, longitude } = (e as GeolocationPosition).coords;
        for (const { listing, popup } of entries) {
          const d = milesBetween(latitude, longitude, listing.lat, listing.lng);
          popup.setHTML(popupHtml(listing, d));
        }
      });

      map.on("load", () => {
        if (withCoords.length > 1) resetView();
        // Auto-locate the volunteer (prompts for permission; harmless if denied).
        geolocate.trigger();
      });
    })();

    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = undefined;
    };
  }, [listings]);

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
      <div className="grid h-[60vh] place-items-center rounded-2xl border border-dashed border-neutral-200 bg-card text-center">
        <div>
          <p className="text-sm text-neutral-600">The map needs a Mapbox token.</p>
          <p className="mt-1 font-mono text-xs text-neutral-500">
            Add NEXT_PUBLIC_MAPBOX_TOKEN to Code/.env, then restart the dev server.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className="h-[60vh] w-full overflow-hidden rounded-2xl border border-neutral-900/10 shadow-card"
    />
  );
}
