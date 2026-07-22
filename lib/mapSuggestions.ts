// Ranking and merging for the rescue map's location search.
//
// Three sources, in confidence order: places the volunteer used recently, the
// restaurants and drop-offs already on the map, then Mapbox addresses. The
// first two need no network, which is what keeps the field useful when the
// geocoding call is slow, rate-limited, or blocked outright.
//
// Pure so `npm test` can reach it; the fetching lives in lib/geocode-client.ts.

import type { Stop } from "./tripPlan";

export type SuggestionGroup = "recent" | "location" | "address";

export interface Suggestion {
  /** Stable within a result set — used for the option's DOM id. */
  id: string;
  group: SuggestionGroup;
  label: string;
  /** Optional second line (a street address under a venue name). */
  sublabel?: string;
  stop: Stop;
}

export const SUGGESTION_LIMIT = 8;
export const RECENT_LIMIT = 3;

interface Located {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

/**
 * Two results are "the same place" when they land within ~11m of each other
 * (4 decimal places of latitude). That collapses a geocoded street address
 * onto the known venue standing at it, and we keep the venue — it carries an
 * id, so selecting it can fill a trip slot.
 */
function placeKey(stop: Stop): string {
  return `${stop.center[0].toFixed(4)},${stop.center[1].toFixed(4)}`;
}

export function matchEntities(
  query: string,
  restaurants: Located[],
  dropOffs: Located[]
): Suggestion[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const out: Suggestion[] = [];
  for (const r of restaurants) {
    if (r.name.toLowerCase().includes(q)) {
      out.push({
        id: `loc-rest-${r.id}`,
        group: "location",
        label: r.name,
        sublabel: "Pickup",
        stop: { kind: "rest", id: r.id, center: [r.lng, r.lat], label: r.name },
      });
    }
  }
  for (const d of dropOffs) {
    if (d.name.toLowerCase().includes(q)) {
      out.push({
        id: `loc-drop-${d.id}`,
        group: "location",
        label: d.name,
        sublabel: "Drop-off",
        stop: { kind: "drop", id: d.id, center: [d.lng, d.lat], label: d.name },
      });
    }
  }
  return out;
}

export function mergeSuggestions(
  recent: Suggestion[],
  locations: Suggestion[],
  addresses: Suggestion[],
  limit = SUGGESTION_LIMIT
): Suggestion[] {
  const seen = new Set<string>();
  const out: Suggestion[] = [];
  for (const s of [...recent, ...locations, ...addresses]) {
    const key = placeKey(s.stop);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= limit) break;
  }
  return out;
}

/** Newest first, de-duplicated by place, capped at RECENT_LIMIT. */
export function rememberRecent(list: Stop[], stop: Stop): Stop[] {
  const key = placeKey(stop);
  return [stop, ...list.filter((s) => placeKey(s) !== key)].slice(0, RECENT_LIMIT);
}
