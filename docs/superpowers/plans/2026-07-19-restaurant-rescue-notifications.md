# Restaurant Rescue Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Notify a restaurant's member accounts when their posted food is claimed, fully delivered, or falls through (a claim lost with no remaining coverage), reusing the already-written-but-unused `restaurantMemberIds` fan-out.

**Architecture:** Add one payload builder + one sender to `lib/notify.ts` (mirroring `sendDropOffPickupNotice`), fanning out via `restaurantMemberIds` and `dispatchToUser` with `Promise.allSettled`. Wire four call sites — `claimListing` (`app/actions.ts`), `markDeliveredWithPhotoFor` (`lib/photos.ts`), `releaseClaimFor` (`lib/checkins.ts`), and `runSweep` (`lib/sweep.ts`) — each firing after its transaction commits, wrapped in try/catch so a notification failure never fails the core action.

**Tech Stack:** Next.js 14, TypeScript, Prisma, Firebase Cloud Messaging (push) + email fallback via the existing `dispatchToUser`. Tests use Node's built-in test runner (`node --test`) with `tsx` and lightweight structural Prisma fakes.

## Global Constraints

- **Copy rules (from CLAUDE.md/DESIGN.md):** sentence case everywhere; warm, non-punitive tone; fell-through copy never names or blames the volunteer.
- **Best-effort delivery:** the sender uses `Promise.allSettled`; every seam wraps its notice call in `try/catch` (swallow). A notification failure must never fail a claim/deliver/release.
- **No schema changes, no migration, no new environment variables.**
- **Fell-through fires only when coverage drops to zero** (`otherCars === 0`).
- **Reuse existing dispatch:** do not add opt-out or preference infra — `dispatchToUser` already honors `notificationsEnabled`, quiet hours, and push→email fallback.
- **Link target for all restaurant notices:** `/restaurant/listings`.
- **Test command:** `npm test` (runs `node --require ./lib/stub-server-only.cjs --import tsx --test lib/*.test.ts lib/analytics/*.test.ts`). Run a single file with `node --require ./lib/stub-server-only.cjs --import tsx --test lib/<file>.test.ts`.

---

### Task 1: Payload builder + sender in `lib/notify.ts`

**Files:**
- Modify: `lib/notify.ts` (add type, builder, sender near the existing drop-off notice code)
- Test: `lib/notify.test.ts` (new file)

**Interfaces:**
- Consumes (already in `lib/notify.ts`): `restaurantMemberIds(db, restaurantId)`, `dispatchToUser`, `NotifyPayload`, `absoluteUrl`, `escapeHtml`, `emailButton`, `prisma`.
- Produces:
  - `type RestaurantRescueEvent = "claimed" | "delivered" | "fell_through"`
  - `interface RestaurantRescueNotice { event; restaurantId: string; listingId: string; listingTitle: string; carsNeeded?: number | null; carsClaimed?: number }`
  - `buildRestaurantRescuePayload(n: RestaurantRescueNotice): NotifyPayload`
  - `sendRestaurantRescueNotice(n: RestaurantRescueNotice, deps?: { recipientIds?; dispatch? }): Promise<void>`

- [ ] **Step 1: Write the failing tests**

Create `lib/notify.test.ts`:

```ts
// Test doubles below stand in for the Prisma client; `any` keeps the fakes
// lightweight (we only implement the handful of methods under test).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildRestaurantRescuePayload,
  sendRestaurantRescueNotice,
} from "./notify";

test("buildRestaurantRescuePayload: claimed, single car", () => {
  const p = buildRestaurantRescuePayload({
    event: "claimed",
    restaurantId: "r1",
    listingId: "ls1",
    listingTitle: "Bagels",
  });
  assert.equal(p.title, "Someone's coming for your pickup");
  assert.match(p.body, /A volunteer claimed "Bagels"/);
  assert.equal(p.url, "/restaurant/listings");
  assert.equal(p.email.subject, "Someone's coming for your pickup");
  assert.match(p.email.html, /Bagels/);
});

test("buildRestaurantRescuePayload: claimed, multi car shows progress", () => {
  const p = buildRestaurantRescuePayload({
    event: "claimed",
    restaurantId: "r1",
    listingId: "ls1",
    listingTitle: "Trays",
    carsNeeded: 3,
    carsClaimed: 2,
  });
  assert.equal(p.title, "Your pickup was claimed");
  assert.match(p.body, /2 of 3 cars claimed/);
});

test("buildRestaurantRescuePayload: delivered", () => {
  const p = buildRestaurantRescuePayload({
    event: "delivered",
    restaurantId: "r1",
    listingId: "ls1",
    listingTitle: "Bagels",
  });
  assert.equal(p.title, "Your food was delivered");
  assert.match(p.body, /reached its drop-off/);
});

test("buildRestaurantRescuePayload: fell_through is non-punitive", () => {
  const p = buildRestaurantRescuePayload({
    event: "fell_through",
    restaurantId: "r1",
    listingId: "ls1",
    listingTitle: "Bagels",
  });
  assert.equal(p.title, "Your pickup is open again");
  assert.match(p.body, /couldn't make it/);
  assert.match(p.body, /back open/);
});

test("sendRestaurantRescueNotice: dispatches once per restaurant member", async () => {
  const calls: any[] = [];
  await sendRestaurantRescueNotice(
    { event: "claimed", restaurantId: "r1", listingId: "ls1", listingTitle: "Bagels" },
    {
      recipientIds: async () => ["m1", "m2"],
      dispatch: (async (userId: string, payload: any) => {
        calls.push({ userId, payload });
        return { channel: "push" as const };
      }) as any,
    }
  );
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map((c) => c.userId).sort(), ["m1", "m2"]);
  assert.equal(calls[0].payload.title, "Someone's coming for your pickup");
});

test("sendRestaurantRescueNotice: one failing dispatch does not reject the fan-out", async () => {
  await assert.doesNotReject(() =>
    sendRestaurantRescueNotice(
      { event: "delivered", restaurantId: "r1", listingId: "ls1", listingTitle: "Bagels" },
      {
        recipientIds: async () => ["ok", "bad"],
        dispatch: (async (userId: string) => {
          if (userId === "bad") throw new Error("token dead");
          return { channel: "push" as const };
        }) as any,
      }
    )
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --require ./lib/stub-server-only.cjs --import tsx --test lib/notify.test.ts`
Expected: FAIL — `buildRestaurantRescuePayload`/`sendRestaurantRescueNotice` are not exported.

- [ ] **Step 3: Implement the builder and sender**

In `lib/notify.ts`, add after the `sendDropOffPickupNotice` function (end of file). Reuse the existing `emailButton`, `escapeHtml`, `absoluteUrl`, `restaurantMemberIds`, `dispatchToUser`, `prisma` already in this module:

```ts
export type RestaurantRescueEvent = "claimed" | "delivered" | "fell_through";

export interface RestaurantRescueNotice {
  event: RestaurantRescueEvent;
  restaurantId: string;
  listingId: string;
  listingTitle: string;
  // Only the "claimed" event reads these; omit for delivered / fell_through.
  carsNeeded?: number | null;
  carsClaimed?: number;
}

// A restaurant-facing rescue update. Copy is sentence case and non-punitive —
// the fell-through case never names or blames the volunteer. Always links to the
// restaurant's own listings console.
export function buildRestaurantRescuePayload(
  notice: RestaurantRescueNotice
): NotifyPayload {
  const raw = notice.listingTitle;
  const title = escapeHtml(raw);
  const multiCar =
    notice.event === "claimed" &&
    notice.carsNeeded != null &&
    notice.carsNeeded > 1 &&
    notice.carsClaimed != null;

  let pushTitle: string;
  let pushBody: string;
  let bodyHtml: string;
  switch (notice.event) {
    case "claimed":
      if (multiCar) {
        pushTitle = "Your pickup was claimed";
        pushBody = `"${raw}" — ${notice.carsClaimed} of ${notice.carsNeeded} cars claimed.`;
        bodyHtml = `"${title}" — ${notice.carsClaimed} of ${notice.carsNeeded} cars claimed.`;
      } else {
        pushTitle = "Someone's coming for your pickup";
        pushBody = `A volunteer claimed "${raw}" and is on their way.`;
        bodyHtml = `A volunteer claimed "${title}" and is on their way.`;
      }
      break;
    case "delivered":
      pushTitle = "Your food was delivered";
      pushBody = `"${raw}" reached its drop-off. Thank you!`;
      bodyHtml = `"${title}" reached its drop-off. Thank you!`;
      break;
    case "fell_through":
      pushTitle = "Your pickup is open again";
      pushBody = `The volunteer for "${raw}" couldn't make it — it's back open and we're finding someone new.`;
      bodyHtml = `The volunteer for "${title}" couldn't make it — it's back open and we're finding someone new.`;
      break;
  }

  return {
    title: pushTitle,
    body: pushBody,
    url: `/restaurant/listings`,
    email: {
      subject: pushTitle,
      html: `<p>${bodyHtml}</p>` + emailButton("View your listings", `/restaurant/listings`),
    },
  };
}

