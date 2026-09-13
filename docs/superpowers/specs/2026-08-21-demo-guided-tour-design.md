# Demo guided tour: a spotlight walkthrough of the volunteer journey

**Date:** 2026-08-21
**Status:** built, then removed on 2026-09-03 (`3a908ba`). Kept as a record of
the design and of what driving it taught us; nothing here describes shipped code.
**Branch:** `demo-guided-personas`

## Problem

The demo shows one screen at a time and relies on whoever is driving to narrate.
A viewer left alone with it does not know what to click, and the product
decisions worth showing — destination-first claiming, a hold that expires without
punishing anyone, reliability as a bar rather than a grade — are invisible unless
someone points at them.

Two surfaces already exist and neither solves this:

- **`WelcomeIntro`** — a per-role slide deck in a modal, once per 7 days
  (`mm.introSeen`). Art and copy; it never points at real UI.
- **`lib/onboarding.ts`** — a first-rescue tracker driven by real backend
  milestones, deliberately *not* a tutorial flag. It self-retires.

This adds a third thing: an interactive tour that points at real elements and
waits for real clicks.

## Goals

- Walk a viewer through the volunteer journey end to end, telling them what to
  click, with an on-screen indicator on the target.
- Cover the feature surface broadly enough that the demo sells the product.
- Never strand: no step can leave the viewer stuck with no way forward.

## Non-goals

- Other roles. Restaurant, drop-off, and org admin get no tour. The step format
  is per-role from day one so they can be added without a rewrite.
- The pickup photo and delivery. The photo is a real upload with no demo
  shortcut, so a "snap the photo" step needs a file on hand and is the most
  likely thing to stall live.
- A tour library. `style-src` still allows `'unsafe-inline'` so a library would
  work, but CLAUDE.md permits exactly one styling exception (Mapbox raw DOM), and
  a library's stylesheet would become a second one.
- Shipping to real users *now*. Demo-gated, designed so the gate lifts later.

## Decisions

| Question | Decision |
| --- | --- |
| Audience | Demo accounts only now; step data carries nothing demo-specific, so the gate can lift later |
| Advancing | Real click on the target, with Next/Skip always available as an escape hatch |
| Coverage | Volunteer only, end to end |
| Depth | Browse and claim; stops before the photo |
| Indicator | Spotlight — surround dimmed to 35%, sage ring on clickable targets |
| Fallback | Docked corner card when the anchor is missing |
| Entry | `WelcomeIntro`'s final CTA, plus a restart link in Settings |

---

## 1. Step data — `lib/tour/steps.ts`

Pure data, no React, no browser APIs, so `npm test` reaches it (the test script
globs `lib/*.test.ts` only).

```ts
export type Advance = "click" | "next";

export interface TourStep {
  id: string;
  chapter: 1 | 2 | 3 | 4 | 5;
  /** Pathname pattern this step lives on. ":id" matches one segment. */
  route: string;
  /** Matches a data-tour="…" attribute on a real element. */
  anchor: string;
  body: string;
  advance: Advance;
}

export interface TourChapter {
  n: 1 | 2 | 3 | 4 | 5;
  name: string;
}
```

Copy rules bind here as hard requirements, because tour copy is the most likely
place for them to drift:

- **Sentence case everywhere**, including the mono step counter and micro-labels:
  `Chapter 3 of 5 · Step 2 of 4`, `Skip tour`, `Waiting for your click`. Never Title Case, never
  ALLCAPS, never an all-lowercase word-label.
- Pure data tokens stay as written (`11m 49s`, `0.4 mi`, `42m`).
- Body text is ink (`neutral-800`/`900` on light surfaces); the bubble inverts to
  `neutral-50` on an ink fill. Never `neutral-400/500/600` for text.

## 2. The path — 5 chapters, 21 steps

Each chapter starts independently, so a short demo can run one chapter. The
bubble reads `Chapter 3 of 5 · Step 2 of 4`.

### Chapter 1 — The feed (`/`)
1. Every pickup that needs a driver right now — N claimable today · *next*
2. The urgency chip: sage calm, honey soon, tomato minutes left — the word says
   it too, never just the colour · *next*
3. Card anatomy — servings, distance, restaurant, what the food actually is · *next*
4. The feed splits: claimable up top, everything already spoken for below · *next*
5. Scheduled pickups — food that isn't ready yet, posted ahead · *next*

### Chapter 2 — The listing (`/listings/:id`)
6. Open one to see the whole job · **click**
7. The food, the photo, the window it has to move in · *next*
8. Destination first — pick where it's going before you commit to carrying it · *next*

### Chapter 3 — Claiming it (`/listings/:id`)
9. Claim it — it's yours for fifteen minutes · **click, writes**
10. That countdown is real: miss it and the pickup quietly returns to the feed · *next*
11. Safety checklist — the food-handling rules, right where you'll need them,
    checked off before you carry anything · *next*
