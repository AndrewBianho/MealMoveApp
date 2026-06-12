"use client";

import "mapbox-gl/dist/mapbox-gl.css";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type {
  Map as MapboxMap,
  Marker as MapboxMarker,
  GeoJSONSource,
} from "mapbox-gl";
import type { Feature, FeatureCollection } from "geojson";
import Link from "next/link";
import { rankDropOffs, rankRestaurantsForDropOff } from "@/lib/recommend";
import { claimListing } from "@/app/actions";
import { geocodeClient } from "@/lib/geocode-client";
import { escapeHtml } from "@/lib/escapeHtml";
import { RAMP } from "@/lib/rampColors";
import { MAP_STYLES, createModeToggle, createHomeControl, type MapMode } from "@/lib/mapStyles";
import { cn } from "./cn";
import type { DropOffLocation, FoodCategory, MapRestaurant } from "@/lib/types";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

// Pin/line hex MUST mirror the ramp tokens — sourced from lib/rampColors so the
// values live in one place (DESIGN.md). Restaurant pins are colored by urgency;
// drop-offs are plum squares; clay is the route/accent.
const DROP = RAMP.transit600; // drop-offs
const REC = RAMP.clay600; // routes + recommended highlight
const URG_SOON = RAMP.failed600; // <30 min
const URG_MID = RAMP.urgent600; // <60 min
const URG_OPEN = RAMP.rescued600; // open, plenty of time
const URG_SPENT = RAMP.neutral400; // all claimed (nothing open)
const ME = RAMP.ink; // "my location"
const DEST = RAMP.clay800; // final destination flag
const ROUTE = RAMP.route; // the chosen/active route line (maps blue)
const ROUTE_ALT = RAMP.routeAlt; // the muted alternative routes

// Full-width pill button inside a pin popup — sage (primary action), white
// label. Inline because popups are raw DOM and can't read Tailwind. Mirrors the
// primary button look (white on rescued-600).
const POPUP_BTN =
  `display:block;box-sizing:border-box;width:100%;text-align:center;margin-top:11px;` +
  `background:${RAMP.rescued600};color:#fff;font-family:var(--font-sans),system-ui,sans-serif;` +
  `font-size:13px;font-weight:700;padding:10px 16px;border-radius:9999px;text-decoration:none;`;

// A mono status chip for a popup (color-blind-safe: dot + tinted fill + label,
// never hue alone). `hex` is a ramp-600 value; the fill is the same hue at ~12%.
function popupChip(label: string, hex: string): string {
  return (
    `<span style="display:inline-flex;align-items:center;gap:5px;background:${hex}1f;` +
    `color:${hex};font-family:var(--font-mono),monospace;font-size:10px;font-weight:500;` +
    `letter-spacing:.05em;text-transform:uppercase;padding:3px 9px;border-radius:9999px;">` +
    `<span style="width:5px;height:5px;border-radius:50%;background:${hex};"></span>${label}</span>`
  );
}

// Claim button inside a restaurant popup — same sage pill as POPUP_BTN, but a
// real <button> (border:0, pointer) wired to claimListing when the popup opens.
// Only rendered for restaurants with an open listing.
const POPUP_CLAIM_BTN =
  `display:block;box-sizing:border-box;width:100%;text-align:center;margin-top:11px;border:0;cursor:pointer;` +
  `background:${RAMP.rescued600};color:#fff;font-family:var(--font-sans),system-ui,sans-serif;` +
  `font-size:13px;font-weight:700;padding:10px 16px;border-radius:9999px;`;

// Secondary text link under the claim button (clay accent, mono, centered).
const POPUP_LINK =
  `display:block;text-align:center;margin-top:8px;color:${RAMP.clay600};` +
  `font-family:var(--font-mono),monospace;font-size:11px;letter-spacing:.03em;text-decoration:none;`;

// Quiet mono hint at the foot of a popup.
const POPUP_HINT =
  `font-family:var(--font-mono),monospace;font-size:10px;text-transform:uppercase;` +
  `letter-spacing:.05em;color:rgb(var(--n-500));margin-top:9px;text-align:center;`;

// --- Shared status-chip tokens for the in-panel "More information" tiles. ----
// Color-blind-safe: every chip pairs its ramp tint with a dot and a mono label,
// mirroring the raw-DOM popupChip so the two surfaces read identically.
type ChipTone = "rescued" | "urgent" | "failed" | "transit" | "neutral";
const CHIP_FILL: Record<ChipTone, string> = {
  rescued: "bg-rescued-50 text-rescued-800",
  urgent: "bg-urgent-50 text-urgent-800",
  failed: "bg-failed-50 text-failed-800",
  transit: "bg-transit-50 text-transit-800",
  neutral: "bg-neutral-100 text-neutral-600",
};
const CHIP_DOT: Record<ChipTone, string> = {
  rescued: "bg-rescued-600",
  urgent: "bg-urgent-600",
  failed: "bg-failed-600",
  transit: "bg-transit-600",
  neutral: "bg-neutral-400",
};
function urgencyTone(minutesLeft?: number): ChipTone {
  if (minutesLeft == null) return "neutral";
  if (minutesLeft < 30) return "failed";
  if (minutesLeft < 60) return "urgent";
  return "rescued";
}
function InfoChip({ tone, children }: { tone: ChipTone; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide",
        CHIP_FILL[tone]
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", CHIP_DOT[tone])} aria-hidden="true" />
      {children}
    </span>
  );
}

// Default "sensed" location — Malvern Prep — overridable by address.
const MY_DEFAULT: [number, number] = [-75.51239, 40.02724];

