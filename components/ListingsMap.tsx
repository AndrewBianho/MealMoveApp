"use client";

import "mapbox-gl/dist/mapbox-gl.css";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Map as MapboxMap, Marker as MapboxMarker } from "mapbox-gl";
import type { Feature } from "geojson";
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

// The live-delivery route line: maps blue (mirrors RescueMap's active route and
// DESIGN.md's `route` token), over a white casing so it reads on satellite tiles.
const ROUTE = RAMP.route;

// A live-route journey to draw + trace, each point [lng, lat]. The map prepends
// the volunteer's current location (once geolocated) as the origin, so the drawn
// route is you → pickup → drop-off; dropOff is null until one is chosen.
export interface LiveRoute {
  pickup: [number, number];
  dropOff?: [number, number] | null;
}

// Inject the tracer's pulsing halo once. The tracer is a raw-DOM marker (Mapbox
// positions it via setLngLat), so its pulse lives in CSS. Respects reduced motion.
let tracerStyleInjected = false;
function ensureTracerStyle() {
  if (tracerStyleInjected || typeof document === "undefined") return;
  tracerStyleInjected = true;
  const s = document.createElement("style");
  s.textContent = `
    .mm-tracer-pulse{position:absolute;width:32px;height:32px;border-radius:50%;background:${ROUTE};opacity:.25;animation:mm-tracer-ping 1.8s cubic-bezier(0,0,.2,1) infinite;}
    @keyframes mm-tracer-ping{0%{transform:scale(.35);opacity:.45;}70%{opacity:0;}100%{transform:scale(1);opacity:0;}}
    @media (prefers-reduced-motion: reduce){.mm-tracer-pulse{animation:none;opacity:.16;}}
  `;
  document.head.appendChild(s);
}

// Cumulative segment lengths along a polyline, so the tracer advances at a
// steady pace regardless of how the route's vertices are spaced.
function buildPath(coords: [number, number][]): { cum: number[]; total: number } {
  const cum = [0];
  for (let i = 1; i < coords.length; i++) {
    const [x0, y0] = coords[i - 1];
    const [x1, y1] = coords[i];
    cum.push(cum[i - 1] + Math.hypot(x1 - x0, y1 - y0));
  }
  return { cum, total: cum[cum.length - 1] || 1 };
}
// Position at fraction p (0→1) of the total length along the polyline.
function pointAt(
  coords: [number, number][],
  cum: number[],
  total: number,
  p: number
): [number, number] {
  const d = Math.max(0, Math.min(1, p)) * total;
  let i = 1;
  while (i < cum.length && cum[i] < d) i++;
  if (i >= coords.length) return coords[coords.length - 1];
  const seg = cum[i] - cum[i - 1] || 1;
  const t = (d - cum[i - 1]) / seg;
  const [x0, y0] = coords[i - 1];
  const [x1, y1] = coords[i];
  return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
}

// Add the blue route line (white casing under it) from resolved coords.
// Idempotent so it can re-run after a base-style swap (setStyle wipes sources).
function addLiveRouteLayers(map: MapboxMap, coords: [number, number][]) {
  if (map.getSource("live-route")) return;
  const data: Feature = {
    type: "Feature",
    properties: {},
    geometry: { type: "LineString", coordinates: coords },
  };
  map.addSource("live-route", { type: "geojson", data });
  map.addLayer({
    id: "live-route-casing",
    type: "line",
    source: "live-route",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#ffffff", "line-width": 8, "line-opacity": 0.9 },
  });
  map.addLayer({
    id: "live-route-line",
    type: "line",
    source: "live-route",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": ROUTE, "line-width": 5, "line-opacity": 0.95 },
  });
}

// Tear down the route line + casing so a new destination can redraw in place
// (the source is single-use; addLiveRouteLayers early-returns while it exists).
function removeLiveRouteLayers(map: MapboxMap) {
  for (const id of ["live-route-line", "live-route-casing"]) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  if (map.getSource("live-route")) map.removeSource("live-route");
}

