# Demo Guided Tour Implementation Plan

> **Superseded:** this plan was implemented and then removed in full on 2026-09-03
> (`3a908ba`). It is kept as history — do not execute it.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A spotlight walkthrough that points at real UI, tells a demo viewer what to click, and waits for them to click it — 5 chapters, 21 steps, volunteer only.

**Architecture:** All decisions live in pure data under `lib/tour/` where the test runner can reach them. A single client `TourProvider` mounts once in the header, resolves the current step's anchor from a `data-tour` attribute, and portals a spotlight overlay at it. Components gain attributes only — no logic changes.

**Tech Stack:** Next.js 14 App Router, React, TypeScript, Tailwind, `node:test` via tsx.

**Spec:** `docs/superpowers/specs/2026-08-21-demo-guided-tour-design.md`

**Branch:** `demo-guided-personas` (already checked out; the demo persona work is already committed there)

## Global Constraints

- **Tailwind only.** No inline style objects. The single exception in this plan is the spotlight/bubble rect, which must be computed at runtime from `getBoundingClientRect()` — precedent: `ReliabilityMeter.tsx:43` uses `style={{ width }}` for the same reason.
- **Sentence case everywhere**, including mono metadata and micro-labels: `Chapter 3 of 5 · Step 2 of 4`, `Skip tour`, `Waiting for your click`, `Next`. Never Title Case, never ALLCAPS, never an all-lowercase word-label. Pure data tokens stay as written (`11m 49s`, `0.4 mi`).
- **Text is ink.** Body/primary `neutral-800`/`900`; secondary `neutral-700`. Never `neutral-400/500/600` for text (borders and fills only). The bubble inverts: `neutral-50` text on an ink fill.
- **Font roles:** `font-display` (Fraunces) headings, `font-sans` body, `font-mono` for ALL metadata — the step counter, group labels, status words.
- **Focus rings are sage:** `focus-visible:ring-2 focus-visible:ring-rescued-400`.
- **Colour is semantic.** The tour uses `rescued` (sage) for the "act here" ring and neutral ink for chrome. Do not introduce a new colour or a one-off hex.
- **Motion:** any pulse goes behind `motion-safe:`. `globals.css` already disables animation under `prefers-reduced-motion`.
- **Tests must live in `lib/`** — `package.json`'s test script globs only `lib/*.test.ts` and `lib/analytics/*.test.ts`. A test placed anywhere else silently never runs.
- **Verification:** `npm test` (269 passing at plan time — do not regress), `npm run typecheck`, `npm run lint`. Lint currently emits 156 repo-wide warnings, 0 errors, from React Compiler rules adopted in PR #44 — pre-existing, not yours. Confirm your file adds none by counting before and after.
- **Map imagery does not render in this sandbox — but NOT because Mapbox is unreachable.** Mapbox is reachable from this sandbox — the earlier claim that it was not was wrong. Verified: DNS and HTTPS to api.mapbox.com return 200, the token authenticates against the Styles API, lib/csp.ts allows the host in connect-src/img-src plus blob: workers, and both the page and a blob worker can fetch it. What actually fails is narrower and still unexplained: mapbox-gl initialises (canvas, controls and markers all render) but no request to api.mapbox.com is ever issued, so no tiles paint. Treat map imagery as unverified here, but do not record it as a network or egress restriction. Chapter 4's anchors can still be verified; its imagery cannot.

---

### Task 1: Tour step data

**Files:**
- Create: `lib/tour/steps.ts`
- Test: `lib/tourSteps.test.ts`

**Test location matters here.** `package.json`'s test script globs `lib/*.test.ts`, which does **not** match `lib/tour/steps.test.ts` — one directory deeper. A test placed there would exist, pass locally when run by hand, and silently never run in `npm test`. So the test lives at `lib/tourSteps.test.ts` and imports from `./tour/steps`.

**Interfaces:**
- Consumes: nothing.
- Produces: `Advance`, `TourStep`, `TourChapter`, `CHAPTERS`, `TOUR_STEPS`, `stepsInChapter()`, `positionOf()`.

- [ ] **Step 1: Write the failing test**

