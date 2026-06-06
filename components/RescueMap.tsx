"use client";

import "mapbox-gl/dist/mapbox-gl.css";
import { useEffect, useRef, useState } from "react";
import type {
  Map as MapboxMap,
  Marker as MapboxMarker,
  GeoJSONSource,
} from "mapbox-gl";
import type { Feature, FeatureCollection } from "geojson";
import { rankDropOffs, rankRestaurantsForDropOff } from "@/lib/recommend";
import { geocodeClient } from "@/lib/geocode-client";
import { escapeHtml } from "@/lib/escapeHtml";
import { RAMP } from "@/lib/rampColors";
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

// Default "sensed" location — Malvern Prep — overridable by address.
const MY_DEFAULT: [number, number] = [-75.51239, 40.02724];

// White glyphs that make each selectable pin instantly readable: utensils for a
// restaurant (food source), a package for a drop-off (delivery point).
const ICON_REST = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7a2 2 0 0 0 2 2 2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1 1 2 2 2h3Zm0 0v7"/></svg>`;
const ICON_DROP = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="M3.3 7 12 12l8.7-5"/><path d="M12 22V12"/></svg>`;

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
  s.textContent = `
    .mm-pin{cursor:pointer;}
    .mm-pin-head{transition:box-shadow .12s ease, outline-color .12s ease, opacity .12s ease;}
    .mm-pin:hover .mm-pin-head{box-shadow:0 6px 16px rgba(51,52,44,.55);}
    @media (prefers-reduced-motion: reduce){.mm-pin-head{transition:none;}}
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

interface RouteInfo {
  coords: [number, number][];
  minutes: number;
  miles: number;
}

type Selection = { kind: "rest" | "drop"; id: string } | null;

