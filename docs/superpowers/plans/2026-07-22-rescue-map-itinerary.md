# Rescue Map Itinerary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the rescue map's implicit route-picker with a click-to-build trip itinerary, add a suggestions dropdown to both location inputs, and dock the selection panel under the legend on wide screens.

**Architecture:** All decision logic is extracted into pure modules under `lib/` (where the existing test runner can reach it), with thin React wrappers under `components/map/`. `RescueMap.tsx` keeps only what needs a live Mapbox instance: sources, layers, markers, camera, and the Directions fetch.

**Tech Stack:** Next.js 14 App Router, React, TypeScript, Tailwind, mapbox-gl, `node:test` via tsx.

**Spec:** `docs/superpowers/specs/2026-07-22-rescue-map-itinerary-design.md`

**Branch:** `rescue-map-itinerary` (already created off `main`)

## Global Constraints

- **Tailwind only.** No inline style objects, no CSS modules. The sole exception is dynamic bar/line widths (`style={{ width: \`${pct}%\` }}`), which `ReliabilityMeter.tsx:43` already establishes.
- **Sentence case everywhere**, including mono metadata and status words. `Pickup`, `Drop-off`, `Search`, `Clear`. Never Title Case, never ALLCAPS, never all-lowercase word-labels. Pure data tokens (`8 min`, `2.3 mi`) stay as written.
- **Text is ink.** Body/primary text `neutral-800`/`900`; secondary (labels, captions, metadata) `neutral-700`. Never set text to `neutral-400/500/600` — those are for borders, dividers, fills only.
- **Three font roles.** `font-display` (Fraunces) headings/big numbers, `font-sans` (Nunito Sans) UI/body, `font-mono` (JetBrains Mono) for ALL metadata — times, distances, ids, counts, labels.
- **Color is semantic.** sage=`rescued`, honey=`urgent`, tomato=`failed`, plum=`transit`, `clay`=secondary accent (links/arrows), `route`=wayfinding only. Status must never read by hue alone.
- **Focus rings are sage:** `focus-visible:ring-2 focus-visible:ring-rescued-400`.
- **Do not change** `RAMP.route` (`#2563B0`), the map pin colors, the Mapbox base style, or `setBtnCls`'s `bg-neutral-900` fill.
- **Tests must live in `lib/`.** `package.json`'s test script globs only `lib/*.test.ts` and `lib/analytics/*.test.ts`. Logic placed under `components/` is not run by `npm test`.
- **Verification commands:** `npm test`, `npm run typecheck`, `npm run lint`. Lint has two pre-existing `react-hooks/exhaustive-deps` warnings in `ListingDetail.tsx` — those are expected; do not "fix" them.
- **Tiles, geocoding and Directions do not resolve locally — but NOT because Mapbox is unreachable.** Mapbox is reachable from this sandbox — the earlier claim that it was not was wrong. Verified: DNS and HTTPS to api.mapbox.com return 200, the token authenticates against the Styles API, lib/csp.ts allows the host in connect-src/img-src plus blob: workers, and both the page and a blob worker can fetch it. What actually fails is narrower and still unexplained: mapbox-gl initialises (canvas, controls and markers all render) but no request to api.mapbox.com is ever issued, so no tiles paint. Treat map imagery as unverified here, but do not record it as a network or egress restriction. Never claim address suggestions or leg times were verified locally.

---

### Task 1: Pure trip model

**Files:**
- Create: `lib/tripPlan.ts`
- Test: `lib/tripPlan.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `Stop`, `EntityStop`, `TripPlan`, `SlotName`, `DEFAULT_START`, `emptyTrip()`, `slotForKind()`, `toggleEntity()`, `setSlot()`, `clearTrip()`, `hydrateTrip()`.

There is deliberately no `serializeTrip()`. A `TripPlan` is already a plain
JSON-safe object, so callers use `JSON.stringify(plan)` directly rather than
routing through an identity function.

- [x] **Step 1: Write the failing test**

Create `lib/tripPlan.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_START,
  clearTrip,
  emptyTrip,
  hydrateTrip,
  setSlot,
  slotForKind,
  toggleEntity,
  type Stop,
} from "./tripPlan";

const bakery: Stop = { kind: "rest", id: "r1", center: [-75.5, 40.0], label: "Sunrise Bakery" };
const deli: Stop = { kind: "rest", id: "r2", center: [-75.6, 40.1], label: "Corner Deli" };
const shelter: Stop = { kind: "drop", id: "d1", center: [-75.4, 40.2], label: "St. Mark's Shelter" };

test("slotForKind maps entity kinds to slots", () => {
  assert.equal(slotForKind("rest"), "pickup");
  assert.equal(slotForKind("drop"), "dropOff");
});

test("clicking a restaurant fills the pickup slot", () => {
  const plan = toggleEntity(emptyTrip(), bakery);
  assert.deepEqual(plan.pickup, bakery);
  assert.equal(plan.dropOff, null);
});

test("clicking a different restaurant replaces the pickup", () => {
  const plan = toggleEntity(toggleEntity(emptyTrip(), bakery), deli);
  assert.deepEqual(plan.pickup, deli);
});

test("clicking the restaurant already in the slot clears it", () => {
  const plan = toggleEntity(toggleEntity(emptyTrip(), bakery), bakery);
  assert.equal(plan.pickup, null);
});

test("restaurant and drop-off occupy independent slots", () => {
  const plan = toggleEntity(toggleEntity(emptyTrip(), bakery), shelter);
  assert.deepEqual(plan.pickup, bakery);
  assert.deepEqual(plan.dropOff, shelter);
});

test("setSlot can clear a slot explicitly", () => {
  const plan = setSlot(toggleEntity(emptyTrip(), bakery), "pickup", null);
  assert.equal(plan.pickup, null);
});

test("clearTrip keeps start but empties the rest", () => {
  const start: Stop = { kind: "place", center: [-75.1, 40.9], label: "Home" };
  let plan = setSlot(emptyTrip(), "start", start);
  plan = toggleEntity(plan, bakery);
  plan = toggleEntity(plan, shelter);
  plan = setSlot(plan, "end", { kind: "place", center: [-75.2, 40.8], label: "Campus" });

  const cleared = clearTrip(plan);
  assert.deepEqual(cleared.start, start);
  assert.equal(cleared.pickup, null);
  assert.equal(cleared.dropOff, null);
  assert.equal(cleared.end, null);
});

test("emptyTrip defaults start to DEFAULT_START", () => {
  assert.deepEqual(emptyTrip().start, DEFAULT_START);
});

test("hydrate round-trips a serialized plan", () => {
  let plan = toggleEntity(emptyTrip(), bakery);
  plan = toggleEntity(plan, shelter);

  const restored = hydrateTrip(
    JSON.parse(JSON.stringify(plan)),
    new Set(["r1"]),
    new Set(["d1"])
  );
  assert.deepEqual(restored, plan);
});

