# Rescue map: click-to-build itinerary, location suggestions, docked panel

**Date:** 2026-07-22
**Status:** approved design, not yet implemented
**Branch:** `rescue-map-itinerary` (off `main`; independent of PR #26 / `soft-harvest-theme`,
which does not touch `RescueMap.tsx`)

## Problem

The rescue map's planning flow has four weaknesses, raised together:

1. **The journey is implicit.** Selecting a pin generates candidate journeys and the
   chosen one collapses into a single summary line
   (`you → Sunrise Bakery → St. Mark's → destination`). There is no explicit,
   editable trip.
2. **Address entry is blind.** Both inputs are type-then-press-Set, backed by
   `geocodeClient` with `limit=1`. You get one guess, with no way to see or choose
   among alternatives, and no way to search by venue name.
3. **The panel hides the controls.** The selection panel is a bottom sheet and the
   controls card auto-hides when a pin is selected, so on a wide screen the map
   loses its legend exactly when the user is mid-task — despite having room for both.
4. **Small theme drift in the controls card.**

## Goals

- A visible, editable trip the user assembles by clicking pins.
- Suggestion dropdown on both location inputs.
- At `lg` and above, dock the selection panel under the legend at matching width,
  keeping the legend visible.
- Fix the controls card's theme drift.

## Non-goals

- Multi-stop runs (three restaurants, two shelters). Ruled out: a volunteer has one
  active rescue at a time, and a free chain can express trips the app cannot claim.
- Splitting one pickup across several drop-offs. No data model supports it.
- Re-skinning the Mapbox base style, recoloring the pins, or replacing the
  wayfinding blue. `RAMP.route` (`#2563B0`) stays: `tailwind.config.ts:77` scopes it
  deliberately as "wayfinding only — not a status color", and maps blue is a strong
  convention for a route line.
- Any restructuring of `RescueMap.tsx` beyond what these features require.

---

## 1. Trip model — `components/map/useTripPlan.ts`

Four named slots, not a list. The list-like appearance is a rendering choice; the
underlying model is fixed so it cannot express an unclaimable trip.

```ts
export type Stop =
  | { kind: "place"; center: [number, number]; label: string }
  | { kind: "rest" | "drop"; id: string; center: [number, number]; label: string };

export interface TripPlan {
  start: Stop;          // always present; defaults to MY_DEFAULT / "Malvern Prep"
  pickup: Stop | null;
  dropOff: Stop | null;
  end: Stop | null;     // optional final destination
}
```

### Click semantics

| Action | Result |
| --- | --- |
| Click restaurant pin | fills `pickup`, replacing any existing value |
| Click drop-off pin | fills `dropOff`, replacing any existing value |
| Click the pin already occupying its slot | clears that slot |
| Row `×` button | clears that slot |
| "Clear trip" | resets `pickup`, `dropOff`, `end`; `start` is retained |

Replace-rather-than-append is what makes fixed slots forgiving: clicking a second
restaurant swaps the pickup instead of raising an error the user must resolve.

### Absorbed state

`myLoc` / `myLabel` become `plan.start`; `dest` / `destLabel` become `plan.end`.
These four `useState` calls are removed from `RescueMap.tsx` rather than kept
alongside the hook — two sources of truth for the same value is the defect this
design is trying to avoid.

### Persistence

Extends the existing `localStorage` hydrate/persist effects (`RescueMap.tsx:429`,
`:457`). The stored shape gains `pickup` / `dropOff`. Hydration must tolerate a
stored trip whose `rest`/`drop` ids no longer exist (a listing expired, a location
was removed): unknown ids are dropped to `null` on load, silently. A stale id must
never render a row the user cannot act on.

---

## 2. Ranked next-stop suggestions

The discovery value of today's flow is preserved inside the new model rather than
removed.

When `pickup` is set and `dropOff` is `null`, the empty drop-off row renders the
ranked candidates — nearest drop-offs by drive time, "Fastest" marked. Tapping one
fills the slot. Symmetrically, choosing a drop-off first suggests restaurants.