interface RouteOption {
  name: string;
  miles: number; // great-circle, shown immediately
  minutes?: number; // drive time, filled when the route resolves
  short: boolean; // the shortest drive of the set
}
type Panel =
  | { kind: "rest"; name: string; options: RouteOption[]; journeyMin?: number; journeyMi?: number }
  | { kind: "drop"; name: string; options: RouteOption[] }
  | null;

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

  const [selected, setSelected] = useState<Selection>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [cats, setCats] = useState<Set<FoodCategory>>(new Set());
  const [fridgeOnly, setFridgeOnly] = useState(false);

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
  const myLocRef = useRef(myLoc);
  myLocRef.current = myLoc;
  const destRef = useRef(dest);
  destRef.current = dest;

  // --- localStorage hydration + persistence --------------------------------
  const hydrated = useRef(false);
  useEffect(() => {
    try {
      const ml = localStorage.getItem("mm.myLoc");
      if (ml) {
        const p = JSON.parse(ml);
        if (Array.isArray(p) && p.length === 2) {
          setMyLoc([p[0], p[1]]);
          setMyLabel(localStorage.getItem("mm.myLabel") || "Saved location");
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
        style: "mapbox://styles/mapbox/light-v11",
        center: myLocRef.current,
        zoom: 12,
      });
      mapRef.current = map;
      map.addControl(new mapboxgl.NavigationControl(), "top-right");

      // "My location" — ink dot in a soft halo (repositioned by an effect).
      const meEl = document.createElement("div");
      meEl.style.cssText = `width:28px;height:28px;display:grid;place-items:center;`;
      const meHalo = document.createElement("div");
      meHalo.style.cssText = `position:absolute;width:28px;height:28px;border-radius:50%;background:${ME};opacity:.15;`;
      const meDot = document.createElement("div");
      meDot.style.cssText = `position:relative;width:14px;height:14px;border-radius:50%;background:${ME};border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.25);`;
      meEl.appendChild(meHalo);
      meEl.appendChild(meDot);
      meMarkerRef.current = new mapboxgl.Marker(meEl)
        .setLngLat(myLocRef.current)
        .setPopup(
          new mapboxgl.Popup({ offset: 16, closeButton: false }).setHTML(
            `<div style="font-family:var(--font-sans),system-ui,sans-serif;font-size:12px;color:#33342C;">You are here</div>`
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
        el.style.cssText = `width:34px;height:34px;display:grid;place-items:center;`;
        const head = document.createElement("div");
        head.className = "mm-pin-head";
        head.style.cssText = `width:30px;height:30px;border-radius:50%;background:${restColor(r.minutesLeft)};border:2.5px solid #fff;box-shadow:0 2px 6px rgba(51,52,44,.35);outline:0 solid ${REC};display:grid;place-items:center;`;
        head.innerHTML = ICON_REST;
        el.appendChild(head);
        el.addEventListener("click", (ev) => {
          ev.stopPropagation();
          setSelected((cur) =>
            cur?.kind === "rest" && cur.id === r.id ? null : { kind: "rest", id: r.id }
          );
        });
        const popup = new mapboxgl.Popup({ offset: 14, closeButton: false }).setHTML(
          `<div style="font-family:var(--font-sans),system-ui,sans-serif;">
             <div style="font-family:var(--font-display),Georgia,serif;font-size:17px;font-weight:600;color:#33342C;">${escapeHtml(r.name)}</div>
             <div style="color:#6F6F62;font-family:var(--font-sans),system-ui,sans-serif;font-size:11px;margin:2px 0;">${r.count} listing${r.count > 1 ? "s" : ""} · ${r.servings} servings</div>
             <div style="color:#6F6F62;font-size:12px;">${escapeHtml(r.categories.join(", "))}${r.perishable ? " · perishable" : ""}</div>
             <a href="/restaurants/${r.id}" style="display:inline-block;margin-top:6px;color:#C06D40;font-size:13px;font-weight:500;text-decoration:none;">View details →</a>
             <div style="color:#A89E8B;font-size:11px;margin-top:2px;">Click pin for drop-off routes</div>
           </div>`
        );
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
        el.style.cssText = `width:32px;height:32px;display:grid;place-items:center;`;
        const dot = document.createElement("div");
        dot.className = "mm-pin-head";
        dot.style.cssText = `width:28px;height:28px;border-radius:8px;background:${DROP};border:2.5px solid #fff;box-shadow:0 2px 6px rgba(51,52,44,.35);outline:0 solid ${REC};display:grid;place-items:center;`;
        dot.innerHTML = ICON_DROP;
        el.appendChild(dot);
        el.addEventListener("click", (ev) => {
          ev.stopPropagation();
          setSelected((cur) =>
            cur?.kind === "drop" && cur.id === d.id ? null : { kind: "drop", id: d.id }
          );
        });
        const baseHTML = `<div style="font-family:var(--font-sans),system-ui,sans-serif;">
             <div style="font-family:var(--font-display),Georgia,serif;font-size:17px;font-weight:600;color:#33342C;">${escapeHtml(d.name)}</div>
             <div style="color:#6F6F62;font-family:var(--font-sans),system-ui,sans-serif;font-size:11px;margin:2px 0;">accepts: ${escapeHtml(d.acceptedCategories.join(", "))}</div>
             <div style="color:#6F6F62;font-size:12px;">${d.refrigerated ? "❄ refrigerated" : "not refrigerated"} · holds ${d.capacity}</div>
             ${d.notes ? `<div style="color:#6F6F62;font-size:12px;margin-top:4px;">${escapeHtml(d.notes)}</div>` : ""}
             <a href="/dropoffs/${d.id}" style="display:inline-block;margin-top:6px;color:#C06D40;font-size:13px;font-weight:500;text-decoration:none;">View details →</a>`;
        dropBaseHTML.current.set(d.id, baseHTML);
        const popup = new mapboxgl.Popup({ offset: 14, closeButton: false }).setHTML(
          baseHTML + "</div>"
        );
        dropMarkers.current.set(
          d.id,
          new mapboxgl.Marker(el).setLngLat([d.lng, d.lat]).setPopup(popup).addTo(map)
        );
      }

      map.on("click", () => setSelected(null)); // click empty space to reset

      map.on("load", () => {
        map.addSource("candidate-lines", { type: "geojson", data: EMPTY });
        map.addLayer({
          id: "candidate-lines",
          type: "line",
          source: "candidate-lines",
          layout: { "line-cap": "round" },
          paint: {
            "line-color": REC,
            "line-width": ["match", ["get", "rank"], "short", 4, 2],
            "line-opacity": ["match", ["get", "rank"], "short", 0.85, 0.4],
            "line-dasharray": [1.5, 1],
          },
        });
        map.addSource("journey-line", { type: "geojson", data: EMPTY });
        map.addLayer({
          id: "journey-line",
          type: "line",
          source: "journey-line",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": REC, "line-width": 5, "line-opacity": 0.95 },
        });
        const pts = [
          myLocRef.current,
          ...(destRef.current ? [destRef.current] : []),
          ...restaurants.map((r) => [r.lng, r.lat]),
          ...dropOffs.map((d) => [d.lng, d.lat]),
        ] as [number, number][];
        if (pts.length > 1) map.fitBounds(boundsOf(pts), { padding: 64, maxZoom: 14 });
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

  // Reposition the "you" marker + popup when myLoc / label changes.
  useEffect(() => {
    const m = meMarkerRef.current;
    if (!m) return;
    m.setLngLat(myLoc);
    m.getPopup()?.setHTML(
      `<div style="font-family:var(--font-sans),system-ui,sans-serif;font-size:12px;color:#33342C;">You are here · ${escapeHtml(myLabel)}</div>`
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
              `<div style="font-family:var(--font-sans),system-ui,sans-serif;font-size:12px;color:#33342C;">Destination</div>`
            )
          )
          .addTo(map);
      } else {
        destMarkerRef.current.setLngLat(dest);
      }
      destMarkerRef.current
        .getPopup()
        ?.setHTML(
          `<div style="font-family:var(--font-sans),system-ui,sans-serif;font-size:12px;color:#33342C;">Destination · ${escapeHtml(destLabel)}</div>`
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

    const candidateSrc = () => map.getSource("candidate-lines") as GeoJSONSource | undefined;
    const journeySrc = () => map.getSource("journey-line") as GeoJSONSource | undefined;
    const lineFeature = (coords: [number, number][], rank: "short" | "other"): Feature => ({
      type: "Feature",
      properties: { rank },
      geometry: { type: "LineString", coordinates: coords },
    });

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

    const clearLines = () => {
      candidateSrc()?.setData(EMPTY);
      journeySrc()?.setData(EMPTY);
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
        clearLines();
        setPanel(null);
        return;
      }

      // ====================== RESTAURANT SELECTED ==========================
      if (sel.kind === "rest") {
        const rest = restaurants.find((r) => r.id === sel.id);
        if (!rest) return;
        const ranked = rankDropOffs(rest, dropOffs);
        const eligible = ranked.filter((x) => x.eligible);
        const top3 = eligible.slice(0, 3);
        const top3Ids = new Set(top3.map((x) => x.dropOff.id));
        const reasons = new Map(ranked.map((x) => [x.dropOff.id, x.reason]));

        // Isolate restaurants to the selected one (and ring it).
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
        // Drop-offs: candidates highlighted, eligible shown, ineligible dimmed.
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
                  `<div style="color:#A8412E;font-size:12px;margin-top:6px;">Can't take this load: ${escapeHtml(why)}</div></div>`
              );
          } else if (top3Ids.has(id) && dot) {
            dot.style.outline = `3px solid ${REC}`;
            dot.style.outlineOffset = "2px";
          }
        });

        // Immediate panel (great-circle miles), routes fill in after fetch.
        setPanel({
          kind: "rest",
          name: rest.name,
          options: top3.map((x) => ({ name: x.dropOff.name, miles: x.miles, short: false })),
        });
        clearLines();

        if (top3.length === 0) {
          const nearMiss = ranked[0];
          setPanel({
            kind: "rest",
            name: rest.name,
            options: nearMiss
              ? [{ name: `${nearMiss.dropOff.name} (${nearMiss.reason ?? "ineligible"})`, miles: nearMiss.miles, short: false }]
              : [],
          });
          return;
        }

        // Fetch the 3 candidate routes (restaurant → drop-off).
        const routes = await Promise.all(
          top3.map((x) => fetchRouteMulti([[rest.lng, rest.lat], [x.dropOff.lng, x.dropOff.lat]]))
        );
        if (cancelled || selectedRef.current?.id !== sel.id) return;

        let shortIdx = -1;
        let shortMin = Infinity;
        routes.forEach((rt, i) => {
          if (rt && rt.minutes < shortMin) {
            shortMin = rt.minutes;
            shortIdx = i;
          }
        });

        const feats: Feature[] = [];
        routes.forEach((rt, i) => {
          if (rt) feats.push(lineFeature(rt.coords, i === shortIdx ? "short" : "other"));
        });
        candidateSrc()?.setData({ type: "FeatureCollection", features: feats });

        // Journey through the shortest eligible drop-off (auto-picked).
        const shortDrop = shortIdx >= 0 ? top3[shortIdx].dropOff : top3[0].dropOff;
        const waypoints: [number, number][] = [
          myLocRef.current,
          [rest.lng, rest.lat],
          [shortDrop.lng, shortDrop.lat],
          ...(destRef.current ? [destRef.current] : []),
        ];
        const journey = await fetchRouteMulti(waypoints);
        if (cancelled || selectedRef.current?.id !== sel.id) return;
        if (journey) journeySrc()?.setData({ type: "FeatureCollection", features: [lineFeature(journey.coords, "short")] });

        setPanel({
          kind: "rest",
          name: rest.name,
          options: top3.map((x, i) => ({
            name: x.dropOff.name,
            miles: routes[i]?.miles ?? x.miles,
            minutes: routes[i]?.minutes,
            short: i === shortIdx,
          })),
          journeyMin: journey?.minutes,
          journeyMi: journey?.miles,
        });

        // Fit to the trip.
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

      // Isolate drop-offs to the selected one.
      dropMarkers.current.forEach((m, id) => {
        resetDropMarker(m, id);
        m.getElement().style.display = id === sel.id ? "grid" : "none";
      });
      // Restaurants: show the 3 closest eligible (ringed), hide the rest.
      restMarkers.current.forEach((m, id) => {
        resetRestMarker(m);
        const el = m.getElement();
        const head = el.firstElementChild as HTMLElement | null;
        if (top3Ids.has(id)) {
          if (head) {
            head.style.outline = `3px solid ${REC}`;
            head.style.outlineOffset = "2px";
          }
        } else {
          el.style.display = "none";
        }
      });

      setPanel({
        kind: "drop",
        name: drop.name,
        options: top3.map((x) => ({ name: x.restaurant.name, miles: x.miles, short: false })),
      });
      clearLines();
      if (top3.length === 0) return;

      const routes = await Promise.all(
        top3.map((x) => fetchRouteMulti([[x.restaurant.lng, x.restaurant.lat], [drop.lng, drop.lat]]))
      );
      if (cancelled || selectedRef.current?.id !== sel.id) return;

      let shortIdx = -1;
      let shortMin = Infinity;
      routes.forEach((rt, i) => {
        if (rt && rt.minutes < shortMin) {
          shortMin = rt.minutes;
          shortIdx = i;
        }
      });
      const feats: Feature[] = [];
      routes.forEach((rt, i) => {
        if (rt) feats.push(lineFeature(rt.coords, i === shortIdx ? "short" : "other"));
      });
      candidateSrc()?.setData({ type: "FeatureCollection", features: feats });

      setPanel({
        kind: "drop",
        name: drop.name,
        options: top3.map((x, i) => ({
          name: x.restaurant.name,
          miles: routes[i]?.miles ?? x.miles,
          minutes: routes[i]?.minutes,
          short: i === shortIdx,
        })),
      });

      const pts: [number, number][] = [
        [drop.lng, drop.lat],
        ...top3.map((x) => [x.restaurant.lng, x.restaurant.lat] as [number, number]),
      ];
      if (pts.length > 1) map.fitBounds(boundsOf(pts), { padding: 80, maxZoom: 14 });
    };

    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
    return () => {
      cancelled = true;
    };
  }, [selected, cats, fridgeOnly, myLoc, dest, restaurants, dropOffs]);

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

  const fieldCls =
    "w-full rounded-md border border-neutral-200/60 bg-white px-3 py-1.5 text-sm " +
    "placeholder:text-neutral-400 focus-visible:outline-none focus-visible:ring-2 " +
    "focus-visible:ring-transit-400 focus-visible:ring-offset-1";

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
              className="shrink-0 rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-neutral-50 disabled:opacity-40"
            >
              {geoBusy === "me" ? "…" : "Set"}
            </button>
          </div>
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
              className="shrink-0 rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-neutral-50 disabled:opacity-40"
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
                className="shrink-0 font-mono text-[11px] text-clay-600 hover:underline"
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
                on
                  ? "bg-neutral-900 text-neutral-50"
                  : "border border-neutral-200/60 text-neutral-600 hover:text-neutral-900"
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
            fridgeOnly
              ? "bg-transit-600 text-neutral-50"
              : "border border-neutral-200/60 text-neutral-600 hover:text-neutral-900"
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
            className="font-mono text-[11px] text-clay-600 hover:underline"
          >
            clear
          </button>
        )}
      </div>

      <div className="relative">
        <div
          ref={container}
          className="h-[60vh] w-full overflow-hidden rounded-xl border border-neutral-200/40"
        />

        {/* Legend */}
        <div className="absolute left-3 top-3 space-y-1 rounded-md border border-neutral-200/60 bg-white/95 px-3 py-2 text-xs text-neutral-700">
          <div className="font-mono text-[10px] uppercase tracking-wide text-neutral-500">
            Restaurant urgency
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
        </div>

        {/* Selection panel */}
        {panel && (
          <div className="absolute bottom-3 left-3 right-3 rounded-md border border-neutral-200/60 bg-white/95 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{panel.name}</div>
                <div className="font-mono text-[10px] uppercase tracking-wide text-neutral-500">
                  {panel.kind === "rest" ? "nearest drop-offs" : "closest restaurants"}
                </div>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="shrink-0 text-sm font-medium text-rescued-600 hover:underline"
              >
                Show all
              </button>
            </div>

            {panel.options.length === 0 ? (
              <p className="mt-2 font-mono text-xs text-neutral-600">
                {panel.kind === "rest" ? "no eligible drop-off" : "no eligible restaurant"}
              </p>
            ) : (
              <ul className="mt-2 space-y-0.5">
                {panel.options.map((o, i) => (
                  <li key={i} className="flex items-baseline justify-between gap-3 font-mono text-xs">
                    <span className="truncate text-neutral-700">
                      {o.short && <span className="text-clay-600">★ </span>}
                      {o.name}
                    </span>
                    <span className="shrink-0 text-neutral-500">
                      {o.minutes != null ? `${o.minutes} min · ` : ""}
                      {o.miles.toFixed(1)} mi
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {panel.kind === "rest" && panel.journeyMin != null && (
              <p className="mt-2 border-t border-neutral-200/60 pt-2 font-mono text-xs text-neutral-700">
                trip: you → {panel.name} → drop-off{dest ? " → destination" : ""} ·{" "}
                <span className="text-clay-600">
                  {panel.journeyMin} min · {panel.journeyMi?.toFixed(1)} mi
                </span>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