12. Bring a buddy — invite someone to ride the second seat · *next*
13. Try going back to the feed — the app hands itself to the rescue · **click**
14. Can't finish? Release it and it goes straight back to the feed — an honest
    exit, not a flake · *next*

### Chapter 4 — Planning the run (`/map`)
15. Open the rescue map · **click**
16. Search a location — your own stops rank above street addresses · *next*
17. Tap a pin to drop it into the trip · **click**
18. The trip fills in: start → pickup → drop-off, with drive time per leg · *next*

### Chapter 5 — Standing and impact (`/impact`)
19. Last stop — what all of this adds up to · **click**
20. Your harvest — what you've moved, counted in meals · *next*
21. Reliability as a bar, never a grade — no red flags on people · *next*

**Step 9 is the only write.** One listing is consumed per full run, which keeps
`npm run db:demo:reset` cheap rather than mandatory.

**Step 14 explains rather than demonstrates.** Clicking Release would undo step
9's claim and strand chapters 3–5.

**Step 13 is the trap.** Clicking Home while holding a claim redirects *back to
the listing* (`app/(feed)/page.tsx` hands the app to the rescue in flight). So
this step's `route` is the listing, not `/`. That is encoded as data, not as a
branch in the provider.

## 3. Anchors

`data-tour="feed-heading"` and similar, added to roughly fifteen existing
components. Attributes only — no logic, no restructuring — so the blast radius on
working code is close to zero.

Anchor ids are a contract between the components and `steps.ts`, and a unit test
asserts every step's anchor is unique and every `click` step has one.

## 4. Provider — `components/tour/TourProvider.tsx`

A client component mounted once in `app/layout.tsx` beside `AnalyticsProvider`,
which already takes server-derived props the same way:

```tsx
<TourProvider enabled={(await isDemo()) && role === "volunteer"} />
```

Responsibilities, and nothing else: hold the current step index, persist it,
resolve the anchor for the current step, and render the overlay.

## 5. Overlay — `components/tour/TourOverlay.tsx`

Portaled to `document.body`.

- **Spotlight**: one absolutely-positioned div matched to the anchor's
  `getBoundingClientRect()`, with `box-shadow: 0 0 0 9999px rgba(33,29,25,0.35)`
  and the anchor's own border radius. 35%, not the heavier 58% first tried — the
  point of the demo is showing the app, and a lighter scrim reads better on a
  projector.
- **Ring**: `click` steps additionally get a sage ring
  (`rescued-400` + a softer outer glow) inside the cutout, so "act here" looks
  different from "read this". Pulse is `motion-safe:` only; `globals.css`
  already disables animation under reduced motion.
- **Bubble**: ink fill, `neutral-50` text, mono step counter, sage Next. Flips
  above/below the anchor depending on room.
- Positions re-measure on scroll and resize (rAF-throttled) and on route change.

## 6. Advancing and continuity

- `advance: "click"` attaches a capture-phase listener to the anchor element.
  The bubble shows `Waiting for your click` and no Next.
- `advance: "next"` advances on the button.
- `Skip tour` and Escape end the tour; Settings can restart it.
- The step index persists to `localStorage` under `mm.tour`.
- The provider compares `usePathname()` to the step's `route` and renders nothing
  while they disagree, so a real click that navigates lands naturally on the next
  step.

## 7. Never stranding

If the anchor is not found within ~600ms of a step becoming current, the same
copy renders in a **docked corner card** with a Next button. Every failure —
missing element, empty feed, a listing that expired mid-tour, an unexpected
redirect — degrades to this one path rather than an invisible or mispositioned
bubble.

## 8. Entry and exit

- `WelcomeIntro`'s final CTA becomes **Start the tour** for demo volunteers, so
  the tour flows out of the intro they already see. Other roles keep the current
  CTA.
- Settings gains a restart link, so the tour can be re-run between demos without
  clearing `localStorage` by hand.
- Skipping sets a flag; the tour does not re-prompt on every navigation.

## 9. Testing

**Unit (`lib/tour/steps.test.ts`)** — chapter numbers contiguous and in order;
anchor ids unique; every `click` step has an anchor; every `route` parseable;
step-within-chapter numbering matches what the bubble will render.

**Browser** — spotlight alignment against a real anchor at desktop and mobile
widths; scroll and resize re-measurement; the fallback card when an anchor is
deliberately removed; the step-13 redirect landing on the right step.

**Styleguide** — a Trip planner-style section rendering the overlay's states
(click step, next step, fallback card) against a mock anchor, so the states are
inspectable without running a tour.

## Risks

- **Step 13** is the most likely to confuse a viewer and the most likely to break
  if the takeover redirect changes. Its copy has to land *before* the click.
- **Anchor rot**: a component refactor can silently drop a `data-tour`. The unit
  test catches a missing step definition but cannot see the JSX; the fallback
  card is what keeps that from stranding a demo.
- **21 steps is long** — roughly 6–8 minutes narrated. The chapter structure is
  the hedge; if it proves too long in practice, cut chapters rather than steps.