// Fans out a rescue update to every account that shares the restaurant
// (User.restaurantId), via the existing per-user dispatch (which honors each
// member's opt-out, quiet hours, and push→email fallback). Best-effort:
// Promise.allSettled so one dead token / bounced email never rejects the batch.
// Recipient lookup and dispatch are injectable for tests.
export async function sendRestaurantRescueNotice(
  notice: RestaurantRescueNotice,
  deps: {
    recipientIds?: (db: Pick<PrismaClient, "user">) => Promise<string[]>;
    dispatch?: typeof dispatchToUser;
  } = {}
): Promise<void> {
  const dispatch = deps.dispatch ?? dispatchToUser;
  const recipientIds =
    deps.recipientIds ?? ((db) => restaurantMemberIds(db, notice.restaurantId));
  const ids = await recipientIds(prisma);
  const payload = buildRestaurantRescuePayload(notice);
  await Promise.allSettled(ids.map((id) => dispatch(id, payload)));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --require ./lib/stub-server-only.cjs --import tsx --test lib/notify.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/notify.ts lib/notify.test.ts
git commit -m "feat: restaurant rescue notification builder and sender

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Delivered seam in `lib/photos.ts`

**Files:**
- Modify: `lib/photos.ts` — import `sendRestaurantRescueNotice`; add injectable `notifyRestaurant` param to `markDeliveredWithPhotoFor`; fire on full delivery.
- Test: `lib/photos.test.ts` — add two tests.

**Interfaces:**
- Consumes: `sendRestaurantRescueNotice` (Task 1); existing `nextListingStatus`, `loadClaimInStage`.
- Produces: `markDeliveredWithPhotoFor(db, userId, listingId, photoUrl, now?, notifyRestaurant?)` — new optional last param defaulting to `sendRestaurantRescueNotice`.

- [ ] **Step 1: Write the failing tests**

Add to `lib/photos.test.ts` (after the existing `markDeliveredWithPhotoFor` tests). The first reuses `txDb`; the second builds a two-car fixture inline because `txDb` hardcodes a single pickup:

```ts
test("markDeliveredWithPhotoFor: notifies the restaurant on full delivery", async () => {
  const { db } = txDb({
    volunteerId: "vol1",
    listing: { status: "in_transit", restaurantId: "r1", title: "Bagels" },
  });
  const notices: any[] = [];
  await markDeliveredWithPhotoFor(db, "vol1", "ls1", "https://x/d.jpg", t0, async (n) => {
    notices.push(n);
  });
  assert.equal(notices.length, 1);
  assert.equal(notices[0].event, "delivered");
  assert.equal(notices[0].restaurantId, "r1");
  assert.equal(notices[0].listingTitle, "Bagels");
});

test("markDeliveredWithPhotoFor: no restaurant notice on a partial multi-car delivery", async () => {
  // Two cars; the other has not delivered, so the listing is not yet "delivered".
  const other: any = {
    id: "pk2",
    photoAtPickupUrl: "https://x/seed2.jpg",
    takenHomeAt: null,
    deliveredAt: null,
  };
  const acting: any = {
    id: "pk1",
    buddyId: null,
    volunteerId: "vol1",
    photoAtPickupUrl: "https://x/seed1.jpg",
    takenHomeAt: null,
    deliveredAt: null,
    listing: { status: "in_transit", carsNeeded: 2, restaurantId: "r1", title: "Trays" },
  };
  acting.listing.pickups = [acting, other];
  const db: any = {
    pickup: { findFirst: async () => acting, update: async () => acting },
    foodListing: { update: async () => ({}) },
    listingEvent: { create: async ({ data }: any) => data },
    message: { create: async ({ data }: any) => data },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  };
  const notices: any[] = [];
  await markDeliveredWithPhotoFor(db, "vol1", "ls1", "https://x/d.jpg", t0, async (n) => {
    notices.push(n);
  });
  assert.equal(notices.length, 0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --require ./lib/stub-server-only.cjs --import tsx --test lib/photos.test.ts`
Expected: FAIL — `markDeliveredWithPhotoFor` takes no 6th argument / does not call it.

- [ ] **Step 3: Implement the delivered seam**

In `lib/photos.ts`, extend the import from `./notify`:

```ts
import { sendDropOffPickupNotice, sendRestaurantRescueNotice } from "./notify";
```

Change the `markDeliveredWithPhotoFor` signature to add the injectable notifier:

```ts
export async function markDeliveredWithPhotoFor(
  db: Db,
  userId: string,
  listingId: string,
  photoUrl: string,
  now: number = Date.now(),
  notifyRestaurant = sendRestaurantRescueNotice
): Promise<void> {
```

Inside the function, compute the next status once, use it in the update, and fire the notice after the transaction. Replace the existing `db.foodListing.update({ ... status: nextListingStatus(...) })` call and add the post-commit notice:

```ts
  const newStatus = nextListingStatus(pickup, { deliveredAt: new Date(now) });

  await db.$transaction([
    db.pickup.update({
      where: { id: pickup.id },
      data: { photoAtDeliveryUrl: url, deliveredAt: new Date(now) },
    }),
    db.foodListing.update({
      where: { id: listingId },
      data: { status: newStatus },
    }),
    db.listingEvent.create({
      data: {
        listingId,
        type: "photo_at_delivery",
        actorId: userId,
        meta: { photoUrl: url },
      },
    }),
    ...seats.map((id) =>
      db.listingEvent.create({
        data: { listingId, type: "delivered", actorId: id },
      })
    ),
  ]);

  // The restaurant learns their food made it — only once the listing is fully
  // delivered (a multi-car listing stays quiet until the last car lands).
  // Best-effort: the rescue is already complete, so a push failure must not throw.
  if (newStatus === "delivered") {
    try {
      await notifyRestaurant({
        event: "delivered",
        restaurantId: pickup.listing.restaurantId,
        listingId,
        listingTitle: pickup.listing.title,
      });
    } catch {
      // best-effort notification
    }
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --require ./lib/stub-server-only.cjs --import tsx --test lib/photos.test.ts`
Expected: PASS (all existing tests + 2 new).

- [ ] **Step 5: Commit**

```bash
git add lib/photos.ts lib/photos.test.ts
git commit -m "feat: notify restaurant when their listing is fully delivered

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Voluntary fell-through seam in `lib/checkins.ts`

**Files:**
- Modify: `lib/checkins.ts` — import `sendRestaurantRescueNotice`; add injectable `notify` param to `releaseClaimFor`; fire in the sole-volunteer branch when `otherCars === 0`.
- Test: `lib/checkins.test.ts` — extend `txDb` to allow `otherCars`; add three tests.

**Interfaces:**
- Consumes: `sendRestaurantRescueNotice` (Task 1).
- Produces: `releaseClaimFor(db, userId, listingId, notify?)` — new optional last param defaulting to `sendRestaurantRescueNotice`.

- [ ] **Step 1: Extend the test fake and write failing tests**

In `lib/checkins.test.ts`, change the `txDb` signature so `pickup.count` (the other-cars probe) is controllable, and add `restaurantId`/`title` support via the passed `listing`. Replace the `txDb` header and its `count` line:

```ts
function txDb(pickupRow: any, opts: { otherCars?: number } = {}) {
```

```ts
      // The sole-volunteer release checks for other cars before clearing the
      // listing's drop-off; controllable per test (defaults to none).
      count: async () => opts.otherCars ?? 0,
```

Add these tests at the end of `lib/checkins.test.ts`:

```ts
test("releaseClaimFor: notifies the restaurant when the last car falls through", async () => {
  const { db } = txDb({
    volunteerId: "vol1",
    listing: { status: "claimed", restaurantId: "r1", title: "Bagels" },
  });
  const notices: any[] = [];
  await releaseClaimFor(db, "vol1", "ls1", async (n) => {
    notices.push(n);
  });
  assert.equal(notices.length, 1);
  assert.equal(notices[0].event, "fell_through");
  assert.equal(notices[0].restaurantId, "r1");
  assert.equal(notices[0].listingTitle, "Bagels");
});

test("releaseClaimFor: no restaurant notice when another car still covers", async () => {
  const { db } = txDb(
    { volunteerId: "vol1", listing: { status: "open", restaurantId: "r1", title: "Bagels" } },
    { otherCars: 1 }
  );
  const notices: any[] = [];
  await releaseClaimFor(db, "vol1", "ls1", async (n) => {
    notices.push(n);
  });
  assert.equal(notices.length, 0);
});

test("releaseClaimFor: no restaurant notice when the buddy steps off (coverage stays)", async () => {
  const { db } = txDb({
    volunteerId: "vol1",
    buddyId: "vol2",
    listing: { status: "claimed", restaurantId: "r1", title: "Bagels" },
  });
  const notices: any[] = [];
  await releaseClaimFor(db, "vol2", "ls1", async (n) => {
    notices.push(n);
  });
  assert.equal(notices.length, 0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --require ./lib/stub-server-only.cjs --import tsx --test lib/checkins.test.ts`
Expected: FAIL — `releaseClaimFor` takes no 4th argument / does not notify.

- [ ] **Step 3: Implement the voluntary fell-through seam**

In `lib/checkins.ts`, add the import:

```ts
import { sendRestaurantRescueNotice } from "./notify";
```

Change the `releaseClaimFor` signature:

```ts
export async function releaseClaimFor(
  db: Db,
  userId: string,
  listingId: string,
  notify = sendRestaurantRescueNotice
): Promise<void> {
```

In the sole-volunteer branch (the one that computes `otherCars`, deletes the pickup, and reopens the listing), after the `$transaction([...])` completes, add the notice. The branch already ends with the transaction; append:

```ts
  await db.$transaction([
    db.pickup.delete({ where: { id: pickup.id } }),
    db.foodListing.update({
      where: { id: listingId },
      data: { status: "open", ...(otherCars === 0 ? { dropOffId: null } : {}) },
    }),
    db.buddyInvite.updateMany({
      where: { listingId, inviterId: userId, status: "pending" },
      data: { status: "cancelled", respondedAt: new Date() },
    }),
    db.listingEvent.create({
      data: {
        listingId,
        type: "withdrawn",
        actorId: userId,
        meta: { reason: "volunteer_released" },
      },
    }),
  ]);

  // The food lost its only volunteer — tell the restaurant it's back open so
  // they aren't left expecting a no-show. Only when no other car still covers.
  // Best-effort: the release already committed, so a push failure must not throw.
  if (otherCars === 0) {
    try {
      await notify({
        event: "fell_through",
        restaurantId: pickup.listing.restaurantId,
        listingId,
        listingTitle: pickup.listing.title,
      });
    } catch {
      // best-effort notification
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --require ./lib/stub-server-only.cjs --import tsx --test lib/checkins.test.ts`
Expected: PASS (all existing tests + 3 new).

- [ ] **Step 5: Commit**

```bash
git add lib/checkins.ts lib/checkins.test.ts
git commit -m "feat: notify restaurant when a volunteer releases the last claim

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Flake fell-through seam in `lib/sweep.ts`

**Files:**
- Modify: `lib/sweep.ts` — make `runSweep` accept injectable `db`/`notify`/`track`; include listing `restaurantId`/`title` in the flaked query; fire fell_through when `otherCars === 0`.
- Test: `lib/sweep.test.ts` (new file).

**Interfaces:**
- Consumes: `sendRestaurantRescueNotice` (Task 1); existing `trackServer`, `prisma`.
- Produces: `runSweep(deps?: { db?; notify?; track? }): Promise<{ released; expired; at }>` — all deps optional, defaulting to the real `prisma` / `sendRestaurantRescueNotice` / `trackServer`. The no-arg call in `app/api/cron/sweep/route.ts` is unaffected.

- [ ] **Step 1: Write the failing tests**

Create `lib/sweep.test.ts`:

```ts
// Test doubles below stand in for the Prisma client; `any` keeps the fakes
// lightweight (we only implement the handful of methods under test).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { test } from "node:test";
import assert from "node:assert/strict";
import { runSweep } from "./sweep";

// A fake db exposing only what runSweep's flake+expire passes touch. The flaked
// list and the other-cars count are configurable per test; the expire pass finds
// nothing.
function sweepDb(opts: { flaked: any[]; otherCars: number }) {
  const db: any = {
    pickup: {
      findMany: async () => opts.flaked,
      count: async () => opts.otherCars,
      delete: async () => ({}),
    },
    foodListing: {
      update: async () => ({}),
      findMany: async () => [], // no expiries in these tests
    },
    buddyInvite: { updateMany: async () => ({ count: 0 }) },
    listingEvent: { create: async ({ data }: any) => data },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  };
  return db;
}

function flakedPickup() {
  return {
    id: "pk1",
    listingId: "ls1",
    volunteerId: "vol1",
    photoAtPickupUrl: null,
    claimedAt: new Date(),
    listing: { restaurantId: "r1", title: "Bagels" },
  };
}

test("runSweep: notifies the restaurant when a flake leaves no coverage", async () => {
  const notices: any[] = [];
  const db = sweepDb({ flaked: [flakedPickup()], otherCars: 0 });
  const res = await runSweep({
    db,
    notify: (async (n: any) => {
      notices.push(n);
    }) as any,
    track: (async () => {}) as any,
  });
  assert.equal(res.released, 1);
  assert.equal(notices.length, 1);
  assert.equal(notices[0].event, "fell_through");
  assert.equal(notices[0].restaurantId, "r1");
  assert.equal(notices[0].listingTitle, "Bagels");
});

test("runSweep: no restaurant notice when another car still covers the flake", async () => {
  const notices: any[] = [];
  const db = sweepDb({ flaked: [flakedPickup()], otherCars: 1 });
  await runSweep({
    db,
    notify: (async (n: any) => {
      notices.push(n);
    }) as any,
    track: (async () => {}) as any,
  });
  assert.equal(notices.length, 0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --require ./lib/stub-server-only.cjs --import tsx --test lib/sweep.test.ts`
Expected: FAIL — `runSweep` takes no deps / does not notify.

- [ ] **Step 3: Make `runSweep` injectable and fire the notice**

In `lib/sweep.ts`, add the import:

```ts
import { sendRestaurantRescueNotice } from "./notify";
```

Change the `runSweep` signature and resolve deps at the top of the body (leave `materializeSchedules` untouched):

```ts
type SweepDb = Pick<
  typeof prisma,
  "pickup" | "foodListing" | "buddyInvite" | "listingEvent" | "$transaction"
>;

export async function runSweep(
  deps: {
    db?: SweepDb;
    notify?: typeof sendRestaurantRescueNotice;
    track?: typeof trackServer;
  } = {}
): Promise<{
  released: number;
  expired: number;
  at: string;
}> {
  const db = deps.db ?? prisma;
  const notify = deps.notify ?? sendRestaurantRescueNotice;
  const track = deps.track ?? trackServer;
  const now = new Date();
  let released = 0;
  let expired = 0;
```

In the flaked-pickup query, replace `prisma.pickup.findMany` with `db.pickup.findMany` and add an `include` for the listing fields the notice needs:

```ts
  const flaked = await db.pickup.findMany({
    where: {
      holdUntil: { lt: now },
      photoAtPickupUrl: null,
      listing: { status: { in: ["open", "claimed"] }, demo: false },
    },
    include: { listing: { select: { restaurantId: true, title: true } } },
  });
```

Inside the `for (const pickup of flaked)` loop, replace every remaining `prisma.` with `db.` (the `pickup.count`, the `$transaction([...])` with `pickup.delete` / `foodListing.update` / `buddyInvite.updateMany` / `listingEvent.create`), and replace the `trackServer(` call with `track(`. Then, after the `track(...)` call and before `released++`, add the notice:

```ts
    // The 15-min hold lapsed with no pickup — the food is back open. Tell the
    // restaurant, but only when this was the last car covering it. Best-effort.
    if (otherCars === 0) {
      try {
        await notify({
          event: "fell_through",
          restaurantId: pickup.listing.restaurantId,
          listingId: pickup.listingId,
          listingTitle: pickup.listing.title,
        });
      } catch {
        // best-effort notification
      }
    }
    released++;
```

In the expire pass (step 2), replace `prisma.foodListing.findMany`, `prisma.foodListing.update`, and `prisma.listingEvent.create` with the `db.` equivalents so the whole function uses the injected client.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --require ./lib/stub-server-only.cjs --import tsx --test lib/sweep.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Verify the cron caller still type-checks**

Run: `npx tsc --noEmit`
Expected: PASS — `app/api/cron/sweep/route.ts` calls `runSweep()` with no args, still valid because every dep is optional.

- [ ] **Step 6: Commit**

```bash
git add lib/sweep.ts lib/sweep.test.ts
git commit -m "feat: notify restaurant when a hold-expiry flake leaves no coverage

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Claimed seam in `claimListing` (`app/actions.ts`)

**Files:**
- Modify: `app/actions.ts` — import `sendRestaurantRescueNotice`; capture restaurant/title/car data inside the claim transaction; fire the claimed notice after commit.

**Interfaces:**
- Consumes: `sendRestaurantRescueNotice` (Task 1).
- Produces: no new exported interface — this is the final call-site wiring.

No unit test: `claimListing` runs against the real Prisma client and `auth()` session, so it is not structurally injectable like the `lib/*` seams. It is thin wiring over the unit-tested `sendRestaurantRescueNotice`; correctness is covered by Task 1's tests plus the typecheck/build and the manual verification in Task 6.

- [ ] **Step 1: Add the import**

In `app/actions.ts`, add `sendRestaurantRescueNotice` to the existing import from `@/lib/notify` (or add a new import line if the module is not yet imported there):

```ts
import { sendRestaurantRescueNotice } from "@/lib/notify";
```

- [ ] **Step 2: Capture notice data inside the transaction**

In `claimListing`, alongside the existing `let trackData: ... | null = null;` declaration (near the top of the function, before `await prisma.$transaction`), add:

```ts
  let notifyData:
    | { restaurantId: string; title: string; carsNeeded: number | null; carsClaimed: number }
    | null = null;
```

Inside the transaction, right after the block that sets `trackData = { ... }` (which runs after the pickup is created and the listing updated), add:

```ts
    notifyData = {
      restaurantId: listing.restaurantId,
      title: listing.title,
      carsNeeded: listing.carsNeeded,
      carsClaimed: listing.pickups.length + 1,
    };
```

(`listing` here is the row loaded by `tx.foodListing.findUnique` at the top of the transaction; `restaurantId`, `title`, and `carsNeeded` are scalar fields already present, and `listing.pickups.length + 1` is the claim count after this claim.)

- [ ] **Step 3: Fire the notice after the transaction commits**

After `refreshViews(listingId);` and the existing `if (trackData) { ... trackServer(...) }` block, at the end of `claimListing`, add:

```ts
  // Reassure the restaurant that a volunteer is on the way. Fired after commit,
  // best-effort — the claim already succeeded, so a push failure must not throw.
  if (notifyData) {
    try {
      await sendRestaurantRescueNotice({
        event: "claimed",
        restaurantId: notifyData.restaurantId,
        listingId,
        listingTitle: notifyData.title,
        carsNeeded: notifyData.carsNeeded,
        carsClaimed: notifyData.carsClaimed,
      });
    } catch {
      // best-effort notification
    }
  }
```

- [ ] **Step 4: Verify typecheck passes**

Run: `npx tsc --noEmit`
Expected: PASS. If `listing.restaurantId` is typed as `string | null`, coerce with a guard (`if (listing.restaurantId) { notifyData = { restaurantId: listing.restaurantId, ... } }`) — every listing has a restaurant, so a null would simply skip the notice.

- [ ] **Step 5: Commit**

```bash
git add app/actions.ts
git commit -m "feat: notify restaurant when a volunteer claims their pickup

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS — all existing tests plus the new `notify`/`photos`/`checkins`/`sweep` tests.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS, no errors.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: PASS (no new warnings/errors in the touched files).

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: `prisma generate && next build` completes without errors.

- [ ] **Step 5: Manual verification (real world)**

With a real (non-demo) restaurant account that has a device registered or a valid email, and a second volunteer account:
1. Post a listing as the restaurant; as the volunteer, claim it → the restaurant receives the "Someone's coming for your pickup" notice.
2. Release the claim (or let the 15-min hold lapse / run the sweep) → the restaurant receives "Your pickup is open again".
3. Re-claim, upload the pickup photo, then the delivery photo → on full delivery the restaurant receives "Your food was delivered".

Confirm each notice links to `/restaurant/listings` and that a member with notifications disabled receives nothing.

- [ ] **Step 6: Final commit (if any lint/type fixes were needed)**

```bash
git add -A
git commit -m "chore: verification fixes for restaurant rescue notifications

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