**This reuses today's computation unchanged**: the same candidate-building code that
produces `panel.options`, the same `routeCache`, `routeGeomsRef`, and Directions
fetch. Only the presentation moves. No new ranking algorithm is introduced.

When both slots are filled, no suggestions render.

### What happens to `panel` / `selected` / `activeRoute`

`selected` and `panel` are retained — they still drive which pin is highlighted and
which entity's details the panel shows. What changes is that `panel.options` is no
longer rendered as a route-picker list; it becomes the suggestion source for the one
empty slot, and the itinerary is rendered in its place.

`activeRoute` is derived rather than independently selected: with fixed slots there
is exactly one journey once both slots are filled, so the active route is whichever
option corresponds to `plan.dropOff` (or `plan.pickup`). The `setActiveRoute` click
handler on the old list is replaced by the slot-filling action. `activeRouteRef` and
`paintRoutes` continue to work unchanged, reading the derived value.

---

## 3. Itinerary rendering — `components/map/TripItinerary.tsx`

A vertical sequence of rows joined by a connector line, matching the visual language
`PickupTimelineCard` already establishes, so the trip does not read as a new idiom.

- **Filled row:** mono role label (`Pickup`), sans venue name, mono tabular leg
  time + distance, `×` to clear.
- **Empty row:** dashed border, prompt copy (`Choose a pickup — tap a pin`), and the
  ranked suggestions from §2 when applicable.
- **Leg swatch:** matches the map's line color for that leg.

Sentence case throughout, per CLAUDE.md — including the role labels.

Leg times come from the resolved route; before resolution the row shows distance
only, as the current panel already does.

---

## 4. Location search — `components/map/LocationSearchField.tsx`

One component, used by both inputs. A WAI-ARIA combobox:

- Input carries `role="combobox"`, `aria-expanded`, `aria-controls`,
  `aria-activedescendant`.
- Results are a `listbox` of `option`s with stable ids.
- <kbd>↑</kbd>/<kbd>↓</kbd> move the active option, <kbd>Enter</kbd> selects,
  <kbd>Esc</kbd> closes and returns focus to the input, blur closes.
- Pointer and keyboard selection go through one `onSelect(stop)` path.
- 250 ms debounce. The in-flight request is cancelled with `AbortController` when
  the query changes, so a slow response cannot overwrite a newer one.

### Sources, in rank order

1. **Recent** — from `localStorage`, max 3. No network.
2. **Locations** — restaurants and drop-offs already loaded on the map, matched by
   case-insensitive substring. No network.
3. **Addresses** — Mapbox geocoding, `limit=5`.

Groups render with mono sentence-case headers. The first two require no network,
which keeps the feature useful when the Mapbox call is slow, rate-limited, or
blocked.

`lib/geocode-client.ts` gains:

```ts
export async function geocodeSuggest(
  query: string,
  signal?: AbortSignal,
): Promise<GeocodeHit[]>   // [] on any failure, never throws
```

The existing single-result `geocodeClient` stays for the Enter-to-set path and its
current callers.

Merging and ranking live in a pure `mergeSuggestions(recent, entities, addresses)`
so they can be unit-tested without a network or a DOM.

### States

- **No matches:** a single non-interactive `No matches` row.
- **Network failure:** address group is omitted; recent and locations still render.
  The existing `geoError` line is unchanged for the Set path.
- **Empty query:** shows recent only, or nothing if there are none.

---

## 5. Layout

**Below `lg` (<1024px): unchanged.** Legend card top-left, selection panel as a
bottom sheet. No behavioural change.

**At `lg` and above:** the left overlay becomes one column.

```
absolute left-3 top-3 bottom-3 flex w-[340px] flex-col gap-3
  legend  → shrink-0                      (natural height, always visible)
  panel   → min-h-0 flex-1 overflow-y-auto
```

Flex resolves "legend fixed, panel scrolls" without measuring heights in JS. The
column is a flat `w-[340px]` at `lg`: the existing `w-[min(92vw,340px)]` clamp only
binds below ~370px viewport width, so it is redundant here. Because both cards are
children of the column, the panel matches the legend's width by construction rather
than by repeating a literal.

