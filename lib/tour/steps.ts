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
