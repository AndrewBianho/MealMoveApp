# Restaurant rescue notifications — design (2026-07-19)

## Problem

Restaurants get no push when their posted food is claimed, delivered, or falls
through. `lib/notify.ts` already defines `restaurantMemberIds()` for exactly this
fan-out, but nothing calls it — push today fires only for buddy invites,
broadcasts, drop-off notices, and announcements. A restaurant learns of a rescue
only by opening `/restaurant/listings`. This sits directly under the product's
restaurant-trust need ("they need to post fast and trust someone will actually
show up"). This is idea #1 in `docs/feature-ideas-2026-07-17.md`, ranked
strongest for value-per-effort because the fan-out code exists and is unused.

## Scope

Notify the restaurant's member accounts on three lifecycle events:

- **Claimed** — a volunteer claims the pickup (fires per car on multi-car
  listings).
- **Delivered** — the listing is *fully* delivered (fires once).
- **Fell-through** — a claim is lost and coverage drops to zero: a voluntary
  sole-volunteer release, or a hold-expiry flake.

Out of scope (deliberately):

- **Never-claimed expiry.** A listing whose window passes without ever being
  claimed sends nothing — no volunteer was ever involved, so there is no false
  "someone's coming" expectation to correct, and a "nobody came" push carries no
  actionable trust signal.
- **Picked-up / in-transit stage.** Not one of the two trust anchors; avoids
  notification fatigue for busy restaurant staff.
- **Any new opt-out / per-category preference infrastructure.** Reuse the
  existing global toggle and quiet hours (see Reliability below).

## Approach

Mirror the established `sendDropOffPickupNotice` pattern (which itself mirrors the
buddy and broadcast notices): a payload builder plus a sender that fans out via
`restaurantMemberIds`, with injectable dependencies for testing. Wire four call
sites, each firing **after its transaction commits** so a failed transition never
notifies. No event bus, no observer layer — that would be infrastructure the
feature does not need.

## New code — `lib/notify.ts`

```ts
export type RestaurantRescueEvent = "claimed" | "delivered" | "fell_through";

export interface RestaurantRescueNotice {
  event: RestaurantRescueEvent;
  restaurantId: string;
  listingId: string;
  listingTitle: string;
  // Only the "claimed" event reads these; omit for delivered / fell_through.
  carsNeeded?: number | null; // for multi-car copy; null/1/undefined = single car
  carsClaimed?: number;       // number of claims after the claim fired
}

export function buildRestaurantRescuePayload(
  n: RestaurantRescueNotice
): NotifyPayload;

export async function sendRestaurantRescueNotice(
  n: RestaurantRescueNotice,
  deps?: {
    recipientIds?: (db: Pick<PrismaClient, "user">) => Promise<string[]>;
    dispatch?: typeof dispatchToUser;
  }
): Promise<void>;
```

`sendRestaurantRescueNotice` resolves recipients via
`restaurantMemberIds(prisma, n.restaurantId)` (injectable), builds the payload
once, and dispatches to every member with **`Promise.allSettled`** so one bad
device token or email does not reject the whole fan-out (a small robustness
improvement over the drop-off notice's `Promise.all`).

### Copy

Sentence case, warm, non-punitive — the fell-through copy never names or blames
the volunteer (the product presents reliability non-punitively). All payloads
link to `/restaurant/listings`. Titles are wrapped in the listing title via
`escapeHtml` in the email HTML, exactly as the existing builders do.

| Event | Push title | Push body |
|---|---|---|
| claimed (single car) | Someone's coming for your pickup | A volunteer claimed "{title}" and is on their way. |
| claimed (multi-car) | Your pickup was claimed | "{title}" — {carsClaimed} of {carsNeeded} cars claimed. |
| delivered | Your food was delivered | "{title}" reached its drop-off. Thank you! |
| fell_through | Your pickup is open again | The volunteer for "{title}" couldn't make it — it's back open and we're finding someone new. |

Multi-car copy is selected when `carsNeeded != null && carsNeeded > 1`.

Email subjects reuse the push title; the email body is the one-sentence push body
plus the existing `emailButton("View your listings", "/restaurant/listings")`.

## Wiring seams

### 1. Claimed — `claimListing` (`app/actions.ts`)

The loaded `listing` already carries `restaurantId`, `title`, and `carsNeeded`
(scalar fields returned by the existing `findUnique`). Capture these plus
`carsClaimed = listing.pickups.length + 1` into a post-commit data object
(alongside the existing `trackData`), and after the transaction commits + views
refresh, call `sendRestaurantRescueNotice({ event: "claimed", ... })` wrapped in
`try/catch` (swallow + log) so a notification failure never surfaces as an error
on an otherwise-successful claim. A buddy joining an existing claim does **not**
fire — it creates no new `Pickup`, so it never reaches this path.

### 2. Delivered — `markDeliveredWithPhotoFor` (`lib/photos.ts`)

Add an injectable parameter `notifyRestaurant = sendRestaurantRescueNotice`,
mirroring the existing `notify = sendDropOffPickupNotice` on
`startDeliveryWithPhotoFor`. The function already computes the listing's next
status via `nextListingStatus(pickup, { deliveredAt })` for the update; capture
that value, and after the transaction commits, fire the notice **only when it
equals `"delivered"`** (i.e. the last car has delivered). A partial multi-car
delivery sends nothing. `restaurantId` and `title` come from
`pickup.listing` (already loaded by `loadClaimInStage`). `carsNeeded` /
`carsClaimed` are omitted — delivered copy does not read them.

### 3. Fell-through, voluntary — `releaseClaimFor` (`lib/checkins.ts`)

Fire **only** in the sole-volunteer branch (the one that deletes the pickup and
reopens the listing) **and only when `otherCars === 0`** — the value the branch
already computes. The buddy-steps-off and primary-promoted branches keep the
rescue alive, so they send nothing. After the transaction commits, call
`sendRestaurantRescueNotice({ event: "fell_through", ... })`; `restaurantId` and
`title` come from `pickup.listing` (loaded by `loadOwnedClaim`). Add an
injectable notify parameter for testing.

### 4. Fell-through, flake — `runSweep` (`lib/sweep.ts`)

In the flaked-pickup loop, after each pickup's transaction commits, fire
`fell_through` when `otherCars === 0` (already computed per pickup). The flaked
query must be extended to include the listing's `restaurantId` and `title` (today
`listing` appears only as a `where` filter, not a selected relation). The sweep
already restricts flakes to `listing.demo === false`, so flake notices are
real-world only. Use an injectable notify (module-level default) consistent with
how the sweep is tested.

## Reliability, opt-out, and demo

- **No new preference infra.** `dispatchToUser` already looks up each recipient's
  `notificationsEnabled` (honored — these are operational, not forced comms),
  `quietHoursStart/End`, and does push→email fallback with invalid-token cleanup.
  The restaurant notices simply build payloads and hand off.
- **Best-effort delivery.** `Promise.allSettled` in the sender + `try/catch` at
  each seam guarantee a flaky FCM/email never fails a core claim / deliver /
  release action, all of which have already committed by the time the notice
  fires.
- **Demo world.** Claimed and delivered notices fire in whichever world the actor
  is in; demo and real accounts are fully separate, so a demo claim only ever
  reaches the demo restaurant account (matching the existing drop-off notice,
  which also fires in demo). Flake fell-through is real-only via the sweep's
  existing demo skip. Voluntary-release fell-through can fire in demo — an
  accepted minor asymmetry, consistent with the drop-off notice not guarding
  demo.

## Testing

- **`lib/notify.test.ts`** — `buildRestaurantRescuePayload` for each event and
  for single- vs multi-car claimed copy; `sendRestaurantRescueNotice` fans out to
  every member (injected `recipientIds` + `dispatch`, asserting one dispatch per
  member) and does not reject when one dispatch rejects (`allSettled`).
- **`lib/photos.test.ts`** — delivered notice fires exactly once when the final
  car delivers; does **not** fire on a partial multi-car delivery (injected
  `notifyRestaurant`).
- **`lib/checkins.test.ts`** — fell_through fires on a sole-volunteer release with
  `otherCars === 0`; does **not** fire on buddy-cover, primary-promoted, or when
  another car still covers.
- **`lib/sweep.test.ts`** — a flaked pickup fires fell_through when
  `otherCars === 0`; does not fire when another car remains claimed.
- **Claim seam** — thin wiring over the unit-tested sender; covered by the
  `lib/notify.test.ts` unit tests plus manual verification (claim a real listing,
  confirm the restaurant account receives push/email).

## Files touched

- `lib/notify.ts` — new event type, builder, sender.
- `app/actions.ts` — fire claimed notice in `claimListing`.
- `lib/photos.ts` — injectable `notifyRestaurant`; fire delivered notice on full
  delivery.
- `lib/checkins.ts` — injectable notify; fire fell_through on sole-release with
  no remaining coverage.
- `lib/sweep.ts` — include listing `restaurantId`/`title` in the flaked query;
  fire fell_through on flake with no remaining coverage.
- Test files above.

No schema changes, no migration, no new environment variables.
