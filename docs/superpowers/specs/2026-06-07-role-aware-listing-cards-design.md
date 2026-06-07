# Role-aware listing cards — design

**Date:** 2026-06-07
**Status:** Approved, ready for planning

## Problem

The listing card (the redesigned horizontal card from the listings-redesign work)
is built for **volunteers**: its two promoted "decision facts" are
*servings · distance away*, its footer is a **Claim pickup** button, and it shows
both the source restaurant and a `→ {dropOff}` route line. Other account types see
this same volunteer-shaped card:

- A **restaurant** viewing its own posted listings sees a "distance away" that is
  meaningless (it's their own food) and a redundant source line (the source *is*
  them).
- A **drop-off admin** viewing inbound/arrived food sees a "distance away" that is
  the volunteer's, not theirs, and a `→ {dropOff}` line that points at
  themselves — while the fact they actually care about (which restaurant is
  sending it) is buried.

The card should adapt what it emphasizes to who is looking, without forking into
separate components.

## Scope

In scope:

- An `audience` prop on `ListingCard` (`"volunteer" | "restaurant" | "dropoff"`,
  default `"volunteer"`) that adjusts three regions: the Tier-2 decision facts,
  the source/route lines, and the footer.
- Passing the right `audience` from the restaurant console and the two drop-off
  surfaces.
- Showcasing the restaurant and drop-off variants on `/styleguide`.

Out of scope (explicitly deferred):

- **Mutating actions** (restaurant edit/cancel/repost, admin reassign). No
  listing-management server actions exist today; building them is a separate
  feature. This change is presentation only.
- An **org-admin** card variant. Org admins have no listing surface distinct from
  the feed, so they use the default volunteer view there. No `"admin"` audience is
  added (it would have nowhere to render).
- Any change to the universal card regions (urgency strip, color-blind-safe
  countdown chip, photo panel, notes callout) — these stay identical for everyone.

## Behavior

`audience` selects per-region presentation. Universal regions are unchanged.

| Region | `volunteer` (unchanged) | `restaurant` | `dropoff` |
|---|---|---|---|
| Tier-2 facts | `servings` + `{distance} away` | `servings` only (distance omitted) | `servings` only (distance omitted) |
| Source line | `from {source}` shown | hidden (the source is the viewer) | shown, emphasized as `from {source}` |
| Route line | `→ {dropOff}` shown | `→ {dropOff}` shown | hidden (the drop-off is the viewer) |
| Footer | claim button when `open` + `onClaim`, else status (+buddy) + `by {claimant}` | status (+buddy) + `by {claimant}` (no claim button) | status (+buddy) + `by {claimant}` (no claim button) |

Notes:

- The footer already hides the claim button for non-volunteers because `onClaim`
  is only passed on the feed; the `audience` prop does not need to suppress it, but
  the restaurant/drop-off call sites never pass `onClaim`.
- `distance` is `"—"` for non-volunteer data anyway (it is not wired server-side),
  so omitting it is strictly an improvement, not a data loss.
- The `dropoff` "source" line reuses the existing source value; it is only
  re-framed/emphasized, not newly fetched.

## Architecture

Single component, prop-driven — no new components, no forks.

- `components/ListingCard.tsx`
  - Add `type ListingCardAudience = "volunteer" | "restaurant" | "dropoff";`
  - Add `audience?: ListingCardAudience` to `ListingCardProps` (default
    `"volunteer"`).
  - Derive booleans once: `const showDistance = audience === "volunteer";`
    `const showSource = audience !== "restaurant";`
    `const showRoute = audience !== "dropoff";`
  - Gate the Tier-2 distance span on `showDistance`, the source span on
    `showSource`, and the `→ {dropOff}` line on `showRoute`. For `dropoff`, render
    the source line with the existing source styling (it becomes the prominent
    context line since the route line is hidden).
  - Footer logic is unchanged.

### Call sites

- `components/RestaurantConsole.tsx` — both `ListingCard` usages get
  `audience="restaurant"`.
- `app/dropoff/page.tsx` — the Incoming and Arrived `ListingCard`s get
  `audience="dropoff"`.
- `app/dropoffs/[id]/page.tsx` — both `ListingCard` usages get `audience="dropoff"`.
- `components/ListingFeed.tsx` and `app/pickups/page.tsx` — unchanged (default
  volunteer audience).
- `app/styleguide/page.tsx` — add a small section rendering the same listing with
  `audience="restaurant"` and `audience="dropoff"` next to the default, as a living
  reference.

## Testing

`ListingCard` is a pure presentational component and the repo has no
component-test harness (the test glob is `lib/**/*.test.ts`), so there are no unit
tests for it. Verification:

- `npx tsc --noEmit` — clean (the new prop is optional, so existing call sites keep
  compiling).
- `/styleguide` renders the three audience variants for visual confirmation.
- Authenticated per-role smoke against the running app: a **restaurant**
  (`saxbys@campus.edu`) sees no distance and no redundant source on the console; a
  **drop-off admin** (`dropoff@campus.edu`) sees `from {restaurant}` and no
  `→ dropOff` self-reference; a **volunteer** sees the unchanged card.

## Design-system notes

- No new tokens, colors, or fonts. The change only shows/hides existing elements
  per audience and re-uses the existing source-line styling for the drop-off
  emphasis.
- All universal a11y properties (color-blind-safe countdown chip pairing icon +
  minutes, urgency ring, focus rings) are untouched.
- Sentence case and mono-for-metadata conventions are preserved; `from {source}`
  uses the existing source styling.

## Base / branch

Branch `feature/role-aware-listing-cards`, cut from `feature/listings-redesign`
(PR #4) so it extends the redesigned card and merges together rather than
colliding with it.

## Follow-up (not this spec)

Real listing-management actions — restaurant **cancel/edit/repost**, and any
admin reassignment — would be a separate feature: new server actions + mutation
flows, surfaced on these same role-aware cards once they exist.