// Driving geometry pickup → drop-off (follows roads); null on any failure so the
// caller can fall back to a straight 2-point line.
async function fetchDriveRoute(
  waypoints: [number, number][]
): Promise<[number, number][] | null> {
  if (waypoints.length < 2) return null;
  try {
    const coords = waypoints.map((p) => `${p[0]},${p[1]}`).join(";");
    const url =
      `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}` +
      `?geometries=geojson&overview=full&access_token=${TOKEN}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      routes?: { geometry: { coordinates: [number, number][] } }[];
    };
    const c = data.routes?.[0]?.geometry?.coordinates;
    return Array.isArray(c) && c.length > 1 ? c : null;
  } catch {
    return null;
  }
}

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
  route = null,
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
  /** When set (an in-transit rescue), draw a blue driving route pickup →
   * drop-off and loop a tracer dot along it — imitated live tracking. */
  route?: LiveRoute | null;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap>();
  const [mode, setMode] = useState<MapMode>("satellite");
  const modeRef = useRef(mode);
  modeRef.current = mode;
  // The tracer marker + its animation frame, and the resolved route geometry so
  // the line can be re-added after a base-style swap. Raw refs — the tracer is a
  // DOM marker and its rAF loop live outside React's render cycle.
  const tracerRef = useRef<MapboxMarker>();
  const rafRef = useRef<number>();
  const routeCoordsRef = useRef<[number, number][] | null>(null);
  // Cached mapbox-gl module so the route can be (re)drawn from applyRoute
  // without re-importing or rebuilding the map when the destination changes.
  const glRef = useRef<typeof import("mapbox-gl")["default"]>();
  // Bumped on every applyRoute call so a slower in-flight draw (its directions
  // fetch still resolving) bails when a newer destination has superseded it.
  const routeTokenRef = useRef(0);
  // The volunteer's current location [lng, lat], once the GeolocateControl
  // resolves it — prepended to the route so it reads "you → pickup → drop-off".
  const userLocRef = useRef<[number, number] | null>(null);
  // Serialize the route into a stable primitive so the route effect only re-runs
  // when the actual coordinates change, not on every parent render.
  const routeKey = route
    ? `${route.pickup[0]},${route.pickup[1]};${route.dropOff ? `${route.dropOff[0]},${route.dropOff[1]}` : ""}`
    : "";
  const routeRef = useRef(route);
  routeRef.current = route;
  // Raw-DOM marker elements by drop-off id, so the selection halo can restyle
  // them without rebuilding the map.
  const dropElsRef = useRef<globalThis.Map<string, HTMLDivElement>>(new globalThis.Map());
  const selectedRef = useRef(selectedDropOffId);
  selectedRef.current = selectedDropOffId;
  const onSelectRef = useRef(onSelectDropOff);
  onSelectRef.current = onSelectDropOff;

  // Draw (or clear) the blue route line + its looping tracer on the live map.
  // Safe to call repeatedly: it tears down the previous route first, so
  // switching the destination redraws in place instead of rebuilding the map.
  const applyRoute = useCallback(async (nextRoute: LiveRoute | null) => {
    const map = mapRef.current;
    const mapboxgl = glRef.current;
    if (!map || !mapboxgl) return;
    const token = ++routeTokenRef.current;

    // Clear any existing route line + tracer + animation loop.
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = undefined;
    tracerRef.current?.remove();
    tracerRef.current = undefined;
    removeLiveRouteLayers(map);
    routeCoordsRef.current = null;
    if (!nextRoute) return;

    // Chain the legs the volunteer actually travels: current location →
    // pickup → drop-off. Drop any leg we don't have yet (no GPS fix, no chosen
    // destination) and collapse near-duplicate points so the request is valid.
    const raw: [number, number][] = [];
    if (userLocRef.current) raw.push(userLocRef.current);
    raw.push(nextRoute.pickup);
    if (nextRoute.dropOff) raw.push(nextRoute.dropOff);
    const waypoints = raw.filter(
      (p, i) => i === 0 || Math.abs(p[0] - raw[i - 1][0]) > 1e-6 || Math.abs(p[1] - raw[i - 1][1]) > 1e-6
    );
    // Need at least two distinct points to draw a line at all.
    if (waypoints.length < 2) return;

    // Roads if we can get them; a straight polyline through the waypoints else.
    const drive = await fetchDriveRoute(waypoints);
    // Bail if the map was rebuilt/removed, or a newer destination superseded us.
    if (mapRef.current !== map || routeTokenRef.current !== token) return;
    const coords = drive ?? waypoints;
    routeCoordsRef.current = coords;
    const reduce =
      typeof window !== "undefined" &&
      !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    // isStyleLoaded() can briefly read false right at load; defer to "idle"
    // (which fires after the current load handler) rather than "load", which
    // may have already fired — otherwise the layer would never get added.
    const drawLine = () => addLiveRouteLayers(map, coords);
    if (map.isStyleLoaded()) drawLine();
    else map.once("idle", drawLine);

    // Frame the whole journey so the entire route is visible (you → pickup →
    // drop-off), not just centered on the volunteer. Eased so switching drop-
    // offs pans smoothly instead of jumping; snaps instantly under reduced
    // motion. Padded for the route overlay card (top-left) and map controls.
    const bounds = new mapboxgl.LngLatBounds();
    coords.forEach((c) => bounds.extend(c));
    map.fitBounds(bounds, {
      padding: { top: 72, bottom: 56, left: 56, right: 72 },
      maxZoom: 15,
      duration: reduce ? 0 : 700,
    });

    // The tracer: a route-blue dot with a soft pulsing halo, positioned by
    // Mapbox so it never lags the map as it pans.
    ensureTracerStyle();
    const tEl = document.createElement("div");
    tEl.style.cssText = `width:32px;height:32px;display:grid;place-items:center;pointer-events:none;`;
    const pulse = document.createElement("div");
    pulse.className = "mm-tracer-pulse";
    const dot = document.createElement("div");
    dot.style.cssText = `position:relative;width:15px;height:15px;border-radius:50%;background:${ROUTE};border:3px solid #fff;box-shadow:0 0 0 1.5px rgba(0,0,0,.2),0 2px 6px rgba(51,52,44,.45);`;
    tEl.appendChild(pulse);
    tEl.appendChild(dot);
    tracerRef.current = new mapboxgl.Marker({ element: tEl })
      .setLngLat(coords[0])
      .addTo(map);

    // Steady sweep pickup → drop-off, then restart — a medium ~6s pass, with a
    // quick fade at the loop seam so the jump back reads softly. Under reduced
    // motion the dot simply rests at the route's midpoint.
    const { cum, total } = buildPath(coords);
    if (reduce) {
      tracerRef.current.setLngLat(pointAt(coords, cum, total, 0.5));
    } else {
      const DURATION = 6000;
      let startT = 0;
      const tick = (now: number) => {
        if (mapRef.current !== map || !tracerRef.current) return;
        if (!startT) startT = now;
        const p = ((now - startT) % DURATION) / DURATION;
        tracerRef.current.setLngLat(pointAt(coords, cum, total, p));
        const fade = p < 0.06 ? p / 0.06 : p > 0.94 ? (1 - p) / 0.06 : 1;
        tEl.style.opacity = String(fade);
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    }
  }, []);

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
      glRef.current = mapboxgl;

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

      // "You are here" — live location with a recenter button. On the route/
      // detail map we locate once but don't let the camera follow the dot, so
      // it can't fight the whole-route framing; the feed keeps live tracking.
      const routeMode = !!routeRef.current;
      const geolocate = new mapboxgl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: !routeMode,
        showUserHeading: !routeMode,
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
            <div style="color:rgb(var(--n-700));font-family:var(--font-mono),monospace;font-size:11px;letter-spacing:.02em;margin-top:2px;">Drop-off</div>
          </div>`
        );
        el.addEventListener("click", () => onSelectRef.current?.(d.id));
        new mapboxgl.Marker(el).setLngLat([d.lng, d.lat]).setPopup(popup).addTo(map!);
        dropEls.set(d.id, el);
      }

      // Once located, fold "distance from you" into every popup, and anchor the
      // route at the volunteer's position — redrawing when the fix first lands
      // or they move enough to matter (~50m), so "you → pickup" appears without
      // needing to pick a drop-off first.
      geolocate.on("geolocate", (e) => {
        const { latitude, longitude } = (e as GeolocationPosition).coords;
        for (const { listing, popup } of entries) {
          const d = milesBetween(latitude, longitude, listing.lat, listing.lng);
          popup.setHTML(popupHtml(listing, d));
        }
        const prev = userLocRef.current;
        const moved =
          !prev || milesBetween(prev[1], prev[0], latitude, longitude) > 0.03;
        userLocRef.current = [longitude, latitude];
        if (moved && routeRef.current) void applyRoute(routeRef.current);
      });

      map.on("load", () => {
        if (points.length > 1) resetView();
        // Auto-locate the volunteer (prompts for permission; harmless if denied).
        geolocate.trigger();
        // Draw the initial route (if any) now the base style is ready; the
        // routeKey effect handles later destination switches in place.
        void applyRoute(routeRef.current);
      });
    })();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = undefined;
      tracerRef.current?.remove();
      tracerRef.current = undefined;
      routeCoordsRef.current = null;
      dropEls.clear();
      map?.remove();
      mapRef.current = undefined;
    };
  }, [listings, dropOffs, applyRoute]);

  // Redraw the route when the destination changes (e.g. the volunteer picks a
  // different drop-off) — in place on the live map, so switching drop-offs
  // never tears down and refits the whole map. The build effect draws the
  // first route itself once the style loads; this covers every change after.
  useEffect(() => {
    if (!mapRef.current) return;
    void applyRoute(routeRef.current);
    // routeRef holds the latest route; routeKey is its stable serialization.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey, applyRoute]);

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
    const map = mapRef.current;
    if (!map) return;
    map.setStyle(MAP_STYLES[mode]);
    // setStyle wipes custom sources/layers; re-add the route line once the new
    // style loads (the tracer is a DOM marker and persists on its own).
    const coords = routeCoordsRef.current;
    if (coords) map.once("style.load", () => addLiveRouteLayers(map, coords));
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
