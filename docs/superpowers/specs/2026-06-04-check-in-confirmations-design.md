# Check-up confirmations on an active claim — design

**Date:** 2026-06-04
**Status:** Approved, ready for planning

## Problem

Volunteer flaking on claimed pickups is one of the two core problems Meal Move
exists to solve. Today, claiming a listing stamps a 15-minute hold (`Pickup.holdUntil`),
and a cron sweep (`lib/sweep.ts`, run every 5 min via `vercel.json`) auto-releases
the claim if the volunteer never advances to "in transit" before the hold lapses.
There is no contact with the volunteer during that window and no graceful way for
them to drop a claim they can't fulfill — they either complete it or go silent.

This feature adds **check-up confirmations**: liveness nudges during the hold that
keep the volunteer engaged and give them an easy, non-punitive way to release early.

## Behavior

After a volunteer claims a listing, the listing's detail page shows a persistent
check-up card with a live countdown to the 15-minute auto-release. At the **5-minute**
and **10-minute** marks the card surfaces a prompt — *"Still picking this up?"* — with
two actions:

- **Still on it** — confirms liveness. This does **not** extend the hold; the
  15-minute deadline is fixed. It records the confirmation and suppresses the prompt
  until the next mark.
- **I can't make it** — voluntarily releases the claim immediately, reopening the
  listing for others. Logged distinctly from a silent lapse so it is not punitive.

At the **15-minute** mark, the existing cron auto-cancel fires unchanged (the claim
is released with reason `hold_expired`). Check-ups are reminders, not extensions.

### Marks

| Mark | Elapsed | What happens |
|---|---|---|
| Claim | 0 min | Check-up card appears with countdown (no prompt yet). |
| Nudge 1 | 5 min | Prompt surfaces; push seam fires. |
| Nudge 2 | 10 min | Prompt surfaces again; push seam fires. |
| Auto-cancel | 15 min | Existing sweep releases the claim (`hold_expired`). |

No nudge at 0 or 15 — claim is a deliberate in-app action, and 15 is the cancel.

## Delivery

The check-up reaches the volunteer two ways:

1. **In-app** (built now): the detail-page card with a 1-second ticking countdown,
   surfacing the prompt at the 5- and 10-minute marks while the page is open.
2. **Push notification** (built as a dormant seam): Firebase Cloud Messaging is
   listed in the stack but not installed or configured (no deps, no VAPID /
   service-account keys, no service worker). Rather than block on credentials only
   the project owner can provision, we build the full check-in dispatch path now
   with a single no-op integration point, `sendCheckInPush()`. Everything except the
   live push send is testable today; FCM activates later by implementing that one
   function and adding env keys.

## Architecture

### Schema (`prisma/schema.prisma` — requires a migration)

Add to `model Pickup`:

```prisma
lastCheckInAt DateTime? // last "still on it" confirmation; suppresses re-prompting
nudgesSent    Int       @default(0) // count of 5-min check-up nudges the cron has dispatched (0–2)
```

New `ListingEvent.type` values (the field is a free-form `String`, no enum change):
- `checked_in` — a confirmation tap.
- `withdrawn` — a voluntary early release.

### Server actions (`app/actions.ts`)

- `confirmCheckIn(listingId)`: resolves the session user; verifies a `Pickup`
  exists for this listing owned by that user and the listing is `claimed`; sets
  `pickup.lastCheckInAt = now`; writes a `checked_in` `ListingEvent`. Does **not**
  touch `holdUntil` (liveness-only). Calls `refreshViews(listingId)`.
- `releaseClaim(listingId)`: same ownership + `claimed` guard; in a transaction
  deletes the `Pickup`, sets the listing back to `open`, and writes a `withdrawn`
  `ListingEvent` with `meta: { reason: "volunteer_released" }`. Calls
  `refreshViews(listingId)`.

Both reuse the existing `currentUserId()` and `refreshViews()` helpers.

### Push seam (`lib/notify.ts` + `lib/checkins.ts`)

- `lib/notify.ts` — `export async function sendCheckInPush(pickup, mark)`: a no-op
  stub today (a `console.log` in development). This is the **only** place FCM plugs
  in later; nothing else in the codebase knows about push.
- `lib/checkins.ts` — `export async function dispatchCheckIns()`: queries `claimed`
  pickups (with listing), computes `elapsedMin = floor((now - claimedAt) / 60000)`,
  derives `dueNudges = min(floor(elapsedMin / 5), 2)` (marks at 5 and 10 only), and
  for each mark in `(nudgesSent, dueNudges]` calls `sendCheckInPush(pickup, mark)`
  then updates `pickup.nudgesSent = dueNudges`. Idempotent across repeated cron runs.
  Returns `{ nudged: number }`.

### Cron wiring (`app/api/cron/sweep/route.ts`)

The route calls `dispatchCheckIns()` alongside the existing `runSweep()` and merges
the results into the JSON response. The cron already runs `*/5 * * * *`, which aligns
with the 5-minute check-up cadence (with up to ~5 min of bucketing jitter, acceptable
for nudges). **Run `runSweep()` first, then `dispatchCheckIns()`**, so any claim
whose hold just expired is released before the nudge pass and therefore excluded from
nudging (a claim that has both a due nudge and an expired hold is released, not
nudged, on the same tick).