test("hydrate drops a stop whose entity no longer exists", () => {
  let plan = toggleEntity(emptyTrip(), bakery);
  plan = toggleEntity(plan, shelter);

  const restored = hydrateTrip(plan, new Set<string>(), new Set(["d1"]));
  assert.equal(restored.pickup, null, "stale restaurant id must not survive hydration");
  assert.deepEqual(restored.dropOff, shelter);
});

test("hydrate keeps free-form place stops regardless of known ids", () => {
  const end: Stop = { kind: "place", center: [-75.2, 40.8], label: "Campus" };
  const plan = setSlot(emptyTrip(), "end", end);
  const restored = hydrateTrip(plan, new Set<string>(), new Set<string>());
  assert.deepEqual(restored.end, end);
});

test("hydrate returns an empty trip for corrupt input", () => {
  assert.deepEqual(hydrateTrip("not json at all", new Set(), new Set()), emptyTrip());
  assert.deepEqual(hydrateTrip(null, new Set(), new Set()), emptyTrip());
  assert.deepEqual(hydrateTrip({ start: { kind: "bogus" } }, new Set(), new Set()), emptyTrip());
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `node --require ./lib/stub-server-only.cjs --import tsx --test lib/tripPlan.test.ts`
Expected: FAIL — `Cannot find module './tripPlan'`

- [x] **Step 3: Write the implementation**

Create `lib/tripPlan.ts`:

```ts
// The rescue map's trip model: four named slots, not a list.
//
// A volunteer runs one rescue at a time, so the planner is deliberately unable
// to express a longer chain — a free multi-stop list could produce a trip the
// app has no way to claim. The itinerary UI renders these slots as rows, which
// is a presentation choice; the model stays fixed.
//
// Pure and dependency-free so `npm test` can exercise it (the test script globs
// lib/*.test.ts only). All functions return new objects — never mutate a plan.

export type Stop =
  | { kind: "place"; center: [number, number]; label: string }
  | { kind: "rest" | "drop"; id: string; center: [number, number]; label: string };

export type EntityStop = Extract<Stop, { kind: "rest" | "drop" }>;

export type SlotName = "start" | "pickup" | "dropOff" | "end";

export interface TripPlan {
  start: Stop;
  pickup: Stop | null;
  dropOff: Stop | null;
  end: Stop | null;
}

/** Malvern Prep — the chapter's home base, matching RescueMap's MY_DEFAULT. */
export const DEFAULT_START: Stop = {
  kind: "place",
  center: [-75.51239, 40.02724],
  label: "Malvern Prep",
};

export function emptyTrip(start: Stop = DEFAULT_START): TripPlan {
  return { start, pickup: null, dropOff: null, end: null };
}

export function slotForKind(kind: "rest" | "drop"): "pickup" | "dropOff" {
  return kind === "rest" ? "pickup" : "dropOff";
}

export function setSlot(plan: TripPlan, slot: SlotName, stop: Stop | null): TripPlan {
  // `start` is structurally non-null; clearing it falls back to the default
  // rather than leaving the trip without an origin.
  if (slot === "start") return { ...plan, start: stop ?? DEFAULT_START };
  return { ...plan, [slot]: stop };
}

/**
 * Clicking a pin. Fills the slot for that entity kind, replacing whatever was
 * there — clicking a second restaurant swaps the pickup rather than raising an
 * error the user has to resolve. Clicking the pin already in the slot clears it.
 */
export function toggleEntity(plan: TripPlan, stop: EntityStop): TripPlan {
  const slot = slotForKind(stop.kind);
  const current = plan[slot];
  const same = current && current.kind === stop.kind && "id" in current && current.id === stop.id;
  return setSlot(plan, slot, same ? null : stop);
}

/** Resets the journey but keeps where the volunteer is starting from. */
export function clearTrip(plan: TripPlan): TripPlan {
  return { start: plan.start, pickup: null, dropOff: null, end: null };
}

function isStop(v: unknown): v is Stop {
  if (!v || typeof v !== "object") return false;
  const s = v as Record<string, unknown>;
  if (s.kind !== "place" && s.kind !== "rest" && s.kind !== "drop") return false;
  if (typeof s.label !== "string") return false;
  const c = s.center;
  if (!Array.isArray(c) || c.length !== 2) return false;
  if (typeof c[0] !== "number" || typeof c[1] !== "number") return false;
  if (s.kind !== "place" && typeof s.id !== "string") return false;
  return true;
}

/**
 * Rebuild a plan from storage. A stored `rest`/`drop` stop whose entity has
 * since disappeared (listing expired, location removed) is dropped to null —
 * a stale id must never render a row the user cannot act on.
 */
export function hydrateTrip(
  raw: unknown,
  knownRestIds: Set<string>,
  knownDropIds: Set<string>
): TripPlan {
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return emptyTrip();
    }
  }
  if (!parsed || typeof parsed !== "object") return emptyTrip();
  const p = parsed as Record<string, unknown>;

  const keep = (v: unknown): Stop | null => {
    if (!isStop(v)) return null;
    if (v.kind === "rest") return knownRestIds.has(v.id) ? v : null;
    if (v.kind === "drop") return knownDropIds.has(v.id) ? v : null;
    return v;
  };

  return {
    start: isStop(p.start) ? p.start : DEFAULT_START,
    pickup: keep(p.pickup),
    dropOff: keep(p.dropOff),
    end: keep(p.end),
  };
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `node --require ./lib/stub-server-only.cjs --import tsx --test lib/tripPlan.test.ts`
Expected: PASS, 12 tests

- [x] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add lib/tripPlan.ts lib/tripPlan.test.ts
git commit -m "Add the pure trip-plan model for the rescue map

Four named slots rather than a list: a volunteer runs one rescue at a
time, so the planner should not be able to express a trip the app cannot
claim. Clicking a pin replaces its slot; clicking the pin already there
clears it. Hydration drops stops whose entity has since disappeared, so a
stale id can never render a row the user cannot act on."
```

---

### Task 2: Pure suggestion merge and ranking

**Files:**
- Create: `lib/mapSuggestions.ts`
- Test: `lib/mapSuggestions.test.ts`

**Interfaces:**
- Consumes: `Stop` from `lib/tripPlan.ts` (Task 1).
- Produces: `Suggestion`, `SuggestionGroup`, `matchEntities()`, `mergeSuggestions()`, `rememberRecent()`, `SUGGESTION_LIMIT`.

- [x] **Step 1: Write the failing test**

Create `lib/mapSuggestions.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  matchEntities,
  mergeSuggestions,
  rememberRecent,
  type Suggestion,
} from "./mapSuggestions";
import type { Stop } from "./tripPlan";

const rests = [
  { id: "r1", name: "Sunrise Bakery", lat: 40.0, lng: -75.5 },
  { id: "r2", name: "Corner Deli", lat: 40.1, lng: -75.6 },
];
const drops = [{ id: "d1", name: "St. Mark's Shelter", lat: 40.2, lng: -75.4 }];

function sug(id: string, group: Suggestion["group"], label: string, stop: Stop): Suggestion {
  return { id, group, label, stop };
}

test("matchEntities finds restaurants and drop-offs case-insensitively", () => {
  const hits = matchEntities("sunrise", rests, drops);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].label, "Sunrise Bakery");
  assert.equal(hits[0].stop.kind, "rest");
});

test("matchEntities matches on a substring, not just a prefix", () => {
  assert.equal(matchEntities("deli", rests, drops).length, 1);
  assert.equal(matchEntities("shelter", rests, drops).length, 1);
});

test("matchEntities returns nothing for a blank query", () => {
  assert.deepEqual(matchEntities("   ", rests, drops), []);
});

test("mergeSuggestions ranks recent, then locations, then addresses", () => {
  const merged = mergeSuggestions(
    [sug("rec1", "recent", "Home", { kind: "place", center: [-75.1, 40.1], label: "Home" })],
    [sug("loc1", "location", "Sunrise Bakery", { kind: "rest", id: "r1", center: [-75.5, 40.0], label: "Sunrise Bakery" })],
    [sug("addr1", "address", "1 Lancaster Ave", { kind: "place", center: [-75.9, 40.9], label: "1 Lancaster Ave" })]
  );
  assert.deepEqual(
    merged.map((m) => m.group),
    ["recent", "location", "address"]
  );
});

test("an address at the same place as a known location is dropped", () => {
  const merged = mergeSuggestions(
    [],
    [sug("loc1", "location", "Sunrise Bakery", { kind: "rest", id: "r1", center: [-75.5, 40.0], label: "Sunrise Bakery" })],
    [sug("addr1", "address", "12 Main St", { kind: "place", center: [-75.50001, 40.00001], label: "12 Main St" })]
  );
  assert.equal(merged.length, 1, "duplicate place should collapse to the richer location entry");
  assert.equal(merged[0].group, "location");
});

test("mergeSuggestions caps the list", () => {
  const many = Array.from({ length: 20 }, (_, i) =>
    sug(`a${i}`, "address", `Addr ${i}`, { kind: "place", center: [-70 - i, 40], label: `Addr ${i}` })
  );
  assert.ok(mergeSuggestions([], [], many).length <= 8);
});

test("mergeSuggestions handles all-empty sources", () => {
  assert.deepEqual(mergeSuggestions([], [], []), []);
});

test("rememberRecent puts the newest first and de-duplicates", () => {
  const a: Stop = { kind: "place", center: [-75.1, 40.1], label: "Home" };
  const b: Stop = { kind: "place", center: [-75.2, 40.2], label: "Campus" };
  const list = rememberRecent(rememberRecent([a], b), a);
  assert.deepEqual(list.map((s) => s.label), ["Home", "Campus"]);
});

test("rememberRecent keeps at most three", () => {
  let list: Stop[] = [];
  for (let i = 0; i < 6; i++) {
    list = rememberRecent(list, { kind: "place", center: [-75 - i, 40], label: `P${i}` });
  }
  assert.equal(list.length, 3);
  assert.equal(list[0].label, "P5");
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `node --require ./lib/stub-server-only.cjs --import tsx --test lib/mapSuggestions.test.ts`
Expected: FAIL — `Cannot find module './mapSuggestions'`

- [x] **Step 3: Write the implementation**

Create `lib/mapSuggestions.ts`:

```ts
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
```

- [x] **Step 4: Run test to verify it passes**

Run: `node --require ./lib/stub-server-only.cjs --import tsx --test lib/mapSuggestions.test.ts`
Expected: PASS, 9 tests

- [x] **Step 5: Run the whole suite, typecheck, commit**

```bash
npm test
npm run typecheck
git add lib/mapSuggestions.ts lib/mapSuggestions.test.ts
git commit -m "Add pure ranking and merging for map location suggestions

Recent, then on-map locations, then Mapbox addresses. The first two need
no network, which is what keeps the field useful when geocoding is slow
or blocked. An address within ~11m of a known venue collapses onto the
venue, since only the venue carries an id that can fill a trip slot."
```

---

### Task 3: Multi-result geocoding

**Files:**
- Modify: `lib/geocode-client.ts` (append; leave `geocodeClient` untouched)

**Interfaces:**
- Consumes: `Suggestion` from `lib/mapSuggestions.ts` (Task 2).
- Produces: `geocodeSuggest(query: string, signal?: AbortSignal): Promise<Suggestion[]>`.

No unit test: this function is a network call with no branching logic worth
isolating. Its callers are tested through `mergeSuggestions`.

- [x] **Step 1: Append the implementation**

Add to the end of `lib/geocode-client.ts`:

```ts
/**
 * Autocomplete variant of geocodeClient: several results instead of one, and
 * cancellable so a slow response can't overwrite a newer query. Shares the
 * proximity bias and country filter with the single-result path above.
 *
 * Never throws — an empty array means "no addresses", which lets the caller
 * still show recent and on-map suggestions when the network is unavailable.
 */
export async function geocodeSuggest(
  query: string,
  signal?: AbortSignal
): Promise<import("./mapSuggestions").Suggestion[]> {
  const q = query?.trim();
  if (!q || !TOKEN) return [];
  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json` +
    `?limit=5&autocomplete=true&country=us` +
    `&proximity=${MALVERN.lng},${MALVERN.lat}&access_token=${TOKEN}`;
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      features?: { id?: string; center?: [number, number]; text?: string; place_name?: string }[];
    };
    return (data.features ?? [])
      .filter((f) => Array.isArray(f.center) && f.center.length === 2)
      .map((f, i) => {
        const center = f.center as [number, number];
        const full = f.place_name ?? f.text ?? q;
        return {
          id: `addr-${f.id ?? i}`,
          group: "address" as const,
          label: f.text ?? full,
          sublabel: full,
          stop: { kind: "place" as const, center, label: full },
        };
      });
  } catch {
    // Includes AbortError when a newer keystroke supersedes this request.
    return [];
  }
}
```

- [x] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no output (success)

- [x] **Step 3: Commit**

```bash
git add lib/geocode-client.ts
git commit -m "Add cancellable multi-result geocoding for autocomplete

geocodeClient stays as-is for the Enter-to-set path. The new variant
returns up to five results and takes an AbortSignal so a slow response
cannot overwrite a newer query. Returns [] rather than throwing, so a
failed address lookup still leaves recent and on-map suggestions."
```

---

### Task 4: `useTripPlan` hook

**Files:**
- Create: `components/map/useTripPlan.ts`

**Interfaces:**
- Consumes: everything exported by `lib/tripPlan.ts` (Task 1).
- Produces: `useTripPlan({ restaurants, dropOffs })` returning
  `{ plan, pickStop, setStop, clearAll, hydrated }` where
  `pickStop(stop: EntityStop): void`, `setStop(slot: SlotName, stop: Stop | null): void`,
  `clearAll(): void`, `hydrated: boolean`.
- Also owns the one-time migration off the legacy `mm.myLoc` / `mm.myLabel` /
  `mm.dest` / `mm.destLabel` keys (see Task 8, Step 2 for the code — it lives in
  this file).

- [x] **Step 1: Write the implementation**

Create `components/map/useTripPlan.ts`:

```ts
"use client";

import { useCallback, useEffect, useState } from "react";
import {
  clearTrip,
  emptyTrip,
  hydrateTrip,
  setSlot,
  toggleEntity,
  type EntityStop,
  type SlotName,
  type Stop,
  type TripPlan,
} from "@/lib/tripPlan";

const KEY = "mm.trip";

interface Located {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

/**
 * React wrapper over the pure model in lib/tripPlan.ts. Owns exactly two extra
 * concerns: localStorage, and knowing which entity ids currently exist so a
 * stored trip pointing at a vanished listing hydrates to an empty slot.
 *
 * `hydrated` starts false and flips after the mount effect, mirroring the
 * pattern ClaimHoldPanel uses for its clock: the server render and first client
 * render must agree, so nothing storage-dependent is read during render.
 */
export function useTripPlan({
  restaurants,
  dropOffs,
}: {
  restaurants: Located[];
  dropOffs: Located[];
}) {
  const [plan, setPlan] = useState<TripPlan>(() => emptyTrip());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // Built inside the effect, not during render: the effect runs once, so
    // these are the mount-time ids — exactly what hydration should validate
    // against — and nothing mutates a ref mid-render.
    const restIds = new Set(restaurants.map((r) => r.id));
    const dropIds = new Set(dropOffs.map((d) => d.id));
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setPlan(hydrateTrip(raw, restIds, dropIds));
    } catch {
      /* ignore corrupt storage */
    }
    setHydrated(true);
    // Mount-only by design: re-hydrating when the map data refetches would
    // clobber edits the volunteer has already made.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(plan));
    } catch {
      /* ignore */
    }
  }, [plan, hydrated]);

  const pickStop = useCallback((stop: EntityStop) => {
    setPlan((p) => toggleEntity(p, stop));
  }, []);

  const setStop = useCallback((slot: SlotName, stop: Stop | null) => {
    setPlan((p) => setSlot(p, slot, stop));
  }, []);

  const clearAll = useCallback(() => setPlan((p) => clearTrip(p)), []);

  return { plan, pickStop, setStop, clearAll, hydrated };
}
```

- [x] **Step 2: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: typecheck silent; lint shows only the two known `ListingDetail.tsx` warnings

- [x] **Step 3: Commit**

```bash
git add components/map/useTripPlan.ts
git commit -m "Add useTripPlan: persistence and entity-awareness over the pure model

The hook owns only what the pure model can't: localStorage, and the set
of ids that currently exist so a stored trip pointing at a vanished
listing hydrates to an empty slot. hydrated starts false so the server
render and first client render agree."
```

---

### Task 5: `LocationSearchField` combobox

**Files:**
- Create: `components/map/LocationSearchField.tsx`

**Interfaces:**
- Consumes: `Suggestion`, `matchEntities`, `mergeSuggestions`, `SUGGESTION_LIMIT` (Task 2); `geocodeSuggest` (Task 3); `Stop` (Task 1).
- Produces: `<LocationSearchField label value onChange onSelect restaurants dropOffs recent placeholder inputClassName />`, where `onSelect(stop: Stop): void`.

- [x] **Step 1: Write the implementation**

Create `components/map/LocationSearchField.tsx`:

```tsx
"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/components/cn";
import { geocodeSuggest } from "@/lib/geocode-client";
import {
  matchEntities,
  mergeSuggestions,
  type Suggestion,
} from "@/lib/mapSuggestions";
import type { Stop } from "@/lib/tripPlan";

interface Located {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

const GROUP_LABEL: Record<Suggestion["group"], string> = {
  recent: "Recent",
  location: "On the map",
  address: "Addresses",
};

/**
 * A WAI-ARIA combobox over three suggestion sources. The two local ones
 * (recent, on-map locations) resolve synchronously, so the list is useful
 * before — and without — any network round trip.
 *
 * The in-flight geocode is aborted whenever the query changes, so a slow
 * response can never land after a newer one and overwrite the list.
 */
export function LocationSearchField({
  label,
  value,
  onChange,
  onSelect,
  restaurants,
  dropOffs,
  recent,
  placeholder,
  inputClassName,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onSelect: (stop: Stop) => void;
  restaurants: Located[];
  dropOffs: Located[];
  recent: Suggestion[];
  placeholder?: string;
  inputClassName?: string;
}) {
  const baseId = useId();
  const listId = `${baseId}-listbox`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [addresses, setAddresses] = useState<Suggestion[]>([]);
  const blurTimer = useRef<number>();

  const local = matchEntities(value, restaurants, dropOffs);
  const items = mergeSuggestions(value.trim() ? [] : recent, local, addresses);

  // Debounced, cancellable address lookup.
  useEffect(() => {
    const q = value.trim();
    if (!q) {
      setAddresses([]);
      return;
    }
    const ctrl = new AbortController();
    const t = window.setTimeout(() => {
      geocodeSuggest(q, ctrl.signal).then(setAddresses);
    }, 250);
    return () => {
      window.clearTimeout(t);
      ctrl.abort();
    };
  }, [value]);

  // Keep the highlighted row in range as the list changes under it.
  useEffect(() => {
    setActive((a) => (a >= items.length ? 0 : a));
  }, [items.length]);

  useEffect(() => () => window.clearTimeout(blurTimer.current), []);

  function choose(s: Suggestion) {
    onSelect(s.stop);
    onChange(s.label);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!items.length) return;
      e.preventDefault();
      setOpen(true);
      setActive((a) =>
        e.key === "ArrowDown" ? (a + 1) % items.length : (a - 1 + items.length) % items.length
      );
      return;
    }
    if (e.key === "Enter" && open && items[active]) {
      e.preventDefault();
      choose(items[active]);
      return;
    }
    if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const showList = open && items.length > 0;
  let lastGroup: Suggestion["group"] | null = null;

  return (
    <div className="relative">
      <label className="mb-1 block font-mono text-[11px] text-neutral-700" htmlFor={baseId}>
        {label}
      </label>
      <input
        id={baseId}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList ? `${baseId}-opt-${active}` : undefined}
        className={inputClassName}
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        // Deferred so a pointer selection lands before the list unmounts.
        onBlur={() => {
          blurTimer.current = window.setTimeout(() => setOpen(false), 120);
        }}
        onKeyDown={onKeyDown}
      />
      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-dropdown mt-1 max-h-64 overflow-y-auto rounded-xl border border-neutral-900/10 bg-card py-1 shadow-lift animate-slide-down"
        >
          {items.map((s, i) => {
            const header = s.group !== lastGroup ? GROUP_LABEL[s.group] : null;
            lastGroup = s.group;
            return (
              <li key={s.id}>
                {header && (
                  <div className="px-3 pb-1 pt-2 font-mono text-[10px] text-neutral-700">
                    {header}
                  </div>
                )}
                <div
                  id={`${baseId}-opt-${i}`}
                  role="option"
                  aria-selected={i === active}
                  tabIndex={-1}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(s)}
                  onMouseEnter={() => setActive(i)}
                  className={cn(
                    "cursor-pointer px-3 py-2 text-sm text-neutral-900",
                    i === active && "bg-rescued-50"
                  )}
                >
                  <span className="block truncate">{s.label}</span>
                  {s.sublabel && (
                    <span className="block truncate font-mono text-[11px] text-neutral-700">
                      {s.sublabel}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
```

- [x] **Step 2: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: typecheck silent; lint shows only the two known `ListingDetail.tsx` warnings

- [x] **Step 3: Commit**

```bash
git add components/map/LocationSearchField.tsx
git commit -m "Add LocationSearchField: an ARIA combobox over three sources

Recent and on-map locations resolve synchronously, so the list is useful
before and without a network round trip; addresses arrive debounced at
250ms with the in-flight request aborted on each keystroke, so a slow
response can never land after a newer one."
```

---

### Task 6: `TripItinerary`

**Files:**
- Create: `components/map/TripItinerary.tsx`

**Interfaces:**
- Consumes: `TripPlan`, `SlotName`, `Stop` (Task 1).
- Produces: `<TripItinerary plan suggestions onPick onClearSlot onClearTrip />` where
  `suggestions: { slot: "pickup" | "dropOff"; items: { id: string; name: string; minutes?: number; miles: number; recommended: boolean }[] } | null`,
  `onPick(slot, id): void`, `onClearSlot(slot: SlotName): void`, `onClearTrip(): void`.

- [x] **Step 1: Write the implementation**

Create `components/map/TripItinerary.tsx`:

```tsx
"use client";

import type { ReactNode } from "react";
import { cn } from "@/components/cn";
import type { SlotName, Stop, TripPlan } from "@/lib/tripPlan";

export interface SlotSuggestion {
  id: string;
  name: string;
  minutes?: number;
  miles: number;
  recommended: boolean;
}

// `start` is structurally non-null, so it is rendered outside this list — it
// has no empty state to describe.
const OPTIONAL_ROWS: {
  slot: "pickup" | "dropOff" | "end";
  label: string;
  prompt: string;
}[] = [
  { slot: "pickup", label: "Pickup", prompt: "Choose a pickup — tap a pin" },
  { slot: "dropOff", label: "Drop-off", prompt: "Choose a drop-off — tap a pin" },
  { slot: "end", label: "End", prompt: "Add a final destination (optional)" },
];

/** One node on the trip: connector, dot, label, and either a stop or a prompt. */
function Row({
  label,
  stop,
  prompt,
  last,
  onClear,
  children,
}: {
  label: string;
  stop: Stop | null;
  prompt?: string;
  last?: boolean;
  onClear?: () => void;
  children?: ReactNode;
}) {
  return (
    <li className="relative pl-6">
      {!last && (
        <span
          aria-hidden
          className="absolute bottom-0 left-[5px] top-4 w-px bg-neutral-900/15"
        />
      )}
      <span
        aria-hidden
        className={cn(
          "absolute left-0 top-2.5 h-[11px] w-[11px] rounded-full border-2",
          stop ? "border-route bg-route" : "border-neutral-900/25 bg-card"
        )}
      />
      <div className="pb-3">
        <div className="font-mono text-[11px] text-neutral-700">{label}</div>
        {stop ? (
          <div className="flex items-start justify-between gap-2">
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-900">
              {stop.label}
            </span>
            {onClear && (
              <button
                type="button"
                onClick={onClear}
                aria-label={`Remove ${label.toLowerCase()}`}
                className="-my-1 shrink-0 rounded-full p-1 text-neutral-700 transition-colors hover:bg-neutral-900/5 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400"
              >
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        ) : (
          <p className="text-sm text-neutral-700">{prompt}</p>
        )}
        {children}
      </div>
    </li>
  );
}

/**
 * The trip as a sequence of rows joined by a connector line — the same visual
 * language PickupTimelineCard already uses, so an assembled trip doesn't read
 * as a new idiom.
 *
 * The ranked suggestions that used to be the route-picker list now hang off
 * whichever slot is still empty, which is what preserves the "here are your
 * nearest drop-offs" discovery the old panel gave.
 */
export function TripItinerary({
  plan,
  suggestions,
  onPick,
  onClearSlot,
  onClearTrip,
}: {
  plan: TripPlan;
  suggestions: { slot: "pickup" | "dropOff"; items: SlotSuggestion[] } | null;
  onPick: (slot: "pickup" | "dropOff", id: string) => void;
  onClearSlot: (slot: SlotName) => void;
  onClearTrip: () => void;
}) {
  const hasAny = plan.pickup || plan.dropOff || plan.end;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-mono text-[11px] text-neutral-700">Your trip</h2>
        {hasAny && (
          <button
            type="button"
            onClick={onClearTrip}
            className="rounded-sm font-mono text-[11px] text-clay-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400"
          >
            Clear trip
          </button>
        )}
      </div>

      <ol className="mt-2">
        <Row label="Start" stop={plan.start} />

        {OPTIONAL_ROWS.map((row, i) => {
          const stop = plan[row.slot];
          // Narrowed to a value (not a boolean) so `sug.items` typechecks below.
          const sug =
            !stop && suggestions && suggestions.slot === row.slot ? suggestions : null;

          return (
            <Row
              key={row.slot}
              label={row.label}
              stop={stop}
              prompt={row.prompt}
              last={i === OPTIONAL_ROWS.length - 1}
              onClear={stop ? () => onClearSlot(row.slot) : undefined}
            >
              {sug && sug.items.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {sug.items.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => onPick(sug.slot, s.id)}
                        className="flex w-full items-center gap-3 rounded-xl border border-neutral-900/10 px-3 py-2 text-left transition-colors hover:border-neutral-900/25 hover:bg-neutral-900/[0.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400"
                      >
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-sm font-medium text-neutral-900">
                            {s.name}
                          </span>
                          {s.recommended && (
                            <span className="mt-1 inline-flex w-fit items-center rounded-full bg-clay-50 px-1.5 py-0.5 font-mono text-[9px] text-clay-800">
                              Fastest
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 text-right">
                          {s.minutes != null && (
                            <span className="block font-mono text-sm font-bold tabular-nums text-neutral-900">
                              {s.minutes} min
                            </span>
                          )}
                          <span className="block font-mono text-[11px] tabular-nums text-neutral-700">
                            {s.miles.toFixed(1)} mi
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Row>
          );
        })}
      </ol>
    </div>
  );
}
```

- [x] **Step 2: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: typecheck silent; lint shows only the two known `ListingDetail.tsx` warnings

- [x] **Step 3: Commit**

```bash
git add components/map/TripItinerary.tsx
git commit -m "Add TripItinerary: the trip as connected rows

Same connector-line language PickupTimelineCard uses, so an assembled
trip doesn't read as a new idiom. The ranked candidates that were the
route-picker list now hang off whichever slot is still empty, which is
what preserves the nearest-drop-offs discovery the old panel gave."
```

---

### Task 7: Styleguide coverage

**Files:**
- Create: `components/map/MapPlannerDemo.tsx`
- Modify: `app/styleguide/page.tsx`

**Interfaces:**
- Consumes: `LocationSearchField` (Task 5), `TripItinerary` (Task 6), `useTripPlan` (Task 4).
- Produces: `<MapPlannerDemo />` — self-contained, no props.

The styleguide page is a server component, so it cannot pass callbacks to a
client component. This one client wrapper holds the demo state for both new
components.

- [x] **Step 1: Write the demo component**

Create `components/map/MapPlannerDemo.tsx`:

```tsx
"use client";

import { useState } from "react";
import { LocationSearchField } from "./LocationSearchField";
import { TripItinerary } from "./TripItinerary";
import { useTripPlan } from "./useTripPlan";

const DEMO_RESTAURANTS = [
  { id: "r1", name: "Sunrise Bakery", lat: 40.036, lng: -75.52 },
  { id: "r2", name: "Corner Deli", lat: 40.041, lng: -75.498 },
];
const DEMO_DROPOFFS = [
  { id: "d1", name: "St. Mark's Shelter", lat: 40.019, lng: -75.535 },
  { id: "d2", name: "Paoli Community Fridge", lat: 40.043, lng: -75.482 },
];

const FIELD =
  "w-full rounded-xl border border-neutral-900/10 bg-card px-3 py-1.5 text-sm " +
  "placeholder:text-neutral-700 focus-visible:outline-none focus-visible:ring-2 " +
  "focus-visible:ring-rescued-400 focus-visible:ring-offset-1";

/** Styleguide-only harness: the planner's two new pieces with mock data. */
export function MapPlannerDemo() {
  const { plan, pickStop, setStop, clearAll } = useTripPlan({
    restaurants: DEMO_RESTAURANTS,
    dropOffs: DEMO_DROPOFFS,
  });
  const [query, setQuery] = useState("");

  return (
    <div className="max-w-[340px] space-y-4 rounded-2xl border border-neutral-900/10 bg-neutral-50 p-3.5">
      <LocationSearchField
        label="Your location"
        value={query}
        onChange={setQuery}
        onSelect={(stop) => setStop("start", stop)}
        restaurants={DEMO_RESTAURANTS}
        dropOffs={DEMO_DROPOFFS}
        recent={[]}
        placeholder="Try typing sun"
        inputClassName={FIELD}
      />
      <TripItinerary
        plan={plan}
        suggestions={
          plan.pickup && !plan.dropOff
            ? {
                slot: "dropOff",
                items: [
                  { id: "d1", name: "St. Mark's Shelter", minutes: 8, miles: 2.3, recommended: true },
                  { id: "d2", name: "Paoli Community Fridge", minutes: 14, miles: 4.1, recommended: false },
                ],
              }
            : !plan.pickup
              ? {
                  slot: "pickup",
                  items: [
                    { id: "r1", name: "Sunrise Bakery", minutes: 6, miles: 1.8, recommended: true },
                    { id: "r2", name: "Corner Deli", minutes: 11, miles: 3.2, recommended: false },
                  ],
                }
              : null
        }
        onPick={(slot, id) => {
          const src = slot === "pickup" ? DEMO_RESTAURANTS : DEMO_DROPOFFS;
          const hit = src.find((e) => e.id === id);
          if (hit) {
            pickStop({
              kind: slot === "pickup" ? "rest" : "drop",
              id: hit.id,
              center: [hit.lng, hit.lat],
              label: hit.name,
            });
          }
        }}
        onClearSlot={(slot) => setStop(slot, null)}
        onClearTrip={clearAll}
      />
    </div>
  );
}
```

- [x] **Step 2: Add the styleguide section**

In `app/styleguide/page.tsx`, add the import alongside the others:

```tsx
import { MapPlannerDemo } from "@/components/map/MapPlannerDemo";
```

Then add a new `<Section>` immediately before the closing `</div>` of the sections
list (after the last existing `</Section>`):

```tsx
<Section
  title="Trip planner"
  hint="The rescue map's itinerary and location search. Fixed slots — start, pickup, drop-off, end — filled by tapping pins on the real map; the ranked candidates hang off whichever slot is still empty. Type 'sun' in the field to see on-map locations rank above addresses."
>
  <MapPlannerDemo />
</Section>
```

- [x] **Step 3: Verify in the browser**

```bash
npm run typecheck && npm run lint
```

Then start the preview (`preview_start` with `{name: "dev"}`), open
`http://localhost:3000/styleguide`, scroll to "Trip planner", and confirm:
- Typing `sun` lists "Sunrise Bakery" under an "On the map" header.
- ArrowDown/ArrowUp move the highlight; Enter selects; Escape closes.
- Tapping a suggested pickup fills the Pickup row and the drop-off suggestions appear.
- The `×` on a filled row clears it; "Clear trip" empties all but Start.
- Console has no hydration warnings.

Address suggestions will NOT appear locally. Note this is not an egress restriction: api.mapbox.com resolves and the token authenticates; the requests are simply never issued from the page.
That is expected here; do not report it as a bug, and do not claim they work.

- [x] **Step 4: Commit**

```bash
git add components/map/MapPlannerDemo.tsx app/styleguide/page.tsx
git commit -m "Add the trip planner to the styleguide

The styleguide page is a server component and can't pass callbacks to a
client one, so a single client harness holds demo state for both new
pieces. Address results stay empty here — the sandbox can't reach
api.mapbox.com."
```

---

### Task 8: Wire the trip into `RescueMap`

**Files:**
- Modify: `components/RescueMap.tsx`

**Interfaces:**
- Consumes: `useTripPlan` (Task 4), `TripItinerary`/`SlotSuggestion` (Task 6), `LocationSearchField` (Task 5), `rememberRecent` (Task 2).
- Produces: no new exports.

This is the largest task. It replaces four `useState` pairs, the marker click
handlers, and the panel's route-picker list.

- [x] **Step 1: Replace the absorbed state**

Delete these four state declarations (`RescueMap.tsx:368-371`):

```ts
const [myLoc, setMyLoc] = useState<[number, number]>(MY_DEFAULT);
const [myLabel, setMyLabel] = useState("Malvern Prep");
const [dest, setDest] = useState<[number, number] | null>(null);
const [destLabel, setDestLabel] = useState("");
```

Add the hook and derived aliases in their place:

```ts
const { plan, pickStop, setStop, clearAll } = useTripPlan({ restaurants, dropOffs });
const [recent, setRecent] = useState<Stop[]>([]);

// Aliases so the existing map/camera/marker code reads unchanged.
const myLoc = plan.start.center;
const myLabel = plan.start.label;
const dest = plan.end?.center ?? null;
const destLabel = plan.end?.label ?? "";
```

`hydrated` is deliberately not destructured — `RescueMap` has no use for it and an
unused binding trips lint.

Find every write to the removed setters:

```bash
grep -n "setMyLoc(\|setMyLabel(\|setDest(\|setDestLabel(" components/RescueMap.tsx
```

Replace each `setMyLoc(x)` / `setMyLabel(y)` pair with
`setStop("start", { kind: "place", center: x, label: y })`, and each
`setDest(x)` / `setDestLabel(y)` pair with
`setStop("end", x ? { kind: "place", center: x, label: y } : null)`. The grep must
return nothing when you're done.

Add to the imports at the top of the file:

```ts
import { useTripPlan } from "./map/useTripPlan";
import { TripItinerary, type SlotSuggestion } from "./map/TripItinerary";
import { LocationSearchField } from "./map/LocationSearchField";
import { rememberRecent } from "@/lib/mapSuggestions";
import type { Stop } from "@/lib/tripPlan";
```

- [x] **Step 2: Migrate the old storage keys, then delete their effects**

Storage consolidates from four keys (`mm.myLoc`, `mm.myLabel`, `mm.dest`,
`mm.destLabel`) to one (`mm.trip`). **Without a migration every existing user
silently loses their saved start location on first load** — they'd be dropped back
to Malvern Prep with no explanation. Add a one-time migration to
`components/map/useTripPlan.ts`, inside the mount effect, before the `mm.trip` read:

```ts
// One-time migration off the pre-trip keys. Runs only when there's no mm.trip
// yet, so it can never overwrite a newer trip, and clears the old keys so it
// happens exactly once.
function migrateLegacy(): TripPlan | null {
  try {
    const ml = localStorage.getItem("mm.myLoc");
    if (!ml) return null;
    const c = JSON.parse(ml);
    if (!Array.isArray(c) || c.length !== 2) return null;

    let next = emptyTrip({
      kind: "place",
      center: [c[0], c[1]],
      label: localStorage.getItem("mm.myLabel") || "Saved location",
    });

    const d = localStorage.getItem("mm.dest");
    if (d) {
      const dc = JSON.parse(d);
      if (Array.isArray(dc) && dc.length === 2) {
        next = setSlot(next, "end", {
          kind: "place",
          center: [dc[0], dc[1]],
          label: localStorage.getItem("mm.destLabel") || "Saved destination",
        });
      }
    }
    for (const k of ["mm.myLoc", "mm.myLabel", "mm.dest", "mm.destLabel"]) {
      localStorage.removeItem(k);
    }
    return next;
  } catch {
    return null;
  }
}
```

and call it in the effect:

```ts
useEffect(() => {
  const restIds = new Set(restaurants.map((r) => r.id));
  const dropIds = new Set(dropOffs.map((d) => d.id));
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      setPlan(hydrateTrip(raw, restIds, dropIds));
    } else {
      const migrated = migrateLegacy();
      if (migrated) setPlan(migrated);
    }
  } catch {
    /* ignore corrupt storage */
  }
  setHydrated(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
```

Then in `RescueMap.tsx`, remove the `mm.myLoc` / `mm.myLabel` / `mm.dest` /
`mm.destLabel` reads and writes (`RescueMap.tsx:427-478`), keeping only the
first-visit geolocation call:

```ts
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
```

- [x] **Step 3: Make pin clicks fill trip slots**

At `RescueMap.tsx:679` replace the restaurant click handler body with:

```ts
el.addEventListener("click", (ev) => {
  ev.stopPropagation();
  setSelected((cur) =>
    cur?.kind === "rest" && cur.id === r.id ? null : { kind: "rest", id: r.id }
  );
  pickStop({ kind: "rest", id: r.id, center: [r.lng, r.lat], label: r.name });
});
```

At `RescueMap.tsx:705` replace the drop-off click handler body with:

```ts
el.addEventListener("click", (ev) => {
  ev.stopPropagation();
  setSelected((cur) =>
    cur?.kind === "drop" && cur.id === d.id ? null : { kind: "drop", id: d.id }
  );
  pickStop({ kind: "drop", id: d.id, center: [d.lng, d.lat], label: d.name });
});
```

Selection still drives highlighting and which entity's details the panel shows;
the trip slot is filled alongside it.

- [x] **Step 4: Derive the active route from the trip**

Replace the `activeRoute` state (`RescueMap.tsx:352`) with a derived value:

```ts
// With fixed slots there is exactly one journey once both ends are filled, so
// the active route follows the trip rather than being independently selected.
const activeRoute =
  panel?.kind === "rest" ? (plan.dropOff?.kind === "drop" ? plan.dropOff.id : null)
  : panel?.kind === "drop" ? (plan.pickup?.kind === "rest" ? plan.pickup.id : null)
  : null;
```

Delete `setActiveRoute` and its call sites. `activeRouteRef` and `paintRoutes`
keep working — they read the value, they don't set it.

- [x] **Step 5: Swap the route-picker list for the itinerary**

Replace the panel's options list (`RescueMap.tsx:1402-1478`, the
`panel.options.length > 1` hint through the closing of the `<ul>`) with:

```tsx
<div className="mt-3">
  <TripItinerary
    plan={plan}
    suggestions={
      panel && panel.options.length > 0
        ? {
            slot: panel.kind === "rest" ? "dropOff" : "pickup",
            // RouteOption and SlotSuggestion are structurally identical
      // ({id, name, miles, minutes?, recommended}), so this assigns without a
      // cast — and tsc will flag it if either side drifts.
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
```

Keep the empty-state paragraph (`panel.options.length === 0`) and everything
below the list — the trip summary line, the details disclosure, the links.

- [x] **Step 6: Swap both inputs for the combobox**

Replace the "Your location" input block (`RescueMap.tsx:1229-1265`) with:

```tsx
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
```

Keep the "Use my location" button underneath, unchanged.

Apply the same swap to the "Final destination" input (`RescueMap.tsx:1266-1299`),
with `label="Final destination"`, `value={destInput}`, `onChange={setDestInput}`,
and `onSelect` writing to the `"end"` slot. Keep the existing "Clear" button.

- [x] **Step 7: Verify**

```bash
npm test && npm run typecheck && npm run lint
```

Expected: all tests pass, typecheck silent, lint shows only the two known
`ListingDetail.tsx` warnings.

Then in the browser at `http://localhost:3000/map`: confirm no console errors and
no hydration warning. Map tiles will not render in this sandbox.

- [x] **Step 8: Commit**

```bash
git add components/RescueMap.tsx
git commit -m "Wire the trip planner into the rescue map

Pin clicks now fill trip slots alongside selection, the route-picker list
becomes the itinerary with its candidates hanging off the empty slot, and
both address inputs become comboboxes. activeRoute is derived rather than
separately selected — with fixed slots there is only ever one journey
once both ends are filled. The four myLoc/dest state pairs and their
three localStorage keys collapse into useTripPlan's single mm.trip."
```

---

### Task 9: Docked layout at `lg`

**Files:**
- Create: `components/map/useIsWide.ts`
- Modify: `components/RescueMap.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `useIsWide(): boolean` — true at ≥1024px, false during SSR and first client render.

- [x] **Step 1: Write the media-query hook**

Create `components/map/useIsWide.ts`:

```ts
"use client";

import { useEffect, useState } from "react";

/** Tailwind's `lg`. */
const QUERY = "(min-width: 1024px)";

/**
 * Starts false so the server render and the first client render agree; the
 * effect corrects it within a frame. Anything that must match on both passes
 * (the bottom-sheet fallback) is therefore the safe default.
 */
export function useIsWide(): boolean {
  const [wide, setWide] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const sync = () => setWide(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return wide;
}
```

- [x] **Step 2: Make `fitToRoute` padding side-aware**

Replace `fitToRoute` (`RescueMap.tsx:191-205`) with:

```ts
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
```

Update every `fitToRoute(map, pts)` call site to pass the dock. Find them with:

```bash
grep -n "fitToRoute(" components/RescueMap.tsx
```

Each becomes `fitToRoute(map, pts, isWide ? "left" : "bottom")`. Add `isWide` to
the dependency array of every effect that calls it.

- [x] **Step 3: Add the hook and stop auto-hiding the legend at `lg`**

Add near the other hooks in the component body:

```ts
const isWide = useIsWide();
```

Find the effect that closes the controls card on selection (it calls
`setSearchOpen(false)` when `selected` becomes non-null) and guard it:

```ts
// At lg the legend and the panel share a column, so the legend stays put —
// hiding it is exactly what the docked layout is meant to avoid.
if (!isWide) setSearchOpen(false);
```

- [x] **Step 4: Restructure the overlay into a column at `lg`**

Wrap the controls card and the panel in a shared column. Change the overlay
container (`RescueMap.tsx:1207`) to:

```tsx
<div className="pointer-events-none absolute inset-0 z-[1] lg:flex lg:flex-col lg:gap-3 lg:p-3">
```

Change the controls card's className (`RescueMap.tsx:1211`) to:

```
pointer-events-auto absolute left-3 top-3 flex max-h-[45%] w-[min(92vw,340px)]
flex-col gap-3 overflow-y-auto rounded-2xl border border-neutral-900/10
bg-neutral-50/95 p-3.5 shadow-card backdrop-blur-sm
lg:static lg:max-h-none lg:w-[340px] lg:shrink-0 lg:overflow-visible
```

`lg:overflow-visible` matters: the combobox dropdown is absolutely positioned and
would be clipped by the card's own `overflow-y-auto`.

Change the panel's className (`RescueMap.tsx:1360`) to:

```
absolute inset-x-0 bottom-0 z-20 max-h-[45vh] overflow-y-auto rounded-t-2xl
border-t border-neutral-900/10 bg-card px-4 py-3
shadow-[0_-6px_20px_rgba(51,52,44,0.12)] animate-fade-in
lg:pointer-events-auto lg:static lg:inset-x-auto lg:bottom-auto lg:z-auto
lg:min-h-0 lg:max-h-none lg:w-[340px] lg:flex-1 lg:rounded-2xl lg:border
lg:border-neutral-900/10 lg:shadow-card
```

Keep `animate-fade-in` at both widths — it's a 0.18s opacity fade with no
transform, so it reads the same docked as it does rising as a sheet.

The `lg:` overlay container is `lg:p-3`, so drop the cards' own `left-3 top-3`
offsets at `lg` via `lg:static` (already above) — the container's padding supplies
the inset.

- [x] **Step 5: Verify at both widths**

```bash
npm run typecheck && npm run lint
```

In the browser at `http://localhost:3000/map`:
- At 1280×800: the legend stays visible with a panel open; the panel sits directly
  under it at the same width; only the panel scrolls when content overflows.
- At 900×700: unchanged bottom sheet, legend auto-hides as before.
- Resize across 1024px with a panel open and confirm no layout break.
- Console clean, no hydration warning.

Route framing cannot be verified — Directions requests fail in this sandbox.

- [x] **Step 6: Commit**

```bash
git add components/map/useIsWide.ts components/RescueMap.tsx
git commit -m "Dock the selection panel under the legend at lg

One flex column at lg: legend shrink-0 so it always stays visible, panel
min-h-0 flex-1 so only it scrolls. Below lg the bottom sheet is
unchanged. Two consequences that are easy to miss are handled here: the
searchOpen auto-hide is disabled at lg (hiding the legend is what this
layout exists to prevent), and fitToRoute's camera padding moves from
bottom to left so routes aren't framed underneath the column."
```

---

### Task 10: Theme fixes in the controls card

**Files:**
- Modify: `components/RescueMap.tsx`

**Interfaces:** none.

- [x] **Step 1: Fix the focus ring**

In `fieldCls` (`RescueMap.tsx:1143-1146`) change `focus-visible:ring-transit-400`
to `focus-visible:ring-rescued-400`. Form inputs focus with the sage ring, and
every other control in this file already does.

- [x] **Step 2: Fix the sentence-case labels**

- The collapsed pill's text: `search` → `Search`.
- The destination clear button's text: `clear` → `Clear`.

- [x] **Step 3: Remove the no-op span**

In the "Final destination" label, replace:

```tsx
Final destination <span className="text-neutral-700">(optional)</span>
```

with:

```tsx
Final destination (optional)
```

The span set the same color as its parent.

- [x] **Step 4: Verify**

```bash
npm run typecheck && npm run lint
grep -n "ring-transit-400" components/RescueMap.tsx
```

Expected: typecheck silent, lint shows only the known warnings, and the grep
returns nothing.

- [x] **Step 5: Commit**

```bash
git add components/RescueMap.tsx
git commit -m "Fix theme drift in the rescue map controls card

The address inputs focused with a plum ring against the rule that form
inputs use the sage one — every other control in this file already did.
Sentence-case the collapsed 'Search' pill and the 'Clear' button, and
drop a span that re-declared its parent's color."
```

---

## Verification before opening a PR

```bash
npm test
npm run typecheck
npm run lint
```

Then in the browser: `/styleguide` → "Trip planner", and `/map` at 1280×800 and
900×700.

**State honestly in the PR body that these were not verified:** address
suggestions, route leg times, route camera framing, and map tiles — all require
`api.mapbox.com`. Those requests are never issued locally — though the host IS reachable and the token IS valid, so do not describe it as blocked. They need a preview deploy.
