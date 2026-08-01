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
import { RAMP } from "@/lib/rampColors";
import { formatTimeLeft } from "@/lib/time";
import { MAP_STYLES, createModeToggle, createHomeControl, type MapMode } from "@/lib/mapStyles";
import { cn } from "./cn";
import { useTripPlan } from "./map/useTripPlan";
import { useIsWide } from "./map/useIsWide";
import { TripItinerary } from "./map/TripItinerary";
import { LocationSearchField } from "./map/LocationSearchField";
import { rememberRecent } from "@/lib/mapSuggestions";
import type { Stop } from "@/lib/tripPlan";
import type { DropOffLocation, MapRestaurant } from "@/lib/types";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

// Pin/line hex MUST mirror the ramp tokens — sourced from lib/rampColors so the
// values live in one place (DESIGN.md). The map carries two pin hues only:
// sage = pickup, plum = drop-off. Urgency is NEVER encoded in pin color (it
// would shout across the whole map); it lives in the card/panel where it's
// paired with a label. Clay is the route/accent.
const PICKUP = RAMP.transit600; // restaurant pickup pins — plum, so they stand off the green satellite imagery (sage blended in); no urgency hue
const DROP = RAMP.clay600; // drop-offs — terracotta (the destination hue), warm contrast vs the plum pickups
const SEL = RAMP.ink; // selection / recommended halo — neutral ink, so it stays visible on BOTH the plum pickup and terracotta drop-off pins
const ME = RAMP.route; // "my location" — the universally recognized blue location dot
const DEST = RAMP.clay800; // final destination flag
const ROUTE = RAMP.route; // the chosen/active route line (maps blue)
const ROUTE_ALT = RAMP.routeAlt; // the muted alternative routes

// --- Shared status-chip tokens for the in-panel "More information" tiles. ----
// Color-blind-safe: every chip pairs its ramp tint with a dot and a mono label.
type ChipTone = "rescued" | "urgent" | "failed" | "transit" | "neutral";
const CHIP_FILL: Record<ChipTone, string> = {
  rescued: "bg-rescued-50 text-rescued-800",
  urgent: "bg-urgent-50 text-urgent-800",
  failed: "bg-failed-50 text-failed-800",
  transit: "bg-transit-50 text-transit-800",
  neutral: "bg-neutral-100 text-neutral-700",
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
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] font-medium",
        CHIP_FILL[tone]
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", CHIP_DOT[tone])} aria-hidden="true" />
      {children}
    </span>
  );
}

// Google-style teardrop pin drawn as a SINGLE svg path, so its white outline is
// one continuous stroke of even thickness around the whole silhouette (head +
// point) — no seam where a tail meets a round head. A glyph (white) and an
// optional selection halo (the inherited --sel custom property) layer on top of
// that same shape.
const PIN_PATH =
  "M14 1.5C7.1 1.5 1.5 7.1 1.5 14c0 8.7 11 22.7 11.5 23.3a1.3 1.3 0 0 0 2 0C15.5 36.7 26.5 22.7 26.5 14 26.5 7.1 20.9 1.5 14 1.5Z";
// Glyphs are path-only (no wrapper <svg>) so they drop into a nested, auto-scaling
// <svg> centred on the head. Crossed fork & knife = restaurant pickup; flag =
// drop-off destination — instantly distinguishable from each other.
const GLYPH_REST = `<path d="m16 2-2.3 2.3a3 3 0 0 0 0 4.2l1.8 1.8a3 3 0 0 0 4.2 0L22 8"/><path d="M15 15 3.3 3.3a4.2 4.2 0 0 0 0 6l7.3 7.3c.7.7 2 .7 2.8 0L15 15Zm0 0 7 7"/><path d="m2.1 21.8 6.4-6.3"/><path d="m19 5-7 7"/>`;
const GLYPH_DROP = `<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>`;

// A full pin: the selection halo (transparent until --sel is set), the coloured
// body with its single continuous white outline, then the centred white glyph.
function pinSVG(fill: string, glyph: string): string {
  return (
    `<svg width="28" height="38" viewBox="0 0 28 39" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block;overflow:visible;">` +
    `<path class="mm-halo" d="${PIN_PATH}" fill="none" stroke-width="6" stroke-linejoin="round"/>` +
    `<path d="${PIN_PATH}" fill="${fill}" stroke="#fff" stroke-width="2.4" stroke-linejoin="round"/>` +
    `<svg x="7" y="6.5" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${glyph}</svg>` +
    `</svg>`
  );
}