Create `lib/tourSteps.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CHAPTERS,
  TOUR_STEPS,
  positionOf,
  stepsInChapter,
} from "./tour/steps";

test("there are five chapters, numbered 1..5 in order", () => {
  assert.equal(CHAPTERS.length, 5);
  assert.deepEqual(CHAPTERS.map((c) => c.n), [1, 2, 3, 4, 5]);
});

test("every chapter has at least one step", () => {
  for (const c of CHAPTERS) {
    assert.ok(stepsInChapter(c.n).length > 0, `chapter ${c.n} is empty`);
  }
});

test("step ids are unique", () => {
  const ids = TOUR_STEPS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("anchor names are unique", () => {
  const a = TOUR_STEPS.map((s) => s.anchor);
  assert.equal(new Set(a).size, a.length);
});

test("every step has a non-empty anchor and body", () => {
  for (const s of TOUR_STEPS) {
    assert.ok(s.anchor.length > 0, `${s.id} has no anchor`);
    assert.ok(s.body.length > 0, `${s.id} has no body`);
  }
});

test("steps are grouped: a chapter's steps are contiguous in the list", () => {
  const seen: number[] = [];
  for (const s of TOUR_STEPS) {
    if (seen[seen.length - 1] !== s.chapter) seen.push(s.chapter);
  }
  assert.deepEqual(seen, [1, 2, 3, 4, 5], "chapters must not interleave");
});

test("routes start with a slash", () => {
  for (const s of TOUR_STEPS) {
    assert.ok(s.route.startsWith("/"), `${s.id} route ${s.route}`);
  }
});

test("positionOf reports the step's place within its own chapter", () => {
  const first = TOUR_STEPS[0];
  assert.deepEqual(positionOf(first), {
    chapter: 1,
    chapterOf: 5,
    step: 1,
    stepOf: stepsInChapter(1).length,
  });

  const lastOfCh1 = stepsInChapter(1).at(-1)!;
  const p = positionOf(lastOfCh1);
  assert.equal(p.step, p.stepOf, "last step of a chapter is step N of N");
});

test("the step that demonstrates the takeover expects the listing route", () => {
  // Clicking Home while holding a claim redirects back to the listing
  // (app/(feed)/page.tsx). If this step's route were "/", the tour desyncs.
  const s = TOUR_STEPS.find((x) => x.id === "takeover");
  assert.ok(s, "takeover step missing");
  assert.equal(s!.route, "/listings/:id");
  assert.equal(s!.advance, "click");
});

test("exactly one step mutates demo data", () => {
  const writes = TOUR_STEPS.filter((s) => s.writes);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].id, "claim");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --require ./lib/stub-server-only.cjs --import tsx --test lib/tourSteps.test.ts`
Expected: FAIL — `Cannot find module './tour/steps'`

- [ ] **Step 3: Write the implementation**

Create `lib/tour/steps.ts`:

```ts
// The demo tour's script, as data.
//
// Pure and dependency-free so `npm test` can reach it — the copy and the step
// order are the parts most likely to drift, and they are the parts a test can
// actually hold still. Nothing here is demo-specific: the demo gate lives at the
// provider, so lifting it later means changing one boolean, not this file.

export type Advance = "click" | "next";

export interface TourStep {
  id: string;
  chapter: 1 | 2 | 3 | 4 | 5;
  /** Pathname this step lives on. ":id" matches exactly one segment. */
  route: string;
  /** Matches data-tour="…" on a real element. */
  anchor: string;
  body: string;
  advance: Advance;
  /** True only for the step that writes to the demo world. */
  writes?: true;
}

export interface TourChapter {
  n: 1 | 2 | 3 | 4 | 5;
  name: string;
}

export const CHAPTERS: TourChapter[] = [
  { n: 1, name: "The feed" },
  { n: 2, name: "The listing" },
  { n: 3, name: "Claiming it" },
  { n: 4, name: "Planning the run" },
  { n: 5, name: "Standing and impact" },
];

export const TOUR_STEPS: TourStep[] = [
  // — Chapter 1: the feed —
  {
    id: "feed-heading",
    chapter: 1,
    route: "/",
    anchor: "feed-heading",
    body: "Every pickup that needs a driver right now. The count under the heading is what's claimable today.",
    advance: "next",
  },
  {
    id: "urgency",
    chapter: 1,
    route: "/",
    anchor: "card-urgency",
    body: "Each one is a countdown. Sage is calm, honey is soon, tomato is minutes left — and the word says it too, so it never rides on colour alone.",
    advance: "next",
  },
  {
    id: "card-anatomy",
    chapter: 1,
    route: "/",
    anchor: "card-body",
    body: "Servings, distance, the restaurant, and what the food actually is — enough to decide without opening it.",
    advance: "next",
  },
  {
    id: "feed-split",
    chapter: 1,
    route: "/",
    anchor: "feed-claimable",
    body: "Claimable pickups sit up top. Anything already spoken for drops into its own section below, so the feed never dangles something you can't take.",
    advance: "next",
  },
  {
    id: "scheduled",
    chapter: 1,
    route: "/",
    anchor: "feed-scheduled",
    body: "Scheduled pickups are food that isn't ready yet — posted ahead so you can plan around them.",
    advance: "next",
  },

  // — Chapter 2: the listing —
  {
    id: "open-listing",
    chapter: 2,
    route: "/",
    anchor: "card-open",
    body: "Open one to see the whole job.",
    advance: "click",
  },
  {
    id: "listing-detail",
    chapter: 2,
    route: "/listings/:id",
    anchor: "listing-summary",
    body: "The food, the photo, and the window it has to move in.",
    advance: "next",
  },
  {
    id: "safety",
    chapter: 2,
    route: "/listings/:id",
    anchor: "safety-checklist",
    body: "The food-handling rules, before you're holding the food — not buried in a policy page.",
    advance: "next",
  },
  {
    id: "buddy",
    chapter: 2,
    route: "/listings/:id",
    anchor: "buddy-invite",
    body: "Bring a buddy. Either seat can carry the rescue, and both get credit for it.",
    advance: "next",
  },
  {
    id: "destination",
    chapter: 2,
    route: "/listings/:id",
    anchor: "dropoff-picker",
    body: "Destination first — you pick where it's going before you commit to carrying it, so nobody drives off without a door to knock on.",
    advance: "next",
  },

  // — Chapter 3: claiming —
  {
    id: "claim",
    chapter: 3,
    route: "/listings/:id",
    anchor: "claim-button",
    body: "Claim it. It's yours for the next fifteen minutes.",
    advance: "click",
    writes: true,
  },
  {
    id: "hold",
    chapter: 3,
    route: "/listings/:id",
    anchor: "claim-hold",
    body: "That countdown is real. Miss it and the pickup quietly returns to the feed — held for you, never held over you.",
    advance: "next",
  },
  {
    id: "takeover",
    chapter: 3,
    // Clicking Home while holding a claim redirects straight back here, so the
    // step lives on the listing route, not "/".
    route: "/listings/:id",
    anchor: "nav-feed",
    body: "Try going back to the feed. While you're carrying food, the app hands itself to the rescue — this listing is the home screen until it's delivered.",
    advance: "click",
  },
  {
    id: "exits",
    chapter: 3,
    route: "/listings/:id",
    anchor: "rescue-exits",
    body: "Can't finish? Release it, or take it home overnight. Both are honest exits, and neither one is a flake.",
    advance: "next",
  },

  // — Chapter 4: the map —
  {
    id: "open-map",
    chapter: 4,
    route: "/listings/:id",
    anchor: "nav-map",
    body: "Open the rescue map to plan the run.",
    advance: "click",
  },
  {
    id: "map-search",
    chapter: 4,
    route: "/map",
    anchor: "map-search",
    body: "Search a location. Your own restaurants and drop-offs rank above street addresses, so a venue name is enough.",
    advance: "next",
  },
  {
    id: "map-pin",
    chapter: 4,
    route: "/map",
    anchor: "map-canvas",
    body: "Tap a pin to drop it into the trip.",
    advance: "click",
  },
  {
    id: "map-trip",
    chapter: 4,
    route: "/map",
    anchor: "map-trip",
    body: "The trip fills in as you go: start, pickup, drop-off — with the drive time for each leg.",
    advance: "next",
  },

  // — Chapter 5: standing and impact —
  {
    id: "open-impact",
    chapter: 5,
    route: "/map",
    anchor: "nav-impact",
    body: "Last stop — what all of this adds up to.",
    advance: "click",
  },
  {
    id: "harvest",
    chapter: 5,
    route: "/impact",
    anchor: "personal-harvest",
    body: "Your harvest, counted in meals. Weight and rescue count are the footnotes that make the number credible.",
    advance: "next",
  },
  {
    id: "reliability",
    chapter: 5,
    route: "/impact",
    anchor: "reliability",
    body: "Reliability is a bar, never a grade. No letter, no leaderboard, no red flag on a person who had a bad week.",
    advance: "next",
  },
];

export function stepsInChapter(n: TourChapter["n"]): TourStep[] {
  return TOUR_STEPS.filter((s) => s.chapter === n);
}

export interface StepPosition {
  chapter: number;
  chapterOf: number;
  step: number;
  stepOf: number;
}

/** Where a step sits, for the bubble's "Chapter 3 of 5 · Step 2 of 4". */
export function positionOf(step: TourStep): StepPosition {
  const siblings = stepsInChapter(step.chapter);
  return {
    chapter: step.chapter,
    chapterOf: CHAPTERS.length,
    step: siblings.findIndex((s) => s.id === step.id) + 1,
    stepOf: siblings.length,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --require ./lib/stub-server-only.cjs --import tsx --test lib/tourSteps.test.ts`
Expected: PASS, 10 tests

- [ ] **Step 5: Full suite, typecheck, commit**

```bash
npm test
npm run typecheck
git add lib/tour/steps.ts lib/tourSteps.test.ts
git commit -m "Add the demo tour's script as testable data

Copy and step order are what drift; keeping them as pure data in lib/
means the test runner can hold them still. Nothing here is demo-specific
— the gate lives at the provider, so lifting it later is one boolean.

The takeover step deliberately declares the listing route, not \"/\":
clicking Home while holding a claim redirects straight back, and a step
expecting \"/\" would desync the tour."
```

---

### Task 2: Route matching

**Files:**
- Create: `lib/tour/route.ts`
- Test: `lib/tourRoute.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `matchesRoute(pattern: string, pathname: string): boolean`.

- [ ] **Step 1: Write the failing test**

Create `lib/tourRoute.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { matchesRoute } from "./tour/route";

test("exact paths match", () => {
  assert.equal(matchesRoute("/", "/"), true);
  assert.equal(matchesRoute("/map", "/map"), true);
  assert.equal(matchesRoute("/impact", "/impact"), true);
});