**Panel contents when docked** are the same as today's sheet — trip itinerary (§3)
replacing the route-picker list, followed by the existing "Pickup & drop-off
details" disclosure and detail links. Only the container and its position change.

Two consequences that are easy to miss:

- **`searchOpen` auto-hide must be disabled at `lg`.** The controls card currently
  hides itself when a pin is selected. That behaviour is precisely what "keep
  showing the legend" forbids, and it stays only below `lg`.
- **`fitToRoute` padding must become side-aware.** It currently pads the camera at
  the bottom by roughly the sheet's height (`RescueMap.tsx:191`). At `lg` the
  obstruction is on the *left*, so the padding must move. Left unchanged, routes
  draw underneath the column and it reads as a camera bug rather than a layout one.

---

## 6. Theme fixes

Scoped to genuine drift in the controls card:

| Location | Change | Rule |
| --- | --- | --- |
| `fieldCls` | `ring-transit-400` → `ring-rescued-400` | CLAUDE.md: form inputs focus with the sage ring. Every other control in this same file already uses `ring-rescued-400`. |
| collapsed pill | `search` → `Search` | Sentence case: capitalize word-labels. |
| destination clear | `clear` → `Clear` | Same. |
| `Final destination` label | remove `<span className="text-neutral-700">(optional)</span>` | The span re-declares its parent's color; it is a no-op. |

**Explicitly not changed:** the `setBtnCls` `bg-neutral-900` fill. `Button.tsx:10`
documents the ink fill as deliberately colorless "so it never competes with the
semantic colors around it" — the Set button already follows that reasoning. It is
not swapped to the shared `Button` component either, which is fixed at
`px-6 py-3 text-[16px]` and too large for this card; adopting it would mean
overriding most of its recipe.

---

## 7. Module boundaries

`RescueMap.tsx` is 1656 lines before this work. The new logic is extracted so the
file grows only where features actually land.

| Module | Responsibility | Depends on |
| --- | --- | --- |
| `useTripPlan.ts` | slot state, click semantics, persistence | nothing — pure state |
| `LocationSearchField.tsx` | one combobox: debounce, sources, keyboard, ARIA | `geocode-client`, entity list |
| `TripItinerary.tsx` | renders slots, suggestions, leg times | `useTripPlan` output |
| `mergeSuggestions()` | pure ranking/merge | nothing |

`RescueMap.tsx` keeps what only it can do: Mapbox sources, layers, markers, camera,
and the Directions fetch. It gains the `lg` layout branch and loses the four state
pairs absorbed by `useTripPlan`.

No other restructuring of `RescueMap.tsx` is in scope.

---

## 8. Testing

**Unit (`node --test`, alongside `lib/*.test.ts`):**

- `useTripPlan`: fill, replace, toggle-off, clear; `start` survives "Clear trip";
  persistence round-trip; stale `rest`/`drop` ids drop to `null` on hydrate.
- `mergeSuggestions`: rank order across the three sources; de-duplication when an
  address and a known location are the same place; empty-source handling.

**Browser:** the `lg` docked layout and the sheet fallback below it; combobox
keyboard nav and focus return; legend remaining visible with a panel open.

**Cannot be verified in this environment — but not because Mapbox is blocked.**
Later testing disproved that: api.mapbox.com resolves and returns 200, the token
authenticates against the Styles API, and the CSP allows the host. What is true is
that no request to
`api.mapbox.com` appears in the network log, so tiles, geocoding,
and Directions all fail locally. That means **address suggestions and route leg
times must be verified on a preview deploy**, and any claim that they work locally
would be false. The three-source design partly mitigates this: recent and location
suggestions are testable without a network.

## Risks

- **`fitToRoute` padding** is the most likely source of a subtle post-merge bug;
  it is called from several effects.
- **Absorbing four state pairs into `useTripPlan`** touches code paths beyond the
  new features (localStorage hydration, the geocode Set handlers, marker rendering).
  This is the largest blast radius in the change.
- **Mapbox verification gap**, above.