### Serialization (`lib/types.ts` + `lib/listings.ts`)

Extend the `Listing` interface with optional fields, all derived from `l.pickup`:

```ts
claimedAt?: number;     // epoch ms — when the active claim was made
holdUntil?: number;     // epoch ms — the 15-min auto-release deadline
lastCheckInAt?: number; // epoch ms — last confirmation, if any
mine?: boolean;         // the current viewer is the claiming volunteer
```

`serializeListing(l, viewerId?)` gains an optional `viewerId` and sets
`mine = l.pickup?.volunteerId === viewerId`, plus the epoch-ms timestamps from the
pickup. `getListings(viewerId?)` and `getListing(id, viewerId?)` thread the id
through. The listing detail page (`app/listings/[id]/page.tsx`) passes the session
user id so the client knows whether to show the check-up.

### UI (`components/CheckInPrompt.tsx`, wired into `components/ListingDetail.tsx`)

A new client component rendered inside `ListingDetail` when
`status === "claimed" && listing.mine`:

- A 1-second `setInterval` ticks the current time; computes elapsed from `claimedAt`
  and remaining to `holdUntil`.
- Always shows a countdown line: *"auto-releases in 7:21"* (mono, per the metadata
  font rule).
- At the 5- and 10-minute marks — and only if `lastCheckInAt` is older than that
  mark (so a confirmation suppresses re-prompting) — surfaces the prompt in a honey
  (`urgent`) callout, matching DESIGN.md's "claimed / in-flight = honey" semantics:
  - **Still on it** — primary sage button → `confirmCheckIn(listingId)` via a
    `useTransition`.
  - **I can't make it** — danger (tomato inset) button → `releaseClaim(listingId)`.
- Uses a `Toast` for feedback, consistent with `ListingDetail`'s existing pattern.
- Sentence case, rounded, mono metadata; respects `prefers-reduced-motion`.

### Reliability (non-punitive) — `lib/stats.ts`

`getVolunteerReliability()` tallies only `delivered` (for) vs `released` / `failed`
(against). The new `withdrawn` type is **deliberately not** in that filter, so a
volunteer who proactively frees a listing is never penalized — only a silent
15-minute lapse (`released`, reason `hold_expired`) counts as a flake. No change to
`stats.ts` is required; this is an explicit design decision to record, not code.

## Data flow

```
claim → Pickup{claimedAt, holdUntil=+15m, nudgesSent=0}, listing=claimed
  │
  ├─ detail page (mine) renders CheckInPrompt → countdown ticking
  │
  ├─ cron tick (every 5m): dispatchCheckIns()
  │     elapsed≥5 & nudgesSent<1 → sendCheckInPush(mark1); nudgesSent=1
  │     elapsed≥10 & nudgesSent<2 → sendCheckInPush(mark2); nudgesSent=2
  │
  ├─ volunteer taps "Still on it" → confirmCheckIn → lastCheckInAt=now, event checked_in
  ├─ volunteer taps "I can't make it" → releaseClaim → listing=open, event withdrawn (not a flake)
  └─ no action by 15m → runSweep releases → listing=open, event released (hold_expired, flake)
```

## Error handling

- Both actions throw on unauthenticated callers (existing `currentUserId()` behavior)
  and on ownership/status mismatch (e.g., the claim was already swept), surfacing a
  friendly message. The client catches and shows a toast; the page revalidates so a
  stale prompt disappears.
- `dispatchCheckIns()` is defensive: skips pickups whose listing is no longer
  `claimed`; the `nudgesSent` bump makes re-runs idempotent even if a push send
  later throws (the seam is currently a no-op).

## Testing

- `dispatchCheckIns()` mark math: nudges at 5 and 10, none at 0 or 15, idempotent
  across repeated runs, correct `nudgesSent` after each tick (fake timers / injected
  `now`).
- `confirmCheckIn` / `releaseClaim`: ownership guard, `claimed`-status guard, correct
  event type written (`checked_in` / `withdrawn`), and `holdUntil` unchanged by
  confirm.
- `CheckInPrompt`: prompt appears at the marks, hides after a confirmation
  (`lastCheckInAt`), and the countdown formats correctly — with fake timers.

## Scope decisions

1. **Server-tracked `nudgesSent`** rather than client-only state — required so the
   push seam fires idempotently from the cron, independent of any open page.
2. **Prompt lives on the listing detail page only** for this pass, not also on the
   `/pickups` list cards — keeps scope tight where claim→deliver already happens.
3. **Push is a seam**, not a live integration — avoids blocking on Firebase
   credentials the project owner must provision; one function activates it later.

## Out of scope

- Live FCM send, service worker, token storage, and Firebase env wiring (future
  project; the seam is the handoff point).
- Surfacing the check-up on the `/pickups` list cards.
- Any change to reliability math beyond keeping `withdrawn` out of the flake tally.