// Miniature of the real map pin for the legend, so the key matches what's on
// the map (same teardrop, same glyph, same hue) instead of a stand-in swatch.
// The glyph is the static path string used by the markers, scaled to match
// pinSVG's nested 24→14 glyph transform (translate 7,6.5 · scale 14/24).
function LegendPin({ fill, glyph }: { fill: string; glyph: string }) {
  return (
    <svg width="15" height="20" viewBox="0 0 28 39" aria-hidden="true" className="shrink-0">
      <path d={PIN_PATH} fill={fill} stroke="#fff" strokeWidth={2.4} strokeLinejoin="round" />
      <g
        transform="translate(7 6.5) scale(0.5833)"
        fill="none"
        stroke="#fff"
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        dangerouslySetInnerHTML={{ __html: glyph }}
      />
    </svg>
  );
}

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
    /* Google-style teardrop pin: the whole shape is one svg path, so the white
       outline is a single continuous, even stroke. We do NOT drop-shadow the
       silhouette — on a pin that tapers to a point that renders as a hard black
       triangle below the tip. Instead a soft elliptical "ground shadow" sits at
       the point (the ::before below), grounding the pin without the spike.
       transform:translateZ(0) makes the head its own stacking context so the
       z-index:-1 ground shadow tucks behind the pin body but above the map. */
    .mm-pin-head{position:relative;transform:translateZ(0);transition:opacity .12s ease;}
    .mm-pin-head svg{display:block;position:relative;}
    .mm-pin-head::before{content:"";position:absolute;left:50%;bottom:-1px;z-index:-1;
      width:14px;height:5px;transform:translateX(-50%);border-radius:50%;
      background:rgba(51,52,44,.32);filter:blur(1.5px);
      transition:width .14s ease, height .14s ease, background .14s ease;}
    .mm-pin:hover .mm-pin-head::before{width:19px;height:6px;background:rgba(51,52,44,.24);}
    /* Selection halo: the --sel custom property (set on the marker head in JS)
       inherits into the svg; CSS resolves the var here, since var() can't be used
       in a raw SVG presentation attribute. Transparent = not selected. */
    .mm-halo{stroke:var(--sel,transparent);}
    /* "You are here": a live, expanding accuracy ring behind the dot — the
       universally recognized current-location cue. The pulse transforms only
       this child, never the Mapbox-positioned root, so the pin stays put. */
    .mm-me-pulse{position:absolute;width:40px;height:40px;border-radius:50%;background:${ME};
      opacity:.22;animation:mm-me-ping 2.6s cubic-bezier(0,0,.2,1) infinite;}
    @keyframes mm-me-ping{0%{transform:scale(.32);opacity:.4;}70%{opacity:0;}100%{transform:scale(1);opacity:0;}}
    @media (prefers-reduced-motion: reduce){.mm-pin-head,.mm-pin-head::before{transition:none;}.mm-me-pulse{animation:none;opacity:.15;}}
    /* Lift the map's bottom controls + attribution above the selection sheet
       (which floats over the map) so they stay reachable while a pin is picked.
       --mm-sheet-h is set to the sheet's height in JS; 0 when nothing's open. */
    .mm-map-shell .mapboxgl-ctrl-bottom-right,.mm-map-shell .mapboxgl-ctrl-bottom-left{transition:bottom .22s ease;bottom:var(--mm-sheet-h,0px);}
    @media (prefers-reduced-motion: reduce){.mm-map-shell .mapboxgl-ctrl-bottom-right,.mm-map-shell .mapboxgl-ctrl-bottom-left{transition:none;}}
  `;
  document.head.appendChild(s);
}

function boundsOf(pts: [number, number][]): [[number, number], [number, number]] {
  const lngs = pts.map((p) => p[0]);
  const lats = pts.map((p) => p[1]);
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
}

// Frame a journey into the part of the map NOT covered by the selection panel,
// which now floats as a bottom sheet over the map (rather than shrinking it —
// that resize used to blank the satellite tiles, reading as a jarring "reload"
// on every click). We pad the bottom by roughly the sheet's height so the route
// sits fully visible above it, and glide with `linear` (easeTo) instead of the
// default fly-to arc — no zoom-out means the tiles already on screen mostly
// stay, so the move is smooth and the route-draw animation is actually seen.
// Padding is clamped well inside the canvas (mapbox throws "cannot fit within
// canvas" if top+bottom ≥ height or left+right ≥ width).
// `dock` says where the controls sit, so the route is framed into the part of
// the canvas they don't cover: a bottom sheet below lg, a left-hand column at
// lg and above. Getting this wrong doesn't look like a layout bug — the route
// just draws underneath the panel and reads as a broken camera.
function fitToRoute(
  map: MapboxMap,
  pts: [number, number][],
  dock: "bottom" | "left"
): void {
  if (pts.length < 2) return;
  const canvas = map.getCanvas();
  const h = canvas.clientHeight;
  const w = canvas.clientWidth;
  const top = Math.min(56, Math.floor(h * 0.15));
  const bottom =
    dock === "bottom"
      ? Math.min(Math.round(h * 0.42) + 16, Math.floor(h * 0.5))
      : Math.min(56, Math.floor(h * 0.15));
  // The column is w-[340px] at left-3, so clear 340 + 12 + 12.
  const left =
    dock === "left"
      ? Math.min(364, Math.floor(w * 0.45))
      : Math.min(48, Math.floor(w * 0.18));
  const right = Math.min(48, Math.floor(w * 0.18));
  map.fitBounds(boundsOf(pts), {
    padding: { top, bottom, left, right },
    maxZoom: 14,
    linear: true,
    duration: 620,
  });
}

// Animate the active route "drawing in" via line-trim-offset (mapbox-gl ≥ 2.9):
// the property hides the [p, 1] fraction of the line, so sweeping p from 0 → 1
// reveals it start → end; the white casing draws in lockstep. Best-effort and
// non-blocking — never throws, and if the property is unsupported it leaves the
// line fully shown. Instant under reduced motion. Only a paint property changes,
// so no tiles or sources reload.
function drawActiveRoute(map: MapboxMap, cancelled: () => boolean): void {
  const LAYERS = ["route-casing", "route-active"];
  const setTrim = (p: number) => {
    for (const id of LAYERS) {
      try {
        if (map.getLayer(id)) map.setPaintProperty(id, "line-trim-offset", [p, 1]);
      } catch {
        /* unsupported — leave fully drawn */
      }
    }
  };
  const reveal = () => {
    for (const id of LAYERS) {
      try {
        if (map.getLayer(id)) map.setPaintProperty(id, "line-trim-offset", [0, 0]);
      } catch {
        /* ignore */
      }
    }
  };
  const reduce =
    typeof window !== "undefined" &&
    !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (reduce) {
    reveal();
    return;
  }
  const DURATION = 650;
  let start = 0;
  setTrim(0); // start fully hidden
  const tick = (now: number) => {
    if (!start) start = now;
    if (cancelled() || !map.getLayer("route-active")) {
      reveal();
      return;
    }
    const t = Math.min(1, (now - start) / DURATION);
    setTrim(1 - Math.pow(1 - t, 3)); // easeOutCubic sweep
    if (t < 1) requestAnimationFrame(tick);
    else reveal();
  };
  requestAnimationFrame(tick);
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
  canClaim = true,
}: {
  restaurants: MapRestaurant[];
  dropOffs: DropOffLocation[];
  /** Org admins oversee but don't carry pickups — hide the claim affordance. */
  canClaim?: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap>();
  const roRef = useRef<ResizeObserver>();
  const restMarkers = useRef(new Map<string, MapboxMarker>());
  const dropMarkers = useRef(new Map<string, MapboxMarker>());
  const meMarkerRef = useRef<MapboxMarker>();
  const destMarkerRef = useRef<MapboxMarker>();
  const routeCache = useRef(new Map<string, RouteInfo | null>());
  const panelRef = useRef<HTMLDivElement>(null);
  // Tracks which selection we've already scrolled the panel into view for, so we
  // do it once per selection (not on every panel re-render as routes resolve).
  const scrolledForRef = useRef<string | null>(null);

  const [selected, setSelected] = useState<Selection>(null);
  const [panel, setPanel] = useState<Panel>(null);
  // Layer visibility — let people declutter the map by hiding either marker type.
  const [showRest, setShowRest] = useState(true);
  // Drop-offs start hidden so the first view is calm and pickup-focused; selecting
  // a pickup still reveals its candidate drop-offs (the selection flow ignores this).
  const [showDrop, setShowDrop] = useState(false);
  const [mode, setMode] = useState<MapMode>("satellite");
  const [infoOpen, setInfoOpen] = useState(false);
  // The search/controls card hides on its own when a pin is selected (the panel
  // below needs the room) and returns when the selection is cleared; the X / the
  // collapsed "search" pill let the user override either way.
  const [searchOpen, setSearchOpen] = useState(true);
  // Bumped after a base-style swap finishes, so the line-drawing effect re-runs
  // and repaints routes onto the freshly re-added sources.
  const [styleVersion, setStyleVersion] = useState(0);
  // Drives the docked column at lg (and the camera padding that goes with it).
  const isWide = useIsWide();

  const { plan, pickStop, setStop, clearAll } = useTripPlan({ restaurants, dropOffs });
  const [recent, setRecent] = useState<Stop[]>([]);

  // Aliases so the existing map/camera/marker code reads unchanged.
  const myLoc = plan.start.center;
  const myLabel = plan.start.label;
  const dest = plan.end?.center ?? null;
  const destLabel = plan.end?.label ?? "";

  // Which journey is the chosen (blue) route, keyed by the varying waypoint's id
  // (drop-off in rest mode, restaurant in drop mode). With fixed slots there is
  // exactly one journey once both ends are filled, so the active route follows
  // the trip rather than being independently selected. null = nothing drawn.
  const activeRoute =
    panel?.kind === "rest"
      ? plan.dropOff?.kind === "drop"
        ? plan.dropOff.id
        : null
      : panel?.kind === "drop"
        ? plan.pickup?.kind === "rest"
          ? plan.pickup.id
          : null
        : null;

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
        head.style.setProperty("--sel", id === activeId ? ROUTE : SEL);
      });
    }
  }, []);

  // Trip persistence now lives in useTripPlan (one `mm.trip` key, with a one-time
  // migration off the old four). All that's left here is the first-visit nudge.
  const askedForLocation = useRef(false);
  useEffect(() => {
    if (askedForLocation.current) return;
    askedForLocation.current = true;
    // First visit (nothing saved at all) → quietly ask the device for its location.
    if (!localStorage.getItem("mm.trip") && !localStorage.getItem("mm.myLoc")) {
      detectLocation(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hiding a layer also drops a selection of that kind, so the panel/route never
  // points at markers that are no longer on the map.
  function toggleLayer(kind: "rest" | "drop") {
    if (kind === "rest") {
      setShowRest((v) => !v);
      if (showRest) setSelected((s) => (s?.kind === "rest" ? null : s));
    } else {
      setShowDrop((v) => !v);
      if (showDrop) setSelected((s) => (s?.kind === "drop" ? null : s));
    }
  }

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


  // Use the device's GPS/location (needs HTTPS + permission). `auto` is the
  // silent first-load attempt: on failure we keep the default and stay quiet;
  // a manual tap surfaces the reason so the user can fall back to an address.
  // The silent attempt sets the routing origin but never moves the camera — see
  // the success handler — so the map opens to the same frame every time.
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
        setStop("start", { kind: "place", center: c, label: "Your location" });
        setMyInput("");
        // Only a deliberate "use my location" tap recenters the map. The silent
        // first-load fix stays camera-quiet: it can't reframe a consistent
        // opening view, trigger an extra round of tile loads, or snap the camera
        // off a route the user is already reading after clicking a pin.
        if (!auto) mapRef.current?.flyTo({ center: c, zoom: 13 });
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
        // Default attribution sits bottom-right; we move it to bottom-left (below)
        // so the bottom-right corner is free for the compass/home/toggle stack.
        attributionControl: false,
      });
      mapRef.current = map;

      // Keep the canvas matched to its container. With the full-bleed layout the
      // map can initialize before the box has its final size (→ a grey gutter),
      // and the box also changes on rotate/resize. A ResizeObserver calls
      // resize() on every change; we also nudge once on load below.
      const ro = new ResizeObserver(() => mapRef.current?.resize());
      ro.observe(container.current);
      roRef.current = ro;

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

      // Map controls live bottom-right so they never collide with the top-left
      // search card (which grows to ~340px wide / 45% tall on phones and would
      // otherwise overlap a top-right stack). Compass only — zoom +/- is handled
      // by pinch/scroll; the home button restores the framed view. They stack
      // upward in add order: compass (lowest), home, then mode toggle.
      map.addControl(
        new mapboxgl.AttributionControl({ compact: true }),
        "bottom-left"
      );
      map.addControl(
        new mapboxgl.NavigationControl({ showZoom: false, showCompass: true }),
        "bottom-right"
      );
      map.addControl(createHomeControl({ onClick: resetView }), "bottom-right");
      const toggle = createModeToggle({ initial: modeRef.current, onChange: setMode });
      toggleRef.current = toggle;
      map.addControl(toggle, "bottom-right");

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
        .addTo(map);

      // Restaurant markers — plum pickup pin with a utensils glyph (one flat
      // color, never urgency); clicking isolates. Root is Mapbox-positioned; the inner head
      // carries hover/scale/outline so the pin never lags the map.
      // The root MUST NOT set `position`: Mapbox's `.mapboxgl-marker` sets
      // `position:absolute` and places each pin via a transform from the
      // container origin. An inline `position:relative` overrides that and drops
      // the pin back into normal flow — then toggling `display` to filter pins
      // reflows (shifts) every other pin. Stay out of flow; let Mapbox position.
      for (const r of restaurants) {
        const el = document.createElement("div");
        el.className = "mm-pin";
        el.style.cssText = `width:28px;height:38px;display:grid;place-items:center;`;
        const head = document.createElement("div");
        head.className = "mm-pin-head";
        head.style.cssText = `line-height:0;`;
        head.innerHTML = pinSVG(PICKUP, GLYPH_REST);
        el.appendChild(head);
        el.setAttribute("role", "button");
        el.setAttribute("aria-label", `Pickup: ${r.name}, ${r.servings} servings`);
        el.addEventListener("click", (ev) => {
          ev.stopPropagation();
          setSelected((cur) =>
            cur?.kind === "rest" && cur.id === r.id ? null : { kind: "rest", id: r.id }
          );
          pickStop({ kind: "rest", id: r.id, center: [r.lng, r.lat], label: r.name });
        });
        restMarkers.current.set(
          r.id,
          new mapboxgl.Marker({ element: el, anchor: "bottom" }).setLngLat([r.lng, r.lat]).addTo(map)
        );
      }

      // Drop-off markers — terracotta teardrop pin with a flag glyph (the flag +
      // warm hue read clearly apart from the sage fork-&-knife pickup pins);
      // clicking isolates and finds the closest restaurants.
      for (const d of dropOffs) {
        const el = document.createElement("div");
        el.className = "mm-pin";
        el.style.cssText = `width:28px;height:38px;display:grid;place-items:center;`;
        const dot = document.createElement("div");
        dot.className = "mm-pin-head";
        dot.style.cssText = `line-height:0;`;
        dot.innerHTML = pinSVG(DROP, GLYPH_DROP);
        el.appendChild(dot);
        el.setAttribute("role", "button");
        el.setAttribute("aria-label", `Drop-off: ${d.name}`);
        el.addEventListener("click", (ev) => {
          ev.stopPropagation();
          setSelected((cur) =>
            cur?.kind === "drop" && cur.id === d.id ? null : { kind: "drop", id: d.id }
          );
          pickStop({ kind: "drop", id: d.id, center: [d.lng, d.lat], label: d.name });
        });
        dropMarkers.current.set(
          d.id,
          new mapboxgl.Marker({ element: el, anchor: "bottom" }).setLngLat([d.lng, d.lat]).addTo(map)
        );
      }

      // Clicking empty map space deliberately does NOT dismiss the route panel —
      // it stays until "Show all" or re-clicking the selected pin, so a chosen
      // route (and its Open-in-Google-Maps link) survives a stray map click.

      map.on("mouseenter", "route-hit", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "route-hit", () => {
        map.getCanvas().style.cursor = "";
      });

      map.on("load", () => {
        addRouteLayers(map);
        map.resize();
        resetView();
      });
    })();

    return () => {
      cancelled = true;
      roRef.current?.disconnect();
      roRef.current = undefined;
      mapRef.current?.remove();
      mapRef.current = undefined;
      toggleRef.current = undefined;
      rMarkers.clear();
      dMarkers.clear();
    };
    // Build exactly once per mount. restaurants/drop-offs are fixed for the
    // page's lifetime, so they're read from the initial closure — keeping them
    // out of the deps means a re-render can never tear the map down and
    // re-instantiate it (a billed map load + a visible reload). The map loads
    // the same way on every login / app open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Reposition the "you" marker when myLoc changes.
  useEffect(() => {
    const m = meMarkerRef.current;
    if (!m) return;
    m.setLngLat(myLoc);
  }, [myLoc]);

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
          .addTo(map);
      } else {
        destMarkerRef.current.setLngLat(dest);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dest]);

  // The core: marker visibility/highlight + route drawing, on any input change.
  useEffect(() => {
    const map = mapRef.current;
    // Gate on having ANY pins to work with — restaurants OR drop-offs. Keying
    // only on restaurants meant a map with drop-offs but no live pickups (e.g.
    // every open listing has drifted expired/scheduled) went fully inert: even
    // drop-off pins stopped responding to clicks.
    if (!map || (restMarkers.current.size === 0 && dropMarkers.current.size === 0))
      return;
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

    const resetRestMarker = (m: MapboxMarker) => {
      const el = m.getElement();
      const head = el.firstElementChild as HTMLElement | null;
      // Restore the root's intended display (grid centres the head); "" would
      // drop the inline display:grid and let the head fall off-centre.
      el.style.display = "grid";
      if (head) {
        head.style.removeProperty("--sel");
        head.style.opacity = "";
      }
    };
    const resetDropMarker = (m: MapboxMarker) => {
      const el = m.getElement();
      const dot = el.firstElementChild as HTMLElement | null;
      el.style.display = "grid";
      if (dot) {
        dot.style.removeProperty("--sel");
        dot.style.opacity = "";
      }
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
    };

    const apply = async () => {
      const sel = selected;

      // --- nothing selected: show each layer that's toggled on, no lines ---
      if (!sel) {
        restMarkers.current.forEach((m) => {
          resetRestMarker(m);
          if (!showRest) m.getElement().style.display = "none";
        });
        dropMarkers.current.forEach((m) => {
          resetDropMarker(m);
          if (!showDrop) m.getElement().style.display = "none";
        });
        clearRoutes();
        activeRouteRef.current = null;
        setPanel(null);
        return;
      }

      // ====================== RESTAURANT SELECTED ==========================
      if (sel.kind === "rest") {
        const rest = restaurants.find((r) => r.id === sel.id);
        if (!rest) return;
        const ranked = rankDropOffs(rest, dropOffs);
        const top3 = ranked.filter((x) => x.eligible).slice(0, 3);

        // Isolate restaurants to the selected one (and ring it as the anchor).
        restMarkers.current.forEach((m, id) => {
          resetRestMarker(m);
          const el = m.getElement();
          el.style.display = id === sel.id ? "grid" : "none";
          if (id === sel.id) {
            const head = el.firstElementChild as HTMLElement | null;
            if (head) head.style.setProperty("--sel", SEL);
          }
        });
        // Drop-offs: always revealed for the selected pickup (the whole point is
        // showing where it can go) — independent of the "show drop-offs" toggle.
        // Eligible shown full (candidate rings via paintRoutes), ineligible dimmed.
        dropMarkers.current.forEach((m, id) => {
          resetDropMarker(m);
          const el = m.getElement();
          const dot = el.firstElementChild as HTMLElement | null;
          const isEligible = ranked.find((x) => x.dropOff.id === id)?.eligible;
          if (!isEligible && dot) dot.style.opacity = "0.35";
        });

        if (top3.length === 0) {
          clearRoutes();
          activeRouteRef.current = null;
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
        // Animate the chosen path drawing in (non-blocking; the panel already shows).
        drawActiveRoute(map, () => cancelled || selectedRef.current?.id !== sel.id);

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
        // Glide to frame every candidate journey clear of the docked controls.
        fitToRoute(map, pts, isWide ? "left" : "bottom");
        return;
      }

      // ======================= DROP-OFF SELECTED ===========================
      const drop = dropOffs.find((d) => d.id === sel.id);
      if (!drop) return;
      const rankedR = rankRestaurantsForDropOff(drop, restaurants);
      const top3 = rankedR.filter((x) => x.eligible).slice(0, 3);
      const top3Ids = new Set(top3.map((x) => x.restaurant.id));

      // Isolate drop-offs to the selected one (ring it as the anchor). The
      // selected drop-off always shows, regardless of the "show drop-offs" toggle.
      dropMarkers.current.forEach((m, id) => {
        resetDropMarker(m);
        const el = m.getElement();
        el.style.display = id === sel.id ? "grid" : "none";
        if (id === sel.id) {
          const dot = el.firstElementChild as HTMLElement | null;
          if (dot) dot.style.setProperty("--sel", SEL);
        }
      });
      // Restaurants: show the 3 closest eligible (candidate rings via paintRoutes),
      // hide the rest — always revealed so the drop-off's sources are visible.
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
      // Animate the chosen path drawing in (non-blocking; the panel already shows).
      drawActiveRoute(map, () => cancelled || selectedRef.current?.id !== sel.id);

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
      // Glide to frame every candidate journey clear of the docked controls.
      fitToRoute(map, pts, isWide ? "left" : "bottom");
    };

    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
    return () => {
      cancelled = true;
    };
  }, [selected, showRest, showDrop, myLoc, dest, restaurants, dropOffs, styleVersion, paintRoutes, isWide]);

  // Picking a different route (map click or panel row) only repaints — the
  // resolved geometries are already cached, so no refetch and no refit.
  useEffect(() => {
    paintRoutes();
  }, [activeRoute, paintRoutes]);

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

  // Mirror the floating sheet's live height into a CSS var so the map's bottom
  // controls/attribution lift to sit just above it (0 when nothing's selected).
  // Re-runs as the panel's content resolves (drive times fill in → taller).
  useEffect(() => {
    const shell = container.current;
    if (!shell) return;
    const h = panel && panelRef.current ? panelRef.current.offsetHeight : 0;
    shell.style.setProperty("--mm-sheet-h", `${h}px`);
  }, [panel]);

  // Auto-hide the search/controls card while a pin is selected (the docked panel
  // needs the space); restore it when the selection clears. At lg the legend and
  // the panel share a column, so the legend stays put — hiding it is exactly
  // what the docked layout is meant to avoid.
  useEffect(() => {
    setSearchOpen(isWide || !selected);
  }, [selected, isWide]);

  if (!TOKEN) {
    return (
      <div className="grid h-[60vh] place-items-center rounded-2xl border border-dashed border-neutral-200 bg-card text-center">
        <div>
          <p className="text-sm text-neutral-700">The map needs a Mapbox token.</p>
          <p className="mt-1 font-mono text-xs text-neutral-700">
            Add NEXT_PUBLIC_MAPBOX_TOKEN to Code/.env, then restart the dev server.
          </p>
        </div>
      </div>
    );
  }

  const fieldCls =
    "w-full rounded-xl border border-neutral-900/10 bg-card px-3 py-1.5 text-sm " +
    "placeholder:text-neutral-700 focus-visible:outline-none focus-visible:ring-2 " +
    "focus-visible:ring-rescued-400 focus-visible:ring-offset-1";


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
  // A pickup is claimable only while the restaurant has an OPEN listing — and
  // only for roles that carry pickups (org admins oversee, they don't claim).
  const claimable =
    canClaim && !!(activeRest?.listingId && activeRest.minutesLeft != null);

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
    <div className="relative flex h-full w-full flex-col">
      {/* MAP AREA — always fills the frame. The selection panel floats over it as
          a bottom sheet (see below) rather than shrinking it: resizing the map on
          every click forced a satellite-tile reload that flashed grey. Keeping the
          canvas a fixed size means no resize, no reload — just a smooth glide. */}
      <div className="relative min-h-0 flex-1">
        {/* Sized with h/w-full (not inset-0): mapbox-gl.css forces the map element
            to position:relative, on which inset offsets wouldn't size it. */}
        <div ref={container} className="mm-map-shell h-full w-full" />

        {/* Overlay is click-through (pointer-events-none) so map drag/zoom works in
            the gaps; the controls card re-enables events with pointer-events-auto. */}
        <div className="pointer-events-none absolute inset-0 z-[1] lg:flex lg:flex-col lg:gap-3 lg:p-3">
          {searchOpen ? (
            // Controls (top-left): title + hide, address inputs, layer toggles,
            // map key. Scrolls internally if it outgrows a short viewport.
            <div className="pointer-events-auto absolute left-3 top-3 flex max-h-[45%] w-[min(92vw,340px)] flex-col gap-3 overflow-y-auto rounded-2xl border border-neutral-900/10 bg-neutral-50/95 p-3.5 shadow-card backdrop-blur-sm md:max-h-[calc(100%_-_1.5rem)] lg:static lg:max-h-none lg:w-[340px] lg:shrink-0 lg:overflow-visible">
          <div className="flex items-center justify-between gap-3">
            <h1 className="font-display text-lg font-semibold leading-none tracking-tight text-neutral-900">
              Rescue map
            </h1>
            <button
              type="button"
              onClick={() => setSearchOpen(false)}
              aria-label="Hide search"
              className="-mr-1 shrink-0 rounded-full p-1 text-neutral-700 transition-colors hover:bg-neutral-900/5 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          {/* Address inputs */}
          <div className="grid gap-2">
        <div>
          <LocationSearchField
            label="Your location"
            value={myInput}
            onChange={setMyInput}
            onSelect={(stop) => {
              setStop("start", stop);
              setRecent((r) => rememberRecent(r, stop));
              setMyInput("");
            }}
            restaurants={restaurants}
            dropOffs={dropOffs}
            recent={recent.map((s, i) => ({
              id: `recent-${i}`,
              group: "recent" as const,
              label: s.label,
              stop: s,
            }))}
            placeholder={myLabel}
            inputClassName={fieldCls}
          />
          <button
            type="button"
            onClick={() => detectLocation(false)}
            disabled={geoBusy === "me"}
            className="-mx-1 -mb-2 mt-0.5 inline-flex items-center gap-1 rounded px-1 py-2 font-mono text-[11px] text-clay-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400 disabled:opacity-50"
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
          <LocationSearchField
            label="Final destination (optional)"
            value={destInput}
            onChange={setDestInput}
            onSelect={(stop) => {
              setStop("end", stop);
              setRecent((r) => rememberRecent(r, stop));
              setDestInput("");
            }}
            restaurants={restaurants}
            dropOffs={dropOffs}
            recent={recent.map((s, i) => ({
              id: `recent-${i}`,
              group: "recent" as const,
              label: s.label,
              stop: s,
            }))}
            placeholder={dest ? destLabel : "e.g. 123 Lancaster Ave"}
            inputClassName={fieldCls}
          />
          {dest && (
            <button
              type="button"
              onClick={() => setStop("end", null)}
              className="-mx-1 -mb-2 mt-0.5 inline-flex items-center rounded px-1 py-2 font-mono text-[11px] text-clay-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400"
            >
              Clear
            </button>
          )}
        </div>
      </div>
      {geoError && <p className="font-mono text-[11px] text-failed-600">{geoError}</p>}

      {/* Map layers — show / hide the two pin kinds. Pickups are on by default;
          drop-offs start hidden so the first view stays calm and pickup-focused
          (selecting a pickup still reveals its candidate drop-offs). Each control
          carries a miniature of its real map pin, so it's self-explanatory: full
          color on a raised chip = shown; greyed pin + dashed outline + struck
          label = hidden. */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] text-neutral-700">Show on map</span>
        {(
          [
            { kind: "rest", label: "Pickups", on: showRest, color: PICKUP, glyph: GLYPH_REST },
            { kind: "drop", label: "Drop-offs", on: showDrop, color: DROP, glyph: GLYPH_DROP },
          ] as const
        ).map((L) => (
          <button
            key={L.kind}
            type="button"
            onClick={() => toggleLayer(L.kind)}
            aria-pressed={L.on}
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-[12px] transition-all",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400 focus-visible:ring-offset-1",
              L.on
                ? "border-neutral-900/10 bg-card text-neutral-900 shadow-card"
                : "border-dashed border-neutral-900/25 text-neutral-700 line-through decoration-1 hover:border-neutral-900/40 hover:text-neutral-900"
            )}
          >
            <LegendPin fill={L.on ? L.color : RAMP.neutral400} glyph={L.glyph} />
            {L.label}
          </button>
        ))}
      </div>
            </div>
          ) : (
            // Collapsed: a small pill (top-left) brings the search card back.
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="pointer-events-auto absolute left-3 top-3 flex items-center gap-1.5 rounded-full border border-neutral-900/10 bg-neutral-50/95 px-3 py-1.5 font-mono text-[11px] text-neutral-700 shadow-card backdrop-blur-sm transition-colors hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400 focus-visible:ring-offset-1"
            >
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              Search
            </button>
          )}
        {/* Selection panel. Below lg it floats over the map as a bottom sheet
            (absolute, so the map never resizes and a click cannot reload it); at lg
            it becomes the second child of the overlay column, docked under the
            legend. fitToRoute's padding follows the same switch, so the route is
            never framed underneath it. Scrolls internally; persists until
            "Show all" / re-click. */}
      {panel && (
        <div
          ref={panelRef}
          className="pointer-events-auto absolute inset-x-0 bottom-0 z-20 max-h-[45vh] overflow-y-auto rounded-t-2xl border-t border-neutral-900/10 bg-card px-4 py-3 shadow-[0_-6px_20px_rgba(51,52,44,0.12)] animate-fade-in lg:static lg:inset-x-auto lg:bottom-auto lg:z-auto lg:min-h-0 lg:max-h-none lg:w-[340px] lg:flex-1 lg:rounded-2xl lg:border lg:border-neutral-900/10 lg:shadow-card"
        >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-medium text-neutral-700">
                  {panel.kind === "rest" ? "Selected restaurant" : "Selected drop-off"}
                </div>
                <div className="truncate font-display text-base font-semibold text-neutral-900">
                  {panel.name}
                </div>
                {/* The detail link lives here on the card now (moved off the map
                    popup): a quiet clay text link to the full listing / location. */}
                {panel.kind === "rest" && activeRest && (
                  <Link
                    href={
                      activeRest.listingId
                        ? `/listings/${activeRest.listingId}`
                        : `/restaurants/${activeRest.id}`
                    }
                    className="mt-1 inline-block rounded-sm text-[13px] font-medium text-clay-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400"
                  >
                    {activeRest.listingId ? "View listing" : "View restaurant"} →
                  </Link>
                )}
                {panel.kind === "drop" && activeDrop && (
                  <Link
                    href={`/dropoffs/${activeDrop.id}`}
                    className="mt-1 inline-block rounded-sm text-[13px] font-medium text-clay-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400"
                  >
                    View drop-off →
                  </Link>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="-mr-1 -mt-1 shrink-0 rounded-full px-3 py-1 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-900/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400"
              >
                Show all
              </button>
            </div>

            {panel.options.length === 0 && (
              <p className="mt-3 rounded-xl border border-dashed border-neutral-900/15 px-3 py-3 text-center text-xs text-neutral-700">
                {panel.kind === "rest"
                  ? "No drop-off can take this load right now."
                  : "No restaurant nearby has food for this drop-off."}
              </p>
            )}

            <div className="mt-3">
              <TripItinerary
                plan={plan}
                suggestions={
                  panel && panel.options.length > 0
                    ? {
                        slot: panel.kind === "rest" ? "dropOff" : "pickup",
                        // RouteOption and SlotSuggestion are structurally
                        // identical ({id, name, miles, minutes?, recommended}),
                        // so this assigns without a cast — and tsc will flag it
                        // if either side drifts.
                        items: panel.options,
                      }
                    : null
                }
                onPick={(slot, id) => {
                  const hit =
                    slot === "pickup"
                      ? restaurants.find((r) => r.id === id)
                      : dropOffs.find((d) => d.id === id);
                  if (!hit) return;
                  pickStop({
                    kind: slot === "pickup" ? "rest" : "drop",
                    id: hit.id,
                    center: [hit.lng, hit.lat],
                    label: hit.name,
                  });
                }}
                onClearSlot={(slot) => setStop(slot, null)}
                onClearTrip={clearAll}
              />
            </div>

            {activeOpt && (
              <div className="mt-3 flex items-center gap-2 border-t border-neutral-900/10 pt-3">
                <span className="min-w-0 flex-1 truncate font-sans text-[13px] text-neutral-700">
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
                  className="mt-3 flex w-full items-center justify-between gap-2 rounded-xl border border-neutral-900/10 bg-neutral-900/[0.03] px-3 py-2 text-left text-sm font-semibold text-neutral-800 transition-colors hover:bg-neutral-900/[0.06] hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400 focus-visible:ring-offset-1"
                >
                  <span className="flex items-center gap-2">
                    {/* info glyph (clay) so the disclosure reads as tappable */}
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
                      className="text-clay-600"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 16v-4" />
                      <path d="M12 8h.01" />
                    </svg>
                    {infoOpen ? "Hide details" : "Pickup & drop-off details"}
                  </span>
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
                    className={cn("shrink-0 text-neutral-700 transition-transform", infoOpen && "rotate-180")}
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>

                {infoOpen && (
                  <div className="mt-3 grid gap-x-4 gap-y-4 sm:grid-cols-2">
                    {/* Pickup — header dot mirrors the sage pickup pin */}
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-white"
                          style={{ background: PICKUP }}
                        >
                          <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M3 2v7a2 2 0 0 0 2 2 2 2 0 0 0 2-2V2" />
                            <path d="M7 2v20" />
                            <path d="M21 15V2a5 5 0 0 0-5 5v6c0 1 1 2 2 2h3Zm0 0v7" />
                          </svg>
                        </span>
                        <span className="font-mono text-[10px] text-neutral-700">
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
                                ? `${formatTimeLeft(activeRest.minutesLeft)} left`
                                : "all claimed"}
                            </InfoChip>
                            <span className="font-mono text-[11px] text-neutral-700">
                              ~{activeRest.servings} servings · {activeRest.count} listing
                              {activeRest.count === 1 ? "" : "s"}
                            </span>
                          </div>
                          {activeRest.categories.length > 0 && (
                            <div className="mt-1 truncate font-mono text-[11px] text-neutral-700">
                              {activeRest.categories.join(", ")}
                              {activeRest.perishable ? " · perishable" : ""}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    {/* Drop-off — header square mirrors the terracotta drop-off pin */}
                    <div className="sm:border-l sm:border-neutral-900/10 sm:pl-4">
                      <div className="flex items-center gap-2">
                        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-[6px] bg-clay-600 text-white">
                          <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
                            <path d="M3.3 7 12 12l8.7-5" />
                            <path d="M12 22V12" />
                          </svg>
                        </span>
                        <span className="font-mono text-[10px] text-neutral-700">
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
                          </div>
                          <div className="mt-1 truncate font-mono text-[11px] text-neutral-700">
                            accepts {activeDrop.acceptedCategories.join(", ")}
                          </div>
                          {activeDrop.notes && (
                            <div className="mt-1 truncate font-mono text-[11px] text-neutral-700">
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
                  // Claiming is destination-first: the drop-off is chosen on
                  // the listing's detail page, so the map hands off there
                  // rather than claiming in place.
                  <Link
                    href={`/listings/${activeRest?.listingId}`}
                    className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-neutral-900 px-4 py-2.5 text-sm font-bold text-neutral-50 shadow-card transition hover:-translate-y-0.5 hover:bg-neutral-800 hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400 focus-visible:ring-offset-2"
                  >
                    Claim pickup →
                  </Link>
                )}
                {gmapsUrl && (
                  <a
                    href={gmapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex flex-1 items-center justify-center gap-2 rounded-2xl border-2 border-route/70 bg-card px-4 py-2 text-sm font-bold text-route transition-colors hover:bg-route/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-route focus-visible:ring-offset-1"
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polygon points="3 11 22 2 13 21 11 13 3 11" />
                    </svg>
                    Open in Google Maps
                  </a>
                )}
              </div>
            )}

          </div>
        )}
        </div>
      </div>

    </div>
  );
}