test("different paths do not match", () => {
  assert.equal(matchesRoute("/", "/map"), false);
  assert.equal(matchesRoute("/map", "/"), false);
});

test(":id matches exactly one segment", () => {
  assert.equal(matchesRoute("/listings/:id", "/listings/abc123"), true);
  assert.equal(matchesRoute("/listings/:id", "/listings"), false);
  assert.equal(matchesRoute("/listings/:id", "/listings/abc/extra"), false);
});

test("a trailing slash on the pathname is tolerated", () => {
  assert.equal(matchesRoute("/map", "/map/"), true);
  assert.equal(matchesRoute("/listings/:id", "/listings/abc/"), true);
});

test("root does not swallow other routes", () => {
  assert.equal(matchesRoute("/", "/listings/abc"), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --require ./lib/stub-server-only.cjs --import tsx --test lib/tourRoute.test.ts`
Expected: FAIL — `Cannot find module './tour/route'`

- [ ] **Step 3: Write the implementation**

Create `lib/tour/route.ts`:

```ts
// Does a tour step's route pattern describe the page we're on?
//
// Deliberately tiny: the only wildcard is ":id", matching exactly one segment,
// which is all the tour's routes need. Kept separate from steps.ts so it can be
// tested against pathnames without importing the whole script.

export function matchesRoute(pattern: string, pathname: string): boolean {
  const strip = (s: string) => (s.length > 1 && s.endsWith("/") ? s.slice(0, -1) : s);
  const p = strip(pattern).split("/");
  const q = strip(pathname).split("/");
  if (p.length !== q.length) return false;
  return p.every((seg, i) => (seg.startsWith(":") ? q[i].length > 0 : seg === q[i]));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --require ./lib/stub-server-only.cjs --import tsx --test lib/tourRoute.test.ts`
Expected: PASS, 5 tests

- [ ] **Step 5: Commit**

```bash
npm run typecheck
git add lib/tour/route.ts lib/tourRoute.test.ts
git commit -m "Add route matching for tour steps

One wildcard, :id, matching exactly one segment — all the tour needs.
Separate from steps.ts so pathname matching is testable on its own."
```

---

### Task 3: Anchors on real components

**Files:**
- Modify: `app/(feed)/page.tsx:78` (heading), and the claimable/scheduled sections
- Modify: `components/ListingCard.tsx:134` (urgency chip), card link, card body
- Modify: `components/ListingDetail.tsx` (summary, safety, buddy, drop-off picker, claim button, hold panel, exits)
- Modify: `components/NavBar.tsx:241` (nav links)
- Modify: `components/RescueMap.tsx` (search field, canvas, trip itinerary)
- Modify: `app/impact/page.tsx:142` (personal harvest), reliability block

**Interfaces:**
- Consumes: the anchor names in `TOUR_STEPS` (Task 1).
- Produces: `data-tour` attributes matching every `anchor` value.

Anchors are a contract with `lib/tour/steps.ts`. Every value below appears in
exactly one step. Add the attribute to the outermost element that visually *is*
the thing being pointed at — the spotlight traces its bounding box.

| `data-tour` | File | Element |
| --- | --- | --- |
| `feed-heading` | `app/(feed)/page.tsx` | the `<h1>` "Available pickups" plus its sub-line wrapper |
| `card-urgency` | `components/ListingCard.tsx` | the urgency chip span (around line 134) |
| `card-body` | `components/ListingCard.tsx` | the card's text column |
| `card-open` | `components/ListingCard.tsx` | the card's root `<Link>` |
| `feed-claimable` | `app/(feed)/page.tsx` | the "Available to claim" section heading |
| `feed-scheduled` | `app/(feed)/page.tsx` | the scheduled-pickups section |
| `listing-summary` | `components/ListingDetail.tsx` | the title + photo + window block |
| `safety-checklist` | `components/ListingDetail.tsx` | the `<SafetyChecklist>` wrapper |
| `buddy-invite` | `components/ListingDetail.tsx` | the `<BuddyInvitePicker>` wrapper |
| `dropoff-picker` | `components/ListingDetail.tsx` | the drop-off choice block |
| `claim-button` | `components/ListingDetail.tsx:899` | the "Claim pickup" button |
| `claim-hold` | `components/ListingDetail.tsx` | the `<ClaimHoldPanel>` wrapper |
| `rescue-exits` | `components/ListingDetail.tsx` | the release / take-it-home control group |
| `nav-feed` | `components/NavBar.tsx` | the nav link whose `href` is `/` |
| `nav-map` | `components/NavBar.tsx` | the nav link whose `href` is `/map` |
| `nav-impact` | `components/NavBar.tsx` | the nav link whose `href` is `/impact` |
| `map-search` | `components/RescueMap.tsx` | the "Your location" `<LocationSearchField>` wrapper |
| `map-canvas` | `components/RescueMap.tsx` | the map container div (`mm-map-shell`) |
| `map-trip` | `components/RescueMap.tsx` | the `<TripItinerary>` wrapper |
| `personal-harvest` | `app/impact/page.tsx:142` | the `<PersonalHarvest>` wrapper |
| `reliability` | `app/impact/page.tsx` | the reliability meter block |

- [ ] **Step 1: Add a guard test that every anchor is spelled once**

Append to `lib/tourSteps.test.ts`:

```ts
test("anchor names are lowercase kebab-case", () => {
  for (const s of TOUR_STEPS) {
    assert.match(s.anchor, /^[a-z][a-z0-9-]*$/, `${s.id} anchor "${s.anchor}"`);
  }
});
```

- [ ] **Step 2: Run it**

Run: `node --require ./lib/stub-server-only.cjs --import tsx --test lib/tourSteps.test.ts`
Expected: PASS, 11 tests

- [ ] **Step 3: Add the attributes**

For the three `NavBar` links, derive the attribute from the href so the three
stay in step with one edit. In the `items.map` at `components/NavBar.tsx:241`,
add to the `<Link>`:

```tsx
data-tour={
  item.href === "/" ? "nav-feed"
  : item.href === "/map" ? "nav-map"
  : item.href === "/impact" ? "nav-impact"
  : undefined
}
```

For every other row in the table, add the literal attribute, e.g.:

```tsx
<button data-tour="claim-button" ... >Claim pickup</button>
```

Add nothing else. No wrapper divs, no class changes, no logic.

- [ ] **Step 4: Verify every anchor resolves**

```bash
npm run typecheck
for a in $(node --import tsx -e '
import("./lib/tour/steps.ts").then(({TOUR_STEPS}) =>
  console.log(TOUR_STEPS.map(s=>s.anchor).join(" ")));
'); do
  n=$(grep -rl "data-tour=\"$a\"" app components | wc -l | tr -d " ")
  [ "$n" = "1" ] || echo "ANCHOR $a found in $n files (want 1)"
done
echo "anchor check done"
```

Expected: only `anchor check done`. The three nav anchors are set via the
expression above, so grep will report 0 for them — that is expected; confirm by
eye that `NavBar.tsx` carries all three names.

- [ ] **Step 5: Commit**

```bash
npm run lint
git add -A app components
git commit -m "Add data-tour anchors for the demo tour

Attributes only — no logic, no wrappers, no class changes — so the tour
can find real elements without the components knowing it exists. The nav
links derive their anchor from href so the three stay in step."
```

---

### Task 4: The overlay

**Files:**
- Create: `components/tour/TourOverlay.tsx`

**Interfaces:**
- Consumes: `TourStep`, `positionOf` (Task 1).
- Produces: `<TourOverlay step rect position onNext onSkip />` where
  `rect: DOMRect | null` and `onNext`/`onSkip` are `() => void`.

A `null` rect means the anchor was not found — render the docked card.

- [ ] **Step 1: Write the implementation**

Create `components/tour/TourOverlay.tsx`:

```tsx
"use client";

import { cn } from "@/components/cn";
import { positionOf, type TourStep } from "@/lib/tour/steps";

const PAD = 6; // breathing room between the target and the cutout edge

/**
 * The spotlight itself, plus the bubble that explains the step.
 *
 * Two visual registers, because the tour has two kinds of step and a viewer
 * needs to know which one they're in: a step that waits for a real click puts a
 * sage ring on the target and says so, with no Next to press. A step that just
 * explains leads with Next.
 *
 * A null rect means the anchor isn't on screen — an empty feed, a listing that
 * expired mid-tour, an unexpected redirect. Rather than positioning a bubble
 * over nothing, the same copy renders in a docked card. Every failure mode
 * collapses into this one path.
 */
export function TourOverlay({
  step,
  rect,
  onNext,
  onSkip,
}: {
  step: TourStep;
  rect: DOMRect | null;
  onNext: () => void;
  onSkip: () => void;
}) {
  const pos = positionOf(step);
  const counter = `Chapter ${pos.chapter} of ${pos.chapterOf} · Step ${pos.step} of ${pos.stepOf}`;
  const waiting = step.advance === "click";

  const Bubble = (
    <>
      <p className="font-mono text-[11px] text-rescued-200">{counter}</p>
      <p className="mt-1 text-[14px] leading-relaxed text-neutral-50">{step.body}</p>
      <div className="mt-3 flex items-center gap-3">
        {waiting ? (
          <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-rescued-200">
            <span
              aria-hidden
              className="h-1.5 w-1.5 rounded-full bg-rescued-400 motion-safe:animate-pulse"
            />
            Waiting for your click
          </span>
        ) : (
          <button
            type="button"
            onClick={onNext}
            className="rounded-full bg-rescued-600 px-3.5 py-1.5 text-[12px] font-semibold text-neutral-50 transition-colors hover:bg-rescued-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900"
          >
            Next
          </button>
        )}
        <span className="flex-1" />
        <button
          type="button"
          onClick={onSkip}
          className="rounded-sm font-mono text-[11px] text-rescued-200 transition-colors hover:text-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400"
        >
          Skip tour
        </button>
      </div>
    </>
  );

  // No anchor on screen — dock the same words to the bottom of the viewport.
  if (!rect) {
    return (
      <div className="pointer-events-none fixed inset-0 z-modal">
        <div className="pointer-events-auto absolute inset-x-3 bottom-3 mx-auto max-w-md rounded-2xl bg-neutral-900 px-4 py-3 shadow-lift animate-fade-up sm:inset-x-auto sm:right-4 sm:w-[22rem]">
          {Bubble}
        </div>
      </div>
    );
  }

  const top = rect.top - PAD;
  const left = rect.left - PAD;
  const width = rect.width + PAD * 2;
  const height = rect.height + PAD * 2;
  // Below the target when there's room, otherwise above it.
  const below = top + height + 190 < window.innerHeight;

  return (
    <div className="pointer-events-none fixed inset-0 z-modal">
      {/* The cutout: a transparent box whose enormous spread shadow dims
          everything around it. 35% — the demo exists to show the app, and a
          heavier scrim fights that, especially on a projector. */}
      <div
        className={cn(
          "absolute rounded-2xl shadow-[0_0_0_9999px_rgba(33,29,25,0.35)] transition-all duration-300",
          waiting && "ring-2 ring-rescued-400"
        )}
        style={{ top, left, width, height }}
      />
      <div
        className="pointer-events-auto absolute w-[min(92vw,20rem)] rounded-2xl bg-neutral-900 px-4 py-3 shadow-lift animate-fade-up"
        style={{
          left: Math.min(Math.max(8, left), window.innerWidth - 332),
          ...(below ? { top: top + height + 12 } : { top: Math.max(8, top - 176) }),
        }}
      >
        {Bubble}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

```bash
npm run typecheck
npm run lint 2>&1 | grep -c "components/tour/TourOverlay"
```

Expected: typecheck silent; the grep prints `0`.

- [ ] **Step 3: Commit**

```bash
git add components/tour/TourOverlay.tsx
git commit -m "Add the tour's spotlight overlay

Two visual registers so a viewer knows which kind of step they're in: a
click step rings the target in sage and says it's waiting, with no Next
to press; an explain step leads with Next.

A null rect means the anchor isn't on screen, so the same words dock to a
card instead of floating over nothing — every failure mode collapses into
that one path."
```

---

### Task 5: The provider

**Files:**
- Create: `components/tour/TourProvider.tsx`
- Modify: `components/Header.tsx:87` (mount it beside `WelcomeIntro`)

**Interfaces:**
- Consumes: `TOUR_STEPS`, `TourStep` (Task 1); `matchesRoute` (Task 2); `TourOverlay` (Task 4).
- Produces: `<TourProvider enabled={boolean} />`, and the `mm:open-tour` window event that starts it.

- [ ] **Step 1: Write the implementation**

Create `components/tour/TourProvider.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { TOUR_STEPS } from "@/lib/tour/steps";
import { matchesRoute } from "@/lib/tour/route";
import { TourOverlay } from "./TourOverlay";

const KEY = "mm.tour";
const FIND_TIMEOUT_MS = 600;

/**
 * Drives the demo tour: holds the step index, finds the current step's anchor,
 * and renders the overlay at it.
 *
 * Mirrors WelcomeIntro: mounted globally in the Header, opened by a window
 * event (`mm:open-tour`) so any button anywhere can start it, and portalled so
 * no parent's stacking context can trap it.
 *
 * The index persists, so a step that navigates survives the route change. The
 * provider renders nothing while the pathname disagrees with the step's route —
 * that is what lets a real click carry the viewer to the next step naturally.
 */
export function TourProvider({ enabled }: { enabled: boolean }) {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [i, setI] = useState<number | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => setMounted(true), []);

  // Resume an in-progress tour on mount.
  useEffect(() => {
    if (!enabled) return;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw !== null) {
        const n = Number(raw);
        if (Number.isInteger(n) && n >= 0 && n < TOUR_STEPS.length) setI(n);
      }
    } catch {
      /* private mode — just don't resume */
    }
  }, [enabled]);

  useEffect(() => {
    const open = () => setI(0);
    window.addEventListener("mm:open-tour", open);
    return () => window.removeEventListener("mm:open-tour", open);
  }, []);

  useEffect(() => {
    try {
      if (i === null) localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, String(i));
    } catch {
      /* ignore */
    }
  }, [i]);

  const step = i === null ? null : TOUR_STEPS[i];
  const onRoute = step ? matchesRoute(step.route, pathname) : false;

  const advance = useCallback(() => {
    setI((n) => (n === null ? null : n + 1 >= TOUR_STEPS.length ? null : n + 1));
  }, []);

  const skip = useCallback(() => setI(null), []);

  // Find and measure the anchor. Retries briefly, because the element may still
  // be streaming in after a navigation; giving up hands the overlay a null rect,
  // which renders the docked card rather than nothing.
  //
  // Measure only on find, then on scroll and resize — NOT every frame. A rAF
  // loop that calls setRect continuously allocates a fresh DOMRect each frame
  // and re-renders the overlay forever, which is a real performance sink for a
  // component that sits on top of the whole app.
  useEffect(() => {
    if (!step || !onRoute) {
      setRect(null);
      return;
    }
    let findRaf = 0;
    let tickRaf = 0;
    let stop = false;
    let el: HTMLElement | null = null;
    const started = Date.now();

    const measure = () => {
      if (!stop && el) setRect(el.getBoundingClientRect());
    };

    // rAF-throttled: many scroll events collapse into one measurement.
    const onMove = () => {
      if (tickRaf) return;
      tickRaf = requestAnimationFrame(() => {
        tickRaf = 0;
        measure();
      });
    };

    const attempt = () => {
      if (stop) return;
      el = document.querySelector<HTMLElement>(`[data-tour="${step.anchor}"]`);
      if (el) {
        measure();
        window.addEventListener("scroll", onMove, true);
        window.addEventListener("resize", onMove);
        return;
      }
      if (Date.now() - started < FIND_TIMEOUT_MS) {
        findRaf = requestAnimationFrame(attempt);
      } else {
        setRect(null); // anchor never appeared — the overlay docks its card
      }
    };
    attempt();

    return () => {
      stop = true;
      cancelAnimationFrame(findRaf);
      cancelAnimationFrame(tickRaf);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [step, onRoute, pathname]);

  // A click step advances when the viewer clicks the real element. Capture
  // phase, so it still fires when the target's own handler navigates away.
  useEffect(() => {
    if (!step || !onRoute || step.advance !== "click") return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest(`[data-tour="${step.anchor}"]`)) advance();
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [step, onRoute, advance]);

  useEffect(() => {
    if (i === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") skip();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [i, skip]);

  if (!enabled || !mounted || !step || !onRoute) return null;

  return createPortal(
    <TourOverlay step={step} rect={rect} onNext={advance} onSkip={skip} />,
    document.body
  );
}
```

- [ ] **Step 2: Mount it**

In `components/Header.tsx`, import it and render beside `WelcomeIntro` (around
line 87), passing the demo gate the Header already has access to:

```tsx
{user && (
  <>
    <WelcomeIntro role={user.role} name={name} createdAt={createdAt} />
    <TourProvider enabled={isDemoWorld && user.role === "volunteer"} />
  </>
)}
```

If `Header` does not already receive a demo flag, thread one in from its server
caller using `isDemo()` from `lib/mode.ts` — the same helper the "Demo data"
badge already uses at `components/Header.tsx:77`.

- [ ] **Step 3: Verify**

```bash
npm run typecheck
npm test
npm run lint 2>&1 | grep -c "components/tour/"
```

Expected: typecheck silent, 285 tests passing, grep prints `0`.

- [ ] **Step 4: Commit**

```bash
git add components/tour/TourProvider.tsx components/Header.tsx
git commit -m "Add the tour provider

Mirrors WelcomeIntro: mounted globally in the Header, started by a window
event so any button can open it, portalled so no stacking context traps
it. Rendering nothing while the pathname disagrees with the step's route
is what lets a real click carry the viewer to the next step."
```

---

### Task 6: Entry points

**Files:**
- Create: `components/tour/StartTourButton.tsx`
- Modify: `components/WelcomeIntro.tsx` (final CTA for demo volunteers)
- Modify: `app/settings/page.tsx` (restart control, beside `ReplayWalkthroughButton`)

**Interfaces:**
- Consumes: the `mm:open-tour` event (Task 5).
- Produces: `<StartTourButton />`.

- [ ] **Step 1: Write the button**

Create `components/tour/StartTourButton.tsx`:

```tsx
"use client";

import { Button } from "@/components/Button";

// Starts the demo tour. TourProvider is mounted globally in the Header and
// listens for `mm:open-tour`, so dispatching from anywhere opens it — the same
// arrangement ReplayWalkthroughButton uses for the welcome carousel.
export function StartTourButton() {
  return (
    <Button
      variant="secondary"
      onClick={() => window.dispatchEvent(new Event("mm:open-tour"))}
    >
      Take the tour
    </Button>
  );
}
```

- [ ] **Step 2: Add the Settings control**

In `app/settings/page.tsx`, render `<StartTourButton />` next to the existing
`<ReplayWalkthroughButton />`.

- [ ] **Step 3: Wire the WelcomeIntro CTA**

`WelcomeIntro`'s `finish()` currently does `router.push(deck.home)`. For a demo
volunteer the last slide should start the tour instead of only navigating. Add
an optional prop and use it in `finish`:

```tsx
export function WelcomeIntro({
  role,
  name,
  createdAt,
  offerTour = false,
}: {
  role: Role;
  name: string;
  createdAt: number;
  offerTour?: boolean;
}) {
```

and in `finish`:

```tsx
  const finish = useCallback(() => {
    markSeen();
    setOpen(false);
    router.push(deck.home);
    // Demo volunteers roll straight from the intro into the tour.
    if (offerTour) window.dispatchEvent(new Event("mm:open-tour"));
  }, [markSeen, router, deck.home, offerTour]);
```

Pass `offerTour={isDemoWorld && user.role === "volunteer"}` from `Header.tsx`,
and change the final-slide button label to `Start the tour` when `offerTour` is
true, leaving `deck.cta` for everyone else.

- [ ] **Step 4: Verify**

```bash
npm run typecheck && npm test
```

Expected: typecheck silent, 285 tests passing.

- [ ] **Step 5: Commit**

```bash
git add components/tour/StartTourButton.tsx components/WelcomeIntro.tsx app/settings/page.tsx components/Header.tsx
git commit -m "Start the tour from the welcome deck and Settings

Demo volunteers roll straight from the intro they already see into the
tour; everyone else keeps the existing CTA. Settings gains a restart so
the tour can be re-run between demos without clearing localStorage."
```

---

### Task 7: Styleguide coverage and browser verification

**Files:**
- Create: `components/tour/TourOverlayDemo.tsx`
- Modify: `app/styleguide/page.tsx`

**Interfaces:**
- Consumes: `TourOverlay` (Task 4), `TOUR_STEPS` (Task 1).
- Produces: `<TourOverlayDemo />` — self-contained, no props.

The styleguide page is a server component and cannot pass callbacks to a client
one, so this wrapper holds the demo state.

- [ ] **Step 1: Write the demo harness**

Create `components/tour/TourOverlayDemo.tsx`:

```tsx
"use client";

import { useState } from "react";
import { TOUR_STEPS } from "@/lib/tour/steps";
import { TourOverlay } from "./TourOverlay";

const CLICK_STEP = TOUR_STEPS.find((s) => s.advance === "click")!;
const NEXT_STEP = TOUR_STEPS.find((s) => s.advance === "next")!;

// A fake rect so the spotlight has something to trace without a live tour.
const RECT = {
  top: 120, left: 40, width: 320, height: 96,
  right: 360, bottom: 216, x: 40, y: 120,
  toJSON: () => ({}),
} as DOMRect;

/** Styleguide harness: the overlay's three states, without running a tour. */
export function TourOverlayDemo() {
  const [state, setState] = useState<"click" | "next" | "fallback">("click");
  const step = state === "click" ? CLICK_STEP : NEXT_STEP;

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        {(["click", "next", "fallback"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setState(s)}
            aria-pressed={state === s}
            className={
              "rounded-full border px-3 py-1.5 font-mono text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400 " +
              (state === s
                ? "border-neutral-900/10 bg-card text-neutral-900 shadow-card"
                : "border-neutral-900/20 text-neutral-700 hover:text-neutral-900")
            }
          >
            {s === "click" ? "Waits for a click" : s === "next" ? "Explains" : "Anchor missing"}
          </button>
        ))}
      </div>
      <p className="font-mono text-[11px] text-neutral-700">
        Renders full-screen — scroll up if the bubble is off view.
      </p>
      <TourOverlay
        step={step}
        rect={state === "fallback" ? null : RECT}
        onNext={() => {}}
        onSkip={() => {}}
      />
    </div>
  );
}
```

- [ ] **Step 2: Add the styleguide section**

Import it in `app/styleguide/page.tsx` and add a section after the last existing
one:

```tsx
<Section
  title="Demo tour"
  hint="The spotlight overlay's three states. A step that waits for a real click rings its target in sage and says so; a step that only explains leads with Next; and when the anchor isn't on screen the same words dock to a card so the tour can't strand."
>
  <TourOverlayDemo />
</Section>
```

- [ ] **Step 3: Verify in the browser**

```bash
npm run typecheck && npm run lint && npm test
```

Then start the preview and check:

1. `/styleguide` → "Demo tour" — all three states render; the click state shows the sage ring and "Waiting for your click"; the fallback docks to the bottom.
2. Sign in as **Volunteer** (`you@campus.edu`, password `MealMove1`) — lands on the feed.
3. Settings → "Take the tour" — the spotlight lands on the feed heading.
4. Walk chapters 1–2: Next advances; clicking a card advances *and* navigates.
5. Confirm no console errors and no hydration warning.
6. Resize to mobile width and confirm the bubble stays on screen.

Chapter 4's map imagery will not render — the sandbox cannot reach
`api.mapbox.com`. Verify the map's anchors exist; do not claim the map itself was
verified.

- [ ] **Step 4: Commit**

```bash
git add components/tour/TourOverlayDemo.tsx app/styleguide/page.tsx
git commit -m "Add the tour overlay to the styleguide

Its three states are otherwise only reachable by running a whole tour,
which makes them easy to break unnoticed."
```

---

## Verification before opening a PR

```bash
npm test
npm run typecheck
npm run lint
```

Then reset the demo world so the tour starts from a clean state, and confirm
both personas still behave:

```bash
npm run db:demo:reset
```

**State honestly in the PR body what was not verified:** the rescue map's tiles
and its Chapter 4 steps end-to-end (no `api.mapbox.com` access in this sandbox),
and the full 21-step run against a live demo audience.