// White glyphs that make each selectable pin instantly readable: utensils for a
// restaurant (food source), a package for a drop-off (delivery point).
const ICON_REST = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7a2 2 0 0 0 2 2 2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1 1 2 2 2h3Zm0 0v7"/></svg>`;
const ICON_DROP = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="M3.3 7 12 12l8.7-5"/><path d="M12 22V12"/></svg>`;

// Hover-lift + smooth highlight for the clickable pins, injected once. The
// outline (selection) and transform (hover) are separate properties, so they
// compose without fighting. Respects reduced-motion.
let pinStylesInjected = false;
function ensurePinStyles() {
  if (pinStylesInjected || typeof document === "undefined") return;
  pinStylesInjected = true;
  const s = document.createElement("style");
  // Hover feedback is shadow-only — NO transform. A transform-scale hover makes
  // pins pop as the map slides under a stationary cursor during scroll-zoom,
  // which reads as the pins shifting. Mapbox owns each pin's transform for
  // positioning; we never touch it, so pins stay locked to their coordinate.
  // The resting shadow lives here (not inline) so the :hover rule can take over
  // — an inline box-shadow would out-specify it and the lift would never fire.
  // Double-shadow: a dark hairline ring for edge definition on bright/satellite
  // imagery, plus a soft drop so the pin lifts off the map.
  s.textContent = `
    .mm-pin{cursor:pointer;}
    .mm-pin-head{transition:box-shadow .14s ease, outline-color .12s ease, opacity .12s ease;
      box-shadow:0 0 0 1.5px rgba(0,0,0,.18), 0 4px 10px rgba(51,52,44,.42);}
    .mm-pin:hover .mm-pin-head{box-shadow:0 0 0 1.5px rgba(0,0,0,.22), 0 9px 20px rgba(51,52,44,.55);}
    /* "You are here": a live, expanding accuracy ring behind the dot — the
       universally recognized current-location cue. The pulse transforms only
       this child, never the Mapbox-positioned root, so the pin stays put. */
    .mm-me-pulse{position:absolute;width:40px;height:40px;border-radius:50%;background:${ME};
      opacity:.22;animation:mm-me-ping 2.6s cubic-bezier(0,0,.2,1) infinite;}
    @keyframes mm-me-ping{0%{transform:scale(.32);opacity:.4;}70%{opacity:0;}100%{transform:scale(1);opacity:0;}}
    @media (prefers-reduced-motion: reduce){.mm-pin-head{transition:none;}.mm-me-pulse{animation:none;opacity:.15;}}
  `;
  document.head.appendChild(s);
}

const ALL_CATEGORIES: FoodCategory[] = [
  "prepared",
  "produce",
  "bakery",
  "packaged",
  "dairy",
  "beverages",
];

function restColor(minutesLeft?: number): string {
  if (minutesLeft === undefined) return URG_SPENT;
  if (minutesLeft < 30) return URG_SOON; // under 30 min
  if (minutesLeft < 60) return URG_MID; // under 1 hour
  return URG_OPEN; // open (up to ~3 hours)
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

// Add the route line layers (Google-Maps style: one bold blue active route, the
// rest muted behind it). All journeys live in one `routes` source; each feature
// carries `active` so the same data drives every layer. Idempotent so it can run
// on the first style load AND after a base-style swap (setStyle wipes sources).
// Draw order (bottom→top): alternatives, white casing, active, transparent hit.
function addRouteLayers(map: MapboxMap) {
  if (map.getSource("routes")) return;
  map.addSource("routes", { type: "geojson", data: EMPTY });
  // Alternatives — muted warm grey, thin, sitting behind the active route.
  map.addLayer({
    id: "route-alt",
    type: "line",
    source: "routes",
    filter: ["!", ["get", "active"]],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": ROUTE_ALT, "line-width": 4, "line-opacity": 0.6 },
  });
  // White casing under the active route so the blue reads on satellite imagery.
  map.addLayer({
    id: "route-casing",
    type: "line",
    source: "routes",
    filter: ["get", "active"],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#ffffff", "line-width": 9, "line-opacity": 0.9 },
  });
  // The chosen route — maps blue, bold.
  map.addLayer({
    id: "route-active",
    type: "line",
    source: "routes",
    filter: ["get", "active"],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": ROUTE, "line-width": 5.5, "line-opacity": 0.98 },
  });
  // Wide, fully transparent hit target so any route is easy to click/tap.
  map.addLayer({
    id: "route-hit",
    type: "line",
    source: "routes",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#000000", "line-width": 22, "line-opacity": 0 },
  });
}

interface RouteInfo {
  coords: [number, number][];
  minutes: number;
  miles: number;
}

type Selection = { kind: "rest" | "drop"; id: string } | null;

// One selectable journey (you → restaurant → drop-off → optional destination).
// `id` is the varying waypoint's id: the drop-off (rest mode) or the restaurant
// (drop mode). Whether it's the active route is derived from `activeRoute` state
// at render, so picking one re-highlights without rebuilding the panel.
interface RouteOption {
  id: string;
  name: string;
  miles: number; // great-circle, shown immediately; replaced by drive distance
  minutes?: number; // full-journey drive time, filled when the route resolves
  recommended: boolean; // the shortest drive of the set
}
type Panel = { kind: "rest" | "drop"; name: string; options: RouteOption[] } | null;

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
  const dropBaseHTML = useRef(new Map<string, string>());
  const meMarkerRef = useRef<MapboxMarker>();
  const destMarkerRef = useRef<MapboxMarker>();
  const routeCache = useRef(new Map<string, RouteInfo | null>());
  const panelRef = useRef<HTMLDivElement>(null);
  // Tracks which selection we've already scrolled the panel into view for, so we
  // do it once per selection (not on every panel re-render as routes resolve).
  const scrolledForRef = useRef<string | null>(null);

  const [selected, setSelected] = useState<Selection>(null);
  const [panel, setPanel] = useState<Panel>(null);
  // Which journey is the chosen (blue) route. Keyed by the varying waypoint's id
  // (drop-off in rest mode, restaurant in drop mode). null = nothing drawn.
  const [activeRoute, setActiveRoute] = useState<string | null>(null);
  const [cats, setCats] = useState<Set<FoodCategory>>(new Set());
  const [fridgeOnly, setFridgeOnly] = useState(false);
  const [mode, setMode] = useState<MapMode>("satellite");
  const [legendOpen, setLegendOpen] = useState(true);
  const [infoOpen, setInfoOpen] = useState(false);
  const [claimState, setClaimState] = useState<"idle" | "claiming" | "done" | "error">("idle");
  const [claimMsg, setClaimMsg] = useState<string | null>(null);
  // Bumped after a base-style swap finishes, so the line-drawing effect re-runs
  // and repaints routes onto the freshly re-added sources.
  const [styleVersion, setStyleVersion] = useState(0);

  const [myLoc, setMyLoc] = useState<[number, number]>(MY_DEFAULT);
  const [myLabel, setMyLabel] = useState("Malvern Prep");
  const [dest, setDest] = useState<[number, number] | null>(null);
  const [destLabel, setDestLabel] = useState("");
  const [myInput, setMyInput] = useState("");
  const [destInput, setDestInput] = useState("");
  const [geoBusy, setGeoBusy] = useState<"me" | "dest" | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);

  // Refs mirror state so the build-once effect and async fetches read fresh
  // values without being in the dependency array.
  const selectedRef = useRef<Selection>(null);
  selectedRef.current = selected;
  const activeRouteRef = useRef<string | null>(null);
  activeRouteRef.current = activeRoute;
  // Resolved journey geometries for the current selection, keyed by option id,
  // plus which markers carry the candidate endpoints. paintRoutes reads these so
  // switching the active route only repaints — no refetch, no refit.
  const routeGeomsRef = useRef(new Map<string, [number, number][]>());
  const candidateEndpointsRef = useRef<{ kind: "rest" | "drop"; ids: string[] } | null>(null);
  const myLocRef = useRef(myLoc);
  myLocRef.current = myLoc;
  const destRef = useRef(dest);
  destRef.current = dest;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const toggleRef = useRef<ReturnType<typeof createModeToggle>>();

  // Repaint the route lines + endpoint rings from the resolved geometries,
  // marking whichever id is active. Reads refs so it's stable and can run from
  // either the fetch effect or the lightweight active-route effect.
  const paintRoutes = useCallback(() => {
    const map = mapRef.current;
    const src = map?.getSource("routes") as GeoJSONSource | undefined;
    if (!map || !src) return;
    const activeId = activeRouteRef.current;
    const feats: Feature[] = [];
    routeGeomsRef.current.forEach((coords, id) => {
      feats.push({
        type: "Feature",
        properties: { id, active: id === activeId },
        geometry: { type: "LineString", coordinates: coords },
      });
    });
    src.setData({ type: "FeatureCollection", features: feats });

    // Ring the candidate endpoints: blue for the active route's endpoint, clay
    // for the alternatives, so the map and panel agree at a glance.
    const ep = candidateEndpointsRef.current;
    if (ep) {
      const markers = ep.kind === "rest" ? dropMarkers.current : restMarkers.current;
      ep.ids.forEach((id) => {
        const head = markers.get(id)?.getElement().firstElementChild as HTMLElement | null;
        if (!head) return;
        head.style.outline = `3px solid ${id === activeId ? ROUTE : REC}`;
        head.style.outlineOffset = "2px";
      });
    }
  }, []);

  // --- localStorage hydration + persistence --------------------------------
  const hydrated = useRef(false);
  useEffect(() => {
    let hadSaved = false;
    try {
      const ml = localStorage.getItem("mm.myLoc");
      if (ml) {
        const p = JSON.parse(ml);
        if (Array.isArray(p) && p.length === 2) {
          setMyLoc([p[0], p[1]]);
          setMyLabel(localStorage.getItem("mm.myLabel") || "Saved location");
          hadSaved = true;
        }
      }
      const d = localStorage.getItem("mm.dest");
      if (d) {
        const p = JSON.parse(d);
        if (Array.isArray(p) && p.length === 2) {
          setDest([p[0], p[1]]);
          setDestLabel(localStorage.getItem("mm.destLabel") || "Saved destination");
        }
      }
    } catch {
      /* ignore corrupt storage */
    }
    hydrated.current = true;
    // First visit (no saved spot) → quietly ask the device for its location.
    if (!hadSaved) detectLocation(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!hydrated.current) return;
    try {
      localStorage.setItem("mm.myLoc", JSON.stringify(myLoc));
      localStorage.setItem("mm.myLabel", myLabel);
    } catch {
      /* ignore */
    }
  }, [myLoc, myLabel]);
  useEffect(() => {
    if (!hydrated.current) return;
    try {
      if (dest) {
        localStorage.setItem("mm.dest", JSON.stringify(dest));
        localStorage.setItem("mm.destLabel", destLabel);
      } else {
        localStorage.removeItem("mm.dest");
        localStorage.removeItem("mm.destLabel");
      }
    } catch {
      /* ignore */
    }
  }, [dest, destLabel]);

  function toggleCat(c: FoodCategory) {
    setCats((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  }

  // Claim the restaurant's soonest-expiring open listing (the pickup). The map's
  // data is a per-load snapshot, so on success we surface a link into My pickups
  // rather than mutate the markers in place.
  // Returns whether the claim succeeded, so the raw-DOM popup button (which can't
  // read React state) can give its own inline feedback on the error path. On
  // success the server action refreshes the route, which usually rebuilds the
  // map and closes the popup — but the panel keeps the durable "claimed" state.
  async function onClaim(listingId: string): Promise<boolean> {
    setClaimState("claiming");
    setClaimMsg(null);
    try {
      await claimListing(listingId);
      setClaimState("done");
      return true;
    } catch (e) {
      setClaimState("error");
      setClaimMsg(e instanceof Error ? e.message : "Couldn't claim this pickup.");
      return false;
    }
  }
  // Refs so the build-once marker effect's popup handlers call the latest claim
  // logic without being rebuilt on every render.
  const onClaimRef = useRef(onClaim);
  onClaimRef.current = onClaim;

  async function fetchRouteMulti(points: [number, number][]): Promise<RouteInfo | null> {
    const key = points.map((p) => `${p[0]},${p[1]}`).join(";");
    const cached = routeCache.current.get(key);
    if (cached !== undefined) return cached;
    const url =
      `https://api.mapbox.com/directions/v5/mapbox/driving/${key}` +
      `?geometries=geojson&overview=full&access_token=${TOKEN}`;
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = (await res.json()) as {
        routes?: { duration: number; distance: number; geometry: { coordinates: [number, number][] } }[];
      };
      const rt = data.routes?.[0];
      if (!rt?.geometry?.coordinates?.length) return null;
      const info: RouteInfo = {
        coords: rt.geometry.coordinates,
        minutes: Math.max(1, Math.round(rt.duration / 60)),
        miles: rt.distance / 1609.34,
      };
      routeCache.current.set(key, info);
      return info;
    } catch {
      return null;
    }
  }

  async function onGeocode(which: "me" | "dest") {
    const query = which === "me" ? myInput : destInput;
    if (!query.trim()) return;
    setGeoError(null);
    setGeoBusy(which);
    const hit = await geocodeClient(query);
    setGeoBusy(null);
    if (!hit) {
      setGeoError(`Couldn't find "${query.trim()}".`);
      return;
    }
    if (which === "me") {
      setMyLoc(hit.center);
      setMyLabel(hit.name);
      setMyInput("");
    } else {
      setDest(hit.center);
      setDestLabel(hit.name);
      setDestInput("");
    }
    mapRef.current?.flyTo({ center: hit.center, zoom: 13 });
  }

  // Use the device's GPS/location (needs HTTPS + permission). `auto` is the
  // silent first-load attempt: on failure we keep the default and stay quiet;
  // a manual tap surfaces the reason so the user can fall back to an address.
  function detectLocation(auto = false) {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      if (!auto) setGeoError("Location isn't available on this device.");
      return;
    }
    setGeoError(null);
    setGeoBusy("me");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoBusy(null);
        const c: [number, number] = [pos.coords.longitude, pos.coords.latitude];
        setMyLoc(c);
        setMyLabel("Your location");
        setMyInput("");
        mapRef.current?.flyTo({ center: c, zoom: 13 });
      },
      (err) => {
        setGeoBusy(null);
        if (!auto) {
          setGeoError(
            err.code === err.PERMISSION_DENIED
              ? "Location permission was denied — enter an address instead."
              : "Couldn't get your location — enter an address instead."
          );
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }

  // Build the map once (restaurants + drop-offs are stable per page load).
  useEffect(() => {
    if (!TOKEN || !container.current) return;
    let cancelled = false;
    const rMarkers = restMarkers.current;
    const dMarkers = dropMarkers.current;

    ensurePinStyles();
    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled || !container.current) return;
      mapboxgl.accessToken = TOKEN;

      const map = new mapboxgl.Map({
        container: container.current,
        style: MAP_STYLES[modeRef.current],
        center: myLocRef.current,
        zoom: 12,
      });
      mapRef.current = map;

      // Frame the map to fit everyone (the "good zoom"); used on load and by the
      // home button.
      const resetView = () => {
        const pts = [
          myLocRef.current,
          ...(destRef.current ? [destRef.current] : []),
          ...restaurants.map((r) => [r.lng, r.lat]),
          ...dropOffs.map((d) => [d.lng, d.lat]),
        ] as [number, number][];
        if (pts.length > 1)
          map.fitBounds(boundsOf(pts), { padding: 64, maxZoom: 14, bearing: 0, pitch: 0 });
        else map.flyTo({ center: myLocRef.current, zoom: 12, bearing: 0, pitch: 0 });
      };

      // Compass only — zoom +/- is handled by pinch/scroll; the home button
      // restores the framed view.
      map.addControl(
        new mapboxgl.NavigationControl({ showZoom: false, showCompass: true }),
        "top-right"
      );
      map.addControl(createHomeControl({ onClick: resetView }), "top-right");
      const toggle = createModeToggle({ initial: modeRef.current, onChange: setMode });
      toggleRef.current = toggle;
      map.addControl(toggle, "top-right");

      // "My location" — a bold ink dot with a thick white ring and a live,
      // pulsing accuracy ring behind it (repositioned by an effect).
      const meEl = document.createElement("div");
      meEl.style.cssText = `width:44px;height:44px;display:grid;place-items:center;`;
      const mePulse = document.createElement("div");
      mePulse.className = "mm-me-pulse";
      const meDot = document.createElement("div");
      meDot.style.cssText = `position:relative;width:20px;height:20px;border-radius:50%;background:${ME};border:3px solid #fff;box-shadow:0 0 0 1.5px rgba(0,0,0,.22),0 3px 9px rgba(51,52,44,.5);`;
      meEl.appendChild(mePulse);
      meEl.appendChild(meDot);
      meMarkerRef.current = new mapboxgl.Marker(meEl)
        .setLngLat(myLocRef.current)
        .setPopup(
          new mapboxgl.Popup({ offset: 16, closeButton: false }).setHTML(
            `<div style="font-family:var(--font-mono),monospace;font-size:11px;letter-spacing:.03em;color:rgb(var(--n-700));">you are here</div>`
          )
        )
        .addTo(map);

      // Restaurant markers — round pin with a utensils glyph, colored by
      // urgency; clicking isolates. Root is Mapbox-positioned; the inner head
      // carries hover/scale/outline so the pin never lags the map.
      // The root MUST NOT set `position`: Mapbox's `.mapboxgl-marker` sets
      // `position:absolute` and places each pin via a transform from the
      // container origin. An inline `position:relative` overrides that and drops
      // the pin back into normal flow — then toggling `display` to filter pins
      // reflows (shifts) every other pin. Stay out of flow; let Mapbox position.
      for (const r of restaurants) {
        const el = document.createElement("div");
        el.className = "mm-pin";
        el.style.cssText = `width:36px;height:36px;display:grid;place-items:center;`;
        const head = document.createElement("div");
        head.className = "mm-pin-head";
        head.style.cssText = `width:32px;height:32px;border-radius:50%;background:${restColor(r.minutesLeft)};border:3px solid #fff;outline:0 solid ${REC};display:grid;place-items:center;`;
        head.innerHTML = ICON_REST;
        el.appendChild(head);
        el.addEventListener("click", (ev) => {
          ev.stopPropagation();
          setSelected((cur) =>
            cur?.kind === "rest" && cur.id === r.id ? null : { kind: "rest", id: r.id }
          );
        });
        const listingHref = r.listingId ? `/listings/${r.listingId}` : `/restaurants/${r.id}`;
        const listingLabel = r.listingId ? "View listing →" : "View restaurant →";
        const rChip = popupChip(
          r.minutesLeft == null ? "all claimed" : `${r.minutesLeft} min left`,
          restColor(r.minutesLeft)
        );
        // Claimable straight from the popup when an OPEN listing exists. The
        // claim button is primary (sage), the detail link drops to a secondary
        // mono link; otherwise the detail link stays the primary action and the
        // route hint shows.
        const claimableRest = !!(r.listingId && r.minutesLeft != null);
        const actionHTML = claimableRest
          ? `<button type="button" data-claim style="${POPUP_CLAIM_BTN}">Claim pickup</button>
             <a href="${listingHref}" style="${POPUP_LINK}">${listingLabel}</a>`
          : `<a href="${listingHref}" style="${POPUP_BTN}">${listingLabel}</a>
             <div style="${POPUP_HINT}">tap the pin to plan a route</div>`;
        // closeOnClick:false so the card stays put (a route-planning map click or
        // the fitBounds pan won't dismiss it); its open/close is driven by the
        // selection effect below, not Mapbox's default marker toggle.
        const popup = new mapboxgl.Popup({
          offset: 14,
          closeButton: false,
          closeOnClick: false,
        }).setHTML(
          `<div style="font-family:var(--font-sans),system-ui,sans-serif;min-width:206px;max-width:244px;">
             ${rChip}
             <div style="font-family:var(--font-display),Georgia,serif;font-size:18px;font-weight:600;line-height:1.2;color:rgb(var(--n-900));margin-top:9px;">${escapeHtml(r.name)}</div>
             <div style="font-family:var(--font-mono),monospace;font-size:11px;color:rgb(var(--n-600));margin-top:6px;">~${r.servings} servings · ${r.count} listing${r.count > 1 ? "s" : ""}</div>
             <div style="font-size:12px;color:rgb(var(--n-600));margin-top:3px;">${escapeHtml(r.categories.join(", "))}${r.perishable ? " · perishable" : ""}</div>
             ${actionHTML}
           </div>`
        );
        // Wire the popup's claim button to the same server action the panel uses.
        // Self-contained DOM feedback (claiming → claimed) since popups are raw
        // DOM and can't read React state; the map's data is a per-load snapshot.
        if (claimableRest && r.listingId) {
          const lid = r.listingId;
          popup.on("open", () => {
            const btn = popup
              .getElement()
              ?.querySelector<HTMLButtonElement>("button[data-claim]");
            if (!btn || btn.dataset.wired) return;
            btn.dataset.wired = "1";
            btn.addEventListener("click", async (ev) => {
              ev.preventDefault();
              ev.stopPropagation();
              if (btn.dataset.state) return; // claiming or done — ignore repeats
              btn.dataset.state = "claiming";
              btn.textContent = "Claiming…";
              btn.style.opacity = "0.7";
              btn.style.cursor = "default";
              // Drive the same React claim the panel uses, so the panel shows the
              // durable "claimed" + "view in my pickups" state. On success the
              // route usually refreshes and closes this popup; on error it stays,
              // so reset the button to let them retry.
              const ok = await onClaimRef.current(lid);
              if (ok) {
                btn.dataset.state = "done";
                btn.textContent = "Claimed ✓";
              } else {
                delete btn.dataset.state;
                btn.style.opacity = "1";
                btn.style.cursor = "pointer";
                btn.textContent = "Couldn't claim — try again";
              }
            });
          });
        }
        restMarkers.current.set(
          r.id,
          new mapboxgl.Marker(el).setLngLat([r.lng, r.lat]).setPopup(popup).addTo(map)
        );
      }

      // Drop-off markers — rounded-square pin with a package glyph (a clearly
      // different silhouette from the round restaurant pins); clicking isolates
      // and finds the closest restaurants.
      for (const d of dropOffs) {
        const el = document.createElement("div");
        el.className = "mm-pin";
        el.style.cssText = `width:36px;height:36px;display:grid;place-items:center;`;
        const dot = document.createElement("div");
        dot.className = "mm-pin-head";
        dot.style.cssText = `width:30px;height:30px;border-radius:7px;background:${DROP};border:3px solid #fff;outline:0 solid ${REC};display:grid;place-items:center;`;
        dot.innerHTML = ICON_DROP;
        el.appendChild(dot);
        el.addEventListener("click", (ev) => {
          ev.stopPropagation();
          setSelected((cur) =>
            cur?.kind === "drop" && cur.id === d.id ? null : { kind: "drop", id: d.id }
          );
        });
        const dChip = d.refrigerated
          ? popupChip("❄ refrigerated", RAMP.transit600)
          : popupChip("ambient", RAMP.neutral400);
        // NOTE: baseHTML is an OPEN div on purpose — eligibility info and the
        // closing </div> are appended later (resetDropMarker / the apply loop).
        const baseHTML = `<div style="font-family:var(--font-sans),system-ui,sans-serif;min-width:206px;max-width:244px;">
             ${dChip}
             <div style="font-family:var(--font-display),Georgia,serif;font-size:18px;font-weight:600;line-height:1.2;color:rgb(var(--n-900));margin-top:9px;">${escapeHtml(d.name)}</div>
             <div style="font-family:var(--font-mono),monospace;font-size:11px;color:rgb(var(--n-600));margin-top:6px;">holds ${d.capacity} servings</div>
             <div style="font-size:12px;color:rgb(var(--n-600));margin-top:3px;">accepts ${escapeHtml(d.acceptedCategories.join(", "))}</div>
             ${d.notes ? `<div style="font-size:12px;color:rgb(var(--n-600));margin-top:4px;">${escapeHtml(d.notes)}</div>` : ""}
             <a href="/dropoffs/${d.id}" style="${POPUP_BTN}">View drop-off →</a>`;
        dropBaseHTML.current.set(d.id, baseHTML);
        const popup = new mapboxgl.Popup({ offset: 14, closeButton: false }).setHTML(
          baseHTML + "</div>"
        );
        dropMarkers.current.set(
          d.id,
          new mapboxgl.Marker(el).setLngLat([d.lng, d.lat]).setPopup(popup).addTo(map)
        );
      }

      // Clicking empty map space deliberately does NOT dismiss the route panel —
      // it stays until "Show all" or re-clicking the selected pin, so a chosen
      // route (and its Open-in-Google-Maps link) survives a stray map click.

      // Click any route (alternative or active) to make it the chosen route.
      map.on("click", "route-hit", (e) => {
        const id = e.features?.[0]?.properties?.id;
        if (typeof id === "string") setActiveRoute(id);
      });
      map.on("mouseenter", "route-hit", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "route-hit", () => {
        map.getCanvas().style.cursor = "";
      });

      map.on("load", () => {
        addRouteLayers(map);
        resetView();
      });
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = undefined;
      toggleRef.current = undefined;
      rMarkers.clear();
      dMarkers.clear();
    };
  }, [restaurants, dropOffs]);

  // Swap the base style when the mode toggles. setStyle wipes custom sources, so
  // re-add the route layers once the new style loads, then bump styleVersion to
  // repaint any active routes. Markers are DOM and persist automatically.
  const appliedMode = useRef<MapMode>(mode);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    toggleRef.current?.setMode(mode);
    if (mode === appliedMode.current) return;
    appliedMode.current = mode;
    map.setStyle(MAP_STYLES[mode]);
    const onStyle = () => {
      addRouteLayers(map);
      setStyleVersion((v) => v + 1);
    };
    map.once("style.load", onStyle);
    return () => {
      map.off("style.load", onStyle);
    };
  }, [mode]);

  // Reposition the "you" marker + popup when myLoc / label changes.
  useEffect(() => {
    const m = meMarkerRef.current;
    if (!m) return;
    m.setLngLat(myLoc);
    m.getPopup()?.setHTML(
      `<div style="font-family:var(--font-mono),monospace;font-size:11px;letter-spacing:.03em;color:rgb(var(--n-700));">you are here · ${escapeHtml(myLabel)}</div>`
    );
  }, [myLoc, myLabel]);

  // Create / move / remove the destination flag marker.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const map = mapRef.current;
      if (!map) return;
      if (!dest) {
        destMarkerRef.current?.remove();
        destMarkerRef.current = undefined;
        return;
      }
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled) return;
      if (!destMarkerRef.current) {
        const el = document.createElement("div");
        el.style.cssText = `width:24px;height:24px;display:grid;place-items:center;`;
        const dot = document.createElement("div");
        dot.style.cssText = `width:16px;height:16px;border-radius:50% 50% 50% 0;transform:rotate(45deg);background:${DEST};border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.25);`;
        el.appendChild(dot);
        destMarkerRef.current = new mapboxgl.Marker(el)
          .setLngLat(dest)
          .setPopup(
            new mapboxgl.Popup({ offset: 16, closeButton: false }).setHTML(
              `<div style="font-family:var(--font-mono),monospace;font-size:11px;letter-spacing:.03em;color:rgb(var(--n-700));">destination</div>`
            )
          )
          .addTo(map);
      } else {
        destMarkerRef.current.setLngLat(dest);
      }
      destMarkerRef.current
        .getPopup()
        ?.setHTML(
          `<div style="font-family:var(--font-mono),monospace;font-size:11px;letter-spacing:.03em;color:rgb(var(--n-700));">destination · ${escapeHtml(destLabel)}</div>`
        );
    })();
    return () => {
      cancelled = true;
    };
  }, [dest, destLabel]);

  // The core: marker visibility/highlight + route drawing, on any input change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || restMarkers.current.size === 0) return;
    let cancelled = false;

    const routesSrc = () => map.getSource("routes") as GeoJSONSource | undefined;
    // Full journey for one candidate: you → restaurant → drop-off → optional dest.
    const journeyPoints = (
      rest: MapRestaurant,
      drop: DropOffLocation
    ): [number, number][] => [
      myLocRef.current,
      [rest.lng, rest.lat],
      [drop.lng, drop.lat],
      ...(destRef.current ? [destRef.current] : []),
    ];

    const passesCat = (r: MapRestaurant) =>
      cats.size === 0 || r.categories.some((c) => cats.has(c));
    const passesFridge = (d: DropOffLocation) => !fridgeOnly || d.refrigerated;

    const resetRestMarker = (m: MapboxMarker) => {
      const el = m.getElement();
      const head = el.firstElementChild as HTMLElement | null;
      // Restore the root's intended display (grid centres the head); "" would
      // drop the inline display:grid and let the head fall off-centre.
      el.style.display = "grid";
      if (head) {
        head.style.outline = `0 solid ${REC}`;
        head.style.outlineOffset = "";
        head.style.opacity = "";
      }
    };
    const resetDropMarker = (m: MapboxMarker, id: string) => {
      const el = m.getElement();
      const dot = el.firstElementChild as HTMLElement | null;
      el.style.display = "grid";
      if (dot) {
        dot.style.outline = "";
        dot.style.outlineOffset = "";
        dot.style.transform = "";
        dot.style.opacity = "";
      }
      m.getPopup()?.setHTML((dropBaseHTML.current.get(id) ?? "") + "</div>");
    };

    const clearRoutes = () => {
      routeGeomsRef.current.clear();
      candidateEndpointsRef.current = null;
      routesSrc()?.setData(EMPTY);
    };
    // Default the chosen route to the shortest, but keep the user's current pick
    // when it's still one of the candidates (e.g. after a base-style swap).
    const settleActive = (ids: string[], shortId: string) => {
      const keep = activeRouteRef.current && ids.includes(activeRouteRef.current);
      const next = keep ? activeRouteRef.current! : shortId;
      activeRouteRef.current = next;
      setActiveRoute(next);
    };

    const apply = async () => {
      const sel = selected;

      // --- nothing selected: show everything (respecting filters), no lines ---
      if (!sel) {
        restMarkers.current.forEach((m, id) => {
          resetRestMarker(m);
          const r = restaurants.find((x) => x.id === id);
          if (r && !passesCat(r)) m.getElement().style.display = "none";
        });
        dropMarkers.current.forEach((m, id) => {
          resetDropMarker(m, id);
          const d = dropOffs.find((x) => x.id === id);
          if (d && !passesFridge(d)) m.getElement().style.display = "none";
        });
        clearRoutes();
        activeRouteRef.current = null;
        setActiveRoute(null);
        setPanel(null);
        return;
      }

      // ====================== RESTAURANT SELECTED ==========================
      if (sel.kind === "rest") {
        const rest = restaurants.find((r) => r.id === sel.id);
        if (!rest) return;
        const ranked = rankDropOffs(rest, dropOffs);
        const top3 = ranked.filter((x) => x.eligible).slice(0, 3);
        const reasons = new Map(ranked.map((x) => [x.dropOff.id, x.reason]));

        // Isolate restaurants to the selected one (and ring it clay as the anchor).
        restMarkers.current.forEach((m, id) => {
          resetRestMarker(m);
          const el = m.getElement();
          el.style.display = id === sel.id ? "grid" : "none";
          if (id === sel.id) {
            const head = el.firstElementChild as HTMLElement | null;
            if (head) {
              head.style.outline = `3px solid ${REC}`;
              head.style.outlineOffset = "2px";
            }
          }
        });
        // Drop-offs: eligible shown (candidate rings applied by paintRoutes),
        // ineligible dimmed with a reason in the popup.
        dropMarkers.current.forEach((m, id) => {
          resetDropMarker(m, id);
          const d = dropOffs.find((x) => x.id === id);
          const el = m.getElement();
          const dot = el.firstElementChild as HTMLElement | null;
          if (d && !passesFridge(d)) {
            el.style.display = "none";
            return;
          }
          const isEligible = ranked.find((x) => x.dropOff.id === id)?.eligible;
          if (!isEligible) {
            if (dot) dot.style.opacity = "0.35";
            const why = reasons.get(id);
            if (why)
              m.getPopup()?.setHTML(
                (dropBaseHTML.current.get(id) ?? "") +
                  `<div style="color:rgb(var(--failed-800));font-size:12px;margin-top:6px;">Can't take this load: ${escapeHtml(why)}</div></div>`
              );
          }
        });

        if (top3.length === 0) {
          clearRoutes();
          activeRouteRef.current = null;
          setActiveRoute(null);
          const nearMiss = ranked[0];
          setPanel({
            kind: "rest",
            name: rest.name,
            options: nearMiss
              ? [{ id: nearMiss.dropOff.id, name: `${nearMiss.dropOff.name} (${nearMiss.reason ?? "ineligible"})`, miles: nearMiss.miles, recommended: false }]
              : [],
          });
          return;
        }

        // Immediate panel (great-circle miles); drive times fill in after fetch.
        setPanel({
          kind: "rest",
          name: rest.name,
          options: top3.map((x) => ({ id: x.dropOff.id, name: x.dropOff.name, miles: x.miles, recommended: false })),
        });

        // Fetch one full journey per candidate drop-off.
        const routes = await Promise.all(
          top3.map((x) => fetchRouteMulti(journeyPoints(rest, x.dropOff)))
        );
        if (cancelled || selectedRef.current?.id !== sel.id) return;

        routeGeomsRef.current.clear();
        const ids: string[] = [];
        let shortIdx = -1;
        let shortMin = Infinity;
        routes.forEach((rt, i) => {
          const id = top3[i].dropOff.id;
          ids.push(id);
          if (rt) {
            routeGeomsRef.current.set(id, rt.coords);
            if (rt.minutes < shortMin) {
              shortMin = rt.minutes;
              shortIdx = i;
            }
          }
        });
        candidateEndpointsRef.current = { kind: "rest", ids };
        settleActive(ids, shortIdx >= 0 ? top3[shortIdx].dropOff.id : ids[0]);
        paintRoutes();

        setPanel({
          kind: "rest",
          name: rest.name,
          options: top3.map((x, i) => ({
            id: x.dropOff.id,
            name: x.dropOff.name,
            miles: routes[i]?.miles ?? x.miles,
            minutes: routes[i]?.minutes,
            recommended: i === shortIdx,
          })),
        });

        // Fit to every candidate journey.
        const pts: [number, number][] = [
          myLocRef.current,
          [rest.lng, rest.lat],
          ...top3.map((x) => [x.dropOff.lng, x.dropOff.lat] as [number, number]),
          ...(destRef.current ? [destRef.current] : []),
        ];
        if (pts.length > 1) map.fitBounds(boundsOf(pts), { padding: 80, maxZoom: 14 });
        return;
      }

      // ======================= DROP-OFF SELECTED ===========================
      const drop = dropOffs.find((d) => d.id === sel.id);
      if (!drop) return;
      const rankedR = rankRestaurantsForDropOff(drop, restaurants);
      const top3 = rankedR.filter((x) => x.eligible).slice(0, 3);
      const top3Ids = new Set(top3.map((x) => x.restaurant.id));

      // Isolate drop-offs to the selected one (ring it clay as the anchor).
      dropMarkers.current.forEach((m, id) => {
        resetDropMarker(m, id);
        const el = m.getElement();
        el.style.display = id === sel.id ? "grid" : "none";
        if (id === sel.id) {
          const dot = el.firstElementChild as HTMLElement | null;
          if (dot) {
            dot.style.outline = `3px solid ${REC}`;
            dot.style.outlineOffset = "2px";
          }
        }
      });
      // Restaurants: show the 3 closest eligible (candidate rings via paintRoutes),
      // hide the rest.
      restMarkers.current.forEach((m, id) => {
        resetRestMarker(m);
        if (!top3Ids.has(id)) m.getElement().style.display = "none";
      });

      setPanel({
        kind: "drop",
        name: drop.name,
        options: top3.map((x) => ({ id: x.restaurant.id, name: x.restaurant.name, miles: x.miles, recommended: false })),
      });

      if (top3.length === 0) {
        clearRoutes();
        activeRouteRef.current = null;
        setActiveRoute(null);
        return;
      }

      // Fetch one full journey per candidate restaurant.
      const routes = await Promise.all(
        top3.map((x) => fetchRouteMulti(journeyPoints(x.restaurant, drop)))
      );
      if (cancelled || selectedRef.current?.id !== sel.id) return;

      routeGeomsRef.current.clear();
      const ids: string[] = [];
      let shortIdx = -1;
      let shortMin = Infinity;
      routes.forEach((rt, i) => {
        const id = top3[i].restaurant.id;
        ids.push(id);
        if (rt) {
          routeGeomsRef.current.set(id, rt.coords);
          if (rt.minutes < shortMin) {
            shortMin = rt.minutes;
            shortIdx = i;
          }
        }
      });
      candidateEndpointsRef.current = { kind: "drop", ids };
      settleActive(ids, shortIdx >= 0 ? top3[shortIdx].restaurant.id : ids[0]);
      paintRoutes();

      setPanel({
        kind: "drop",
        name: drop.name,
        options: top3.map((x, i) => ({
          id: x.restaurant.id,
          name: x.restaurant.name,
          miles: routes[i]?.miles ?? x.miles,
          minutes: routes[i]?.minutes,
          recommended: i === shortIdx,
        })),
      });

      const pts: [number, number][] = [
        myLocRef.current,
        [drop.lng, drop.lat],
        ...top3.map((x) => [x.restaurant.lng, x.restaurant.lat] as [number, number]),
        ...(destRef.current ? [destRef.current] : []),
      ];
      if (pts.length > 1) map.fitBounds(boundsOf(pts), { padding: 80, maxZoom: 14 });
    };

    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
    return () => {
      cancelled = true;
    };
  }, [selected, cats, fridgeOnly, myLoc, dest, restaurants, dropOffs, styleVersion, paintRoutes]);

  // Picking a different route (map click or panel row) only repaints — the
  // resolved geometries are already cached, so no refetch and no refit.
  useEffect(() => {
    paintRoutes();
  }, [activeRoute, paintRoutes]);

  // Keep the selected restaurant's popup (the claim card) open and every other
  // restaurant popup closed. Mapbox's default marker-click toggle is suppressed
  // by our own click handler, so selection is the single source of truth for
  // which card is showing — that's what makes "claim from the card" reachable.
  useEffect(() => {
    restMarkers.current.forEach((m, id) => {
      const pop = m.getPopup();
      if (!pop) return;
      const shouldOpen = selected?.kind === "rest" && selected.id === id;
      if (shouldOpen && !pop.isOpen()) m.togglePopup();
      else if (!shouldOpen && pop.isOpen()) m.togglePopup();
    });
  }, [selected]);

  // When a selection first opens the panel (which renders below the map), nudge
  // the page so the panel is in view without scrolling the map out — a minimal
  // ("nearest") scroll keeps as much of the map visible as possible. Runs once
  // per selection, after the panel has rendered.
  useEffect(() => {
    if (!selected) {
      scrolledForRef.current = null;
      return;
    }
    const key = `${selected.kind}:${selected.id}`;
    if (scrolledForRef.current === key || !panel || !panelRef.current) return;
    scrolledForRef.current = key;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    panelRef.current.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "nearest" });
  }, [selected, panel]);

  // Reset the claim button whenever the chosen pickup changes.
  useEffect(() => {
    setClaimState("idle");
    setClaimMsg(null);
  }, [selected, activeRoute]);

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

  const fieldCls =
    "w-full rounded-xl border border-neutral-900/10 bg-card px-3 py-1.5 text-sm " +
    "placeholder:text-neutral-500 focus-visible:outline-none focus-visible:ring-2 " +
    "focus-visible:ring-transit-400 focus-visible:ring-offset-1";

  const setBtnCls =
    "shrink-0 rounded-xl bg-neutral-900 px-3 py-1.5 text-sm font-medium text-neutral-50 " +
    "transition-colors hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 " +
    "focus-visible:ring-rescued-400 focus-visible:ring-offset-1 disabled:opacity-40";

  // The currently chosen route, for the trip summary line in the panel.
  const activeOpt = panel?.options.find((o) => o.id === activeRoute) ?? null;

  // The restaurant + drop-off the chosen route runs between — one is the selected
  // anchor, the other is the active option. Shared by the info section, the claim
  // button and the Google Maps link.
  const activeRest =
    selected && activeRoute
      ? restaurants.find((r) => r.id === (selected.kind === "rest" ? selected.id : activeRoute))
      : undefined;
  const activeDrop =
    selected && activeRoute
      ? dropOffs.find((d) => d.id === (selected.kind === "rest" ? activeRoute : selected.id))
      : undefined;
  // A pickup is claimable only while the restaurant has an OPEN listing.
  const claimable = !!(activeRest?.listingId && activeRest.minutesLeft != null);

  // Deep-link the chosen journey (you → restaurant → drop-off → optional dest)
  // into Google Maps. The universal `?api=1` link opens the app on mobile and
  // the site on desktop. Google expects lat,lng; our points are [lng, lat].
  const gmapsUrl = (() => {
    if (!activeRest || !activeDrop) return null;
    const stops: [number, number][] = [
      myLoc,
      [activeRest.lng, activeRest.lat],
      [activeDrop.lng, activeDrop.lat],
      ...(dest ? [dest] : []),
    ];
    const fmt = (p: [number, number]) => `${p[1]},${p[0]}`;
    const waypoints = stops.slice(1, -1).map(fmt).join("|");
    return (
      "https://www.google.com/maps/dir/?api=1" +
      `&origin=${fmt(stops[0])}` +
      `&destination=${fmt(stops[stops.length - 1])}` +
      (waypoints ? `&waypoints=${encodeURIComponent(waypoints)}` : "") +
      "&travelmode=driving"
    );
  })();

  return (
    <div className="space-y-3">
      {/* Address inputs */}
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-neutral-600">
            Your location
          </label>
          <div className="flex gap-2">
            <input
              className={fieldCls}
              placeholder={myLabel}
              value={myInput}
              onChange={(e) => setMyInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onGeocode("me")}
            />
            <button
              type="button"
              onClick={() => onGeocode("me")}
              disabled={geoBusy === "me" || !myInput.trim()}
              className={setBtnCls}
            >
              {geoBusy === "me" ? "…" : "Set"}
            </button>
          </div>
          <button
            type="button"
            onClick={() => detectLocation(false)}
            disabled={geoBusy === "me"}
            className="mt-1.5 inline-flex items-center gap-1 font-mono text-[11px] text-clay-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400 disabled:opacity-50"
          >
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="2" x2="12" y2="5" />
              <line x1="12" y1="19" x2="12" y2="22" />
              <line x1="2" y1="12" x2="5" y2="12" />
              <line x1="19" y1="12" x2="22" y2="12" />
              <circle cx="12" cy="12" r="6" />
            </svg>
            {geoBusy === "me" ? "Locating…" : "Use my location"}
          </button>
        </div>
        <div>
          <label className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-neutral-600">
            Final destination <span className="text-neutral-400">(optional)</span>
          </label>
          <div className="flex gap-2">
            <input
              className={fieldCls}
              placeholder={dest ? destLabel : "e.g. 123 Lancaster Ave"}
              value={destInput}
              onChange={(e) => setDestInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onGeocode("dest")}
            />
            <button
              type="button"
              onClick={() => onGeocode("dest")}
              disabled={geoBusy === "dest" || !destInput.trim()}
              className={setBtnCls}
            >
              {geoBusy === "dest" ? "…" : "Set"}
            </button>
            {dest && (
              <button
                type="button"
                onClick={() => {
                  setDest(null);
                  setDestLabel("");
                }}
                className="shrink-0 font-mono text-[11px] text-clay-800 hover:underline -my-1.5 py-1.5"
              >
                clear
              </button>
            )}
          </div>
        </div>
      </div>
      {geoError && <p className="font-mono text-[11px] text-failed-600">{geoError}</p>}

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        {ALL_CATEGORIES.map((c) => {
          const on = cats.has(c);
          return (
            <button
              key={c}
              type="button"
              onClick={() => toggleCat(c)}
              className={cn(
                "rounded-full px-3 py-1 font-mono text-[11px] capitalize transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400 focus-visible:ring-offset-1",
                on
                  ? "bg-neutral-900 text-neutral-50"
                  : "border border-neutral-900/10 text-neutral-600 hover:border-neutral-900/25 hover:text-neutral-900"
              )}
            >
              {c}
            </button>
          );
        })}
        <span className="mx-1 h-4 w-px bg-neutral-200/60" />
        <button
          type="button"
          onClick={() => setFridgeOnly((v) => !v)}
          className={cn(
            "rounded-full px-3 py-1 font-mono text-[11px] transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400 focus-visible:ring-offset-1",
            fridgeOnly
              ? "bg-transit-600 text-neutral-50"
              : "border border-neutral-900/10 text-neutral-600 hover:border-neutral-900/25 hover:text-neutral-900"
          )}
        >
          ❄ refrigerated only
        </button>
        {(cats.size > 0 || fridgeOnly) && (
          <button
            type="button"
            onClick={() => {
              setCats(new Set());
              setFridgeOnly(false);
            }}
            className="font-mono text-[11px] text-clay-800 hover:underline -my-1.5 py-1.5"
          >
            clear
          </button>
        )}
      </div>

      <div className="relative">
        <div
          ref={container}
          className="h-[60vh] w-full overflow-hidden rounded-2xl border border-neutral-900/10 shadow-card"
        />

        {/* Legend — collapsible to free up the map on small screens */}
        {legendOpen ? (
          <div className="absolute left-3 top-3 space-y-1 rounded-2xl border border-neutral-900/10 bg-neutral-50/95 px-3.5 py-2.5 text-xs text-neutral-700 shadow-card">
            <div className="flex items-center justify-between gap-4">
              <span className="font-mono text-[10px] uppercase tracking-wide text-neutral-500">
                Restaurant urgency
              </span>
              <button
                type="button"
                onClick={() => setLegendOpen(false)}
                aria-label="Hide legend"
                className="-mr-1 shrink-0 rounded-full p-1.5 text-neutral-500 transition-colors hover:text-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400"
              >
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-full" style={{ background: URG_SOON }} />
              Under 30 min
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-full" style={{ background: URG_MID }} />
              Under 1 hour
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-full" style={{ background: URG_OPEN }} />
              Under 3 hours
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-full" style={{ background: URG_SPENT }} />
              All claimed
            </div>
            <div className="my-1 h-px bg-neutral-200/60" />
            <div className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-[3px]" style={{ background: DROP }} />
              Drop-off
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-full" style={{ background: ME }} />
              You
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-[3px]" style={{ background: DEST }} />
              Destination
            </div>
            <div className="my-1 h-px bg-neutral-200/60" />
            <div className="flex items-center gap-2">
              <span className="inline-block h-1 w-4 rounded-full" style={{ background: ROUTE }} />
              Chosen route
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block h-1 w-4 rounded-full" style={{ background: ROUTE_ALT }} />
              Alternative
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setLegendOpen(true)}
            aria-label="Show legend"
            className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full border border-neutral-900/10 bg-neutral-50/95 px-3 py-1.5 font-mono text-[11px] text-neutral-600 shadow-card transition-colors hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400 focus-visible:ring-offset-1"
          >
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 11v5M12 7.5h.01" />
            </svg>
            legend
          </button>
        )}
      </div>

      {/* Selection panel — rendered below the map (not overlaid) so it never
          covers the pins or routes; persists until "Show all" or re-clicking. */}
      {panel && (
        <div
          ref={panelRef}
          className="animate-fade-in rounded-2xl border border-neutral-900/10 bg-card px-4 py-3 shadow-card"
        >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-medium text-neutral-500">
                  {panel.kind === "rest" ? "Selected restaurant" : "Selected drop-off"}
                </div>
                <div className="truncate font-display text-base font-semibold text-neutral-900">
                  {panel.name}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="-mr-1 -mt-1 shrink-0 rounded-full px-3 py-1 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-900/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400"
              >
                Show all
              </button>
            </div>

            {panel.options.length > 1 && (
              <p className="mt-2 text-xs text-neutral-600">
                {panel.kind === "rest"
                  ? "Tap a route to choose which drop-off to deliver to."
                  : "Tap a route to choose which restaurant to pick up from."}
              </p>
            )}

            {panel.options.length === 0 ? (
              <p className="mt-3 rounded-xl border border-dashed border-neutral-900/15 px-3 py-3 text-center text-xs text-neutral-600">
                {panel.kind === "rest"
                  ? "No drop-off can take this load right now."
                  : "No restaurant nearby has food for this drop-off."}
              </p>
            ) : (
              <ul className="mt-3 space-y-1.5">
                {panel.options.map((o) => {
                  const isActive = o.id === activeRoute;
                  return (
                    <li key={o.id}>
                      <button
                        type="button"
                        onClick={() => setActiveRoute(o.id)}
                        aria-pressed={isActive}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-route focus-visible:ring-offset-1",
                          isActive
                            ? "border-route bg-route/[0.07] ring-1 ring-route"
                            : "border-neutral-900/10 hover:border-neutral-900/25 hover:bg-neutral-900/[0.02]"
                        )}
                      >
                        {/* line swatch — same blue / grey as this route on the map */}
                        <span
                          className={cn(
                            "h-1.5 w-6 shrink-0 rounded-full transition-colors",
                            isActive ? "bg-route" : "bg-route-alt"
                          )}
                          aria-hidden="true"
                        />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span
                            className={cn(
                              "truncate text-sm",
                              isActive ? "font-semibold text-route" : "font-medium text-neutral-900"
                            )}
                          >
                            {o.name}
                          </span>
                          {o.recommended && (
                            <span className="mt-1 inline-flex w-fit items-center rounded-full bg-clay-50 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-clay-800">
                              fastest
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 text-right">
                          {o.minutes != null ? (
                            <>
                              <span className={cn("block font-mono text-sm font-bold tabular-nums", isActive ? "text-route" : "text-neutral-900")}>
                                {o.minutes} min
                              </span>
                              <span className="block font-mono text-[11px] tabular-nums text-neutral-500">
                                {o.miles.toFixed(1)} mi
                              </span>
                            </>
                          ) : (
                            <span className={cn("block font-mono text-sm font-bold tabular-nums", isActive ? "text-route" : "text-neutral-900")}>
                              {o.miles.toFixed(1)} mi
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {activeOpt && (
              <div className="mt-3 flex items-center gap-2 border-t border-neutral-900/10 pt-3">
                <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-neutral-600">
                  you → {panel.kind === "rest" ? panel.name : activeOpt.name} →{" "}
                  {panel.kind === "rest" ? activeOpt.name : panel.name}
                  {dest ? " → destination" : ""}
                </span>
                {activeOpt.minutes != null && (
                  <span className="shrink-0 rounded-full bg-route/10 px-2 py-0.5 font-mono text-[11px] font-bold tabular-nums text-route">
                    {activeOpt.minutes} min · {activeOpt.miles.toFixed(1)} mi
                  </span>
                )}
              </div>
            )}

            {(activeRest || activeDrop) && (
              <>
                <button
                  type="button"
                  onClick={() => setInfoOpen((v) => !v)}
                  aria-expanded={infoOpen}
                  className="mt-3 flex w-full items-center justify-between gap-2 border-t border-neutral-900/10 pt-3 text-left text-xs font-medium text-neutral-700 transition-colors hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400 focus-visible:ring-offset-1"
                >
                  <span>More information</span>
                  <svg
                    viewBox="0 0 24 24"
                    width="16"
                    height="16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    className={cn("transition-transform", infoOpen && "rotate-180")}
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>

                {infoOpen && (
                  <div className="mt-3 grid gap-x-4 gap-y-4 sm:grid-cols-2">
                    {/* Pickup — header dot mirrors the restaurant pin's urgency color */}
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-white"
                          style={{ background: restColor(activeRest?.minutesLeft) }}
                        >
                          <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M3 2v7a2 2 0 0 0 2 2 2 2 0 0 0 2-2V2" />
                            <path d="M7 2v20" />
                            <path d="M21 15V2a5 5 0 0 0-5 5v6c0 1 1 2 2 2h3Zm0 0v7" />
                          </svg>
                        </span>
                        <span className="font-mono text-[10px] uppercase tracking-wide text-neutral-500">
                          Pickup
                        </span>
                      </div>
                      <div className="mt-1.5 truncate font-display text-sm font-semibold text-neutral-900">
                        {activeRest?.name ?? "—"}
                      </div>
                      {activeRest && (
                        <>
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            <InfoChip tone={urgencyTone(activeRest.minutesLeft)}>
                              {activeRest.minutesLeft != null
                                ? `${activeRest.minutesLeft} min left`
                                : "all claimed"}
                            </InfoChip>
                            <span className="font-mono text-[11px] text-neutral-600">
                              ~{activeRest.servings} servings · {activeRest.count} listing
                              {activeRest.count === 1 ? "" : "s"}
                            </span>
                          </div>
                          {activeRest.categories.length > 0 && (
                            <div className="mt-1 truncate font-mono text-[11px] text-neutral-500">
                              {activeRest.categories.join(", ")}
                              {activeRest.perishable ? " · perishable" : ""}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    {/* Drop-off — header square + plum dot mirrors the drop-off pin */}
                    <div className="sm:border-l sm:border-neutral-900/10 sm:pl-4">
                      <div className="flex items-center gap-2">
                        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-[6px] bg-transit-600 text-white">
                          <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
                            <path d="M3.3 7 12 12l8.7-5" />
                            <path d="M12 22V12" />
                          </svg>
                        </span>
                        <span className="font-mono text-[10px] uppercase tracking-wide text-neutral-500">
                          Drop-off
                        </span>
                      </div>
                      <div className="mt-1.5 truncate font-display text-sm font-semibold text-neutral-900">
                        {activeDrop?.name ?? "—"}
                      </div>
                      {activeDrop && (
                        <>
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            <InfoChip tone={activeDrop.refrigerated ? "transit" : "neutral"}>
                              {activeDrop.refrigerated ? "❄ refrigerated" : "ambient"}
                            </InfoChip>
                            <span className="font-mono text-[11px] text-neutral-600">
                              holds {activeDrop.capacity}
                            </span>
                          </div>
                          <div className="mt-1 truncate font-mono text-[11px] text-neutral-500">
                            accepts {activeDrop.acceptedCategories.join(", ")}
                          </div>
                          {activeDrop.notes && (
                            <div className="mt-1 truncate font-mono text-[11px] text-neutral-500">
                              {activeDrop.notes}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}

            {(claimable || gmapsUrl) && (
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                {claimable && (
                  <button
                    type="button"
                    onClick={() => activeRest?.listingId && onClaim(activeRest.listingId)}
                    disabled={claimState === "claiming" || claimState === "done"}
                    className="flex flex-1 items-center justify-center gap-2 rounded-full bg-gradient-to-b from-rescued-400 to-rescued-600 px-4 py-2.5 text-sm font-bold text-white shadow-glow transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400 focus-visible:ring-offset-2 disabled:opacity-60 disabled:hover:translate-y-0"
                  >
                    {claimState === "claiming"
                      ? "Claiming…"
                      : claimState === "done"
                        ? "Claimed ✓"
                        : "Claim pickup"}
                  </button>
                )}
                {gmapsUrl && (
                  <a
                    href={gmapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex flex-1 items-center justify-center gap-2 rounded-full border-2 border-route/70 bg-card px-4 py-2 text-sm font-bold text-route transition-colors hover:bg-route/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-route focus-visible:ring-offset-1"
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polygon points="3 11 22 2 13 21 11 13 3 11" />
                    </svg>
                    Open in Google Maps
                  </a>
                )}
              </div>
            )}

            {claimState === "done" && (
              <Link
                href="/pickups"
                className="mt-2 block text-center font-mono text-[11px] text-rescued-600 hover:underline"
              >
                View in my pickups →
              </Link>
            )}
            {claimState === "error" && (
              <p className="mt-2 text-center font-mono text-[11px] text-failed-600">{claimMsg}</p>
            )}
          </div>
        )}
    </div>
  );
}
