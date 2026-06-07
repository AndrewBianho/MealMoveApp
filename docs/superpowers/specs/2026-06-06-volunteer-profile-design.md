# Volunteer personal profile — design

**Date:** 2026-06-06
**Status:** Approved, ready for planning

## Problem

A volunteer has no single place to see what they've personally accomplished.
Their completed deliveries are buried in the "past" section of `/pickups`, the
`/impact` page only shows org-wide totals, and the reliability strip on
`/pickups` is **hardcoded to 91%** (`app/pickups/page.tsx:48`) rather than
computed from real data.

Two of Meal Move's goals motivate fixing this: reliability is a primary lever
against flaking (volunteers should *feel* their track record, non-punitively),
and a warm, encouraging surface that reflects "look what you saved" reinforces
the kind, low-stakes brand personality that keeps first-timers coming back.

This feature adds a **personal profile**: a dedicated page where a volunteer
sees their identity, lifetime impact, and completion rate — all computed live
from existing data.

## Scope

In scope:

- A new `/profile` page: identity header + four lifetime-impact metric cards +
  a completion-rate meter.
- A new `getVolunteerImpact(userId)` function in `lib/stats.ts` that computes one
  volunteer's lifetime numbers.
- Making the nav avatar link to `/profile` (desktop), plus a "Profile" item in
  the mobile menu.

Out of scope (deferred, can be added later):

- A recent-deliveries list / activity timeline on the profile.
- Insights & trends (most-helped restaurant, streaks, this-month vs lifetime).
- Editing profile details (name, phone, photo).
- Admins viewing *other* users' profiles. The page shows the **signed-in user's
  own** data only.
- Rewiring the `/pickups` reliability strip. It stays brief and unchanged in
  this feature (it is acknowledged tech debt, but not this scope).

## Behavior

Tapping the avatar in the nav opens `/profile`. The page shows:

1. **Identity header** — `Avatar`, the user's name (display serif), and a mono
   line `{role} · joined {Mon YYYY}` (from `User.createdAt`). Sentence case;
   role is the one allowed lowercase-with-spaces label (e.g. `volunteer`).
2. **Lifetime impact** — four `MetricCard`s:
   - **meals rescued** — Σ `servings` of the volunteer's delivered listings.
   - **lbs saved** — Σ `weightLbs ?? servings × 0.8`, rounded.
   - **pickups completed** — count of the volunteer's delivered listings.
   - **restaurants helped** — distinct restaurants among them.
3. **Completion rate** — a `ReliabilityMeter` ("on-time completion") showing the
   real percentage from the event log, with a mono caption noting it's lifetime.

Both seats are credited: because a `delivered` `ListingEvent` is written **per
seat** (primary *and* buddy) by `markDeliveredWithPhotoFor` (`lib/photos.ts`),
a buddy who helped complete a delivery gets the same impact and completion
credit as the primary volunteer.

### Empty / new-volunteer state

When the volunteer has completed no deliveries, all impact values render as `0`
and the completion meter shows `0%`. Below the cards, a warm, non-punitive line
invites the first rescue — e.g. *"Your first rescue is waiting — claim a pickup
and your impact shows up here."* — linking to the feed (`/`). No empty grids or
error tone; calm and encouraging per the brand voice.

### Roles

The page is available to any authenticated user and always reflects **their
own** delivered events. A non-volunteer (restaurant, drop-off admin) simply sees
zeros and the empty state — acceptable and avoids role-gating complexity. An
`org_admin` who also does pickups sees their real numbers.

## Architecture

### Data: `getVolunteerImpact(userId)` in `lib/stats.ts`

Returns:

```ts
interface VolunteerImpact {
  mealsRescued: number;
  lbsSaved: number;
  pickupsCompleted: number;
  restaurantsHelped: number;
  completionRate: number; // 0–100, integer
  attempts: number;       // delivered + released + failed, for context
}
```

Computation (all live from the DB, no hardcoded numbers):

- **Impact** — find this user's `delivered` events
  (`listingEvent.findMany({ where: { actorId: userId, type: "delivered" } })`),
  collect their `listingId`s (unique per delivery), load those listings'
  `servings`, `weightLbs`, `restaurantId`, then aggregate meals / lbs / count /
  distinct restaurants. Reuses the existing `LBS_PER_SERVING = 0.8` constant and
  the same lbs fallback as `getImpactStats`.
- **Completion rate** — tally this user's `delivered` vs `released`/`failed`
  events (the same event types and meaning used by the existing
  `getVolunteerReliability`), `rate = round(delivered / (delivered+flaked) * 100)`,
  `0` when there are no attempts. This is the single source of truth shared with
  the existing reliability logic — same definition, scoped to one user.

The function is structured to accept the same kind of `Db` slice the other
`lib/` modules use, so it can be unit-tested with an injected fake db.

### Page: `app/profile/page.tsx`

Server component, `export const dynamic = "force-dynamic"` (matches `/pickups`).
`auth()`; redirect to `/login` if no session. Calls `getVolunteerImpact` with
the session user id and renders the header, `MetricCard`s, `ReliabilityMeter`,
and the conditional empty-state line. Layout mirrors existing pages
(`mx-auto max-w-5xl px-6 py-8`).

### Nav: `components/NavBar.tsx`

Wrap the desktop `Avatar` in a `next/link` to `/profile` with the nav-pill
hover/focus treatment (hover lift + `shadow-card`, rescued focus ring). Add a
`Profile` link to the mobile dropdown. `/pickups` and all other nav items are
untouched.

## Testing

New `lib/stats.test.ts` unit-tests `getVolunteerImpact` against an injected fake
db (same pattern as `buddies.test.ts` / `checkins.test.ts`):

- Buddy-seat credit: a delivery the user did as **buddy** counts toward impact
  and completion.
- Weight fallback: a listing with `weightLbs` uses it; one without falls back to
  `servings × 0.8`.
- Distinct restaurants: two deliveries from the same restaurant count once.
- Completion rate: mix of delivered / released / failed yields the right
  percentage; the no-attempts case returns `0` (no divide-by-zero).

## Design-system notes

- `MetricCard` and `ReliabilityMeter` are reused unchanged — both already follow
  the tokens (display-serif sage values, mono labels; non-punitive bar with
  sage/honey/tomato thresholds).
- Sentence case throughout; the only uppercase is the existing mono labels.
- Impact stats are neutral counts (no status hue). The completion meter carries
  its percentage as text alongside the bar, so it stays color-blind-safe per the
  reliability spec.
- Tailwind only; no new tokens, colors, or fonts introduced.
