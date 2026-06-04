# Check-up confirmations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add liveness check-up confirmations during a claim's 15-minute hold — an in-app prompt at the 5- and 10-minute marks with "Still on it" / "I can't make it (release)", plus a dormant push seam, leaving the existing 15-minute auto-cancel unchanged.

**Architecture:** Pure timing logic lives in a dependency-free module (`lib/checkin-marks.ts`) shared by the cron dispatcher and the UI. Check-in I/O lives in `lib/checkins.ts` with injectable Prisma + notify dependencies so it unit-tests without a database (mirroring how `runSweep` already lives in `lib/`). Server actions in `app/actions.ts` are thin wrappers. The UI is a single client component on the listing detail page. Push is a no-op seam (`lib/notify.ts`) that activates later when Firebase is provisioned.

**Tech Stack:** Next.js 14 App Router, TypeScript, Prisma + PostgreSQL, React (client components, `useTransition`), Tailwind. Tests use the built-in `node:test` runner via `tsx` (no new dependencies).

**Design spec:** `docs/superpowers/specs/2026-06-04-check-in-confirmations-design.md`

---

## File structure

| File | Responsibility | New? |
|---|---|---|
| `lib/checkin-marks.ts` | Pure timing math: marks, due-count, active prompt, countdown format | Create |
| `lib/checkin-marks.test.ts` | Unit tests for the pure math | Create |
| `lib/notify.ts` | `sendCheckInPush` integration seam (no-op until FCM) | Create |
| `lib/checkins.ts` | `dispatchCheckIns`, `confirmCheckInFor`, `releaseClaimFor` (injectable db) | Create |
| `lib/checkins.test.ts` | Unit tests for dispatch + actions core (fake db) | Create |
| `prisma/schema.prisma` | Add `Pickup.lastCheckInAt`, `Pickup.nudgesSent` | Modify |
| `app/actions.ts` | `confirmCheckIn` / `releaseClaim` server-action wrappers | Modify |
| `app/api/cron/sweep/route.ts` | Call `dispatchCheckIns()` after `runSweep()` | Modify |
| `lib/types.ts` | Add `claimedAt`/`holdUntil`/`lastCheckInAt`/`mine` to `Listing` | Modify |
| `lib/listings.ts` | Serialize new fields; thread `viewerId` | Modify |
| `app/listings/[id]/page.tsx` | Pass session user id to `getListing` | Modify |
| `components/CheckInPrompt.tsx` | Client check-up card: countdown + prompt + actions | Create |
| `components/ListingDetail.tsx` | Render `CheckInPrompt` when claimed + mine | Modify |
| `package.json` | Add `test` script | Modify |

---

## Task 1: Pure check-in timing math

**Files:**
- Create: `lib/checkin-marks.ts`
- Test: `lib/checkin-marks.test.ts`
- Modify: `package.json` (add `test` script)

- [ ] **Step 1: Add the test script to `package.json`**

In the `"scripts"` block, add this entry (after `"sweep"`):

```json
"test": "node --import tsx --test \"lib/**/*.test.ts\""
```

- [ ] **Step 2: Write the failing test**

Create `lib/checkin-marks.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dueNudgeCount,
  activeMark,
  formatCountdown,
  HOLD_MINUTES,
  CHECK_IN_MARKS,
} from "./checkin-marks";

const MIN = 60_000;
const t0 = 1_000_000_000_000;

test("dueNudgeCount: none before the 5-min mark", () => {
  assert.equal(dueNudgeCount(t0, t0 + 4 * MIN), 0);
});

test("dueNudgeCount: one at 5 min, two at 10 min", () => {
  assert.equal(dueNudgeCount(t0, t0 + 5 * MIN), 1);
  assert.equal(dueNudgeCount(t0, t0 + 10 * MIN), 2);
});

test("dueNudgeCount: capped at 2 past 15 min", () => {
  assert.equal(dueNudgeCount(t0, t0 + 30 * MIN), 2);
});

test("activeMark: null before any mark passes", () => {
  assert.equal(activeMark(t0, null, t0 + 4 * MIN), null);
});

test("activeMark: 5 once the 5-min mark passes and never confirmed", () => {
  assert.equal(activeMark(t0, null, t0 + 6 * MIN), 5);
});

test("activeMark: 10 wins once the 10-min mark passes", () => {
  assert.equal(activeMark(t0, null, t0 + 11 * MIN), 10);
});

test("activeMark: a confirmation suppresses the current mark only", () => {
  // Confirmed at 6 min → the 5-min mark is silenced…
  assert.equal(activeMark(t0, t0 + 6 * MIN, t0 + 7 * MIN), null);
  // …but the 10-min mark still fires later.
  assert.equal(activeMark(t0, t0 + 6 * MIN, t0 + 11 * MIN), 10);
});

test("formatCountdown: formats mm:ss and clamps negatives to 0:00", () => {
  assert.equal(formatCountdown(7 * MIN + 21_000), "7:21");
  assert.equal(formatCountdown(65_000), "1:05");
  assert.equal(formatCountdown(-5_000), "0:00");
});

test("constants are the single source of truth", () => {
  assert.equal(HOLD_MINUTES, 15);
  assert.deepEqual([...CHECK_IN_MARKS], [5, 10]);
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module './checkin-marks'` (file not created yet).

- [ ] **Step 4: Implement the pure module**

Create `lib/checkin-marks.ts`:

```ts
// Pure timing logic for check-up confirmations. No I/O — runs on both server
// and client and is the single source of truth for the 15-min hold and the
// 5/10-min nudge marks (used by the cron dispatcher and the UI prompt alike).

export const HOLD_MINUTES = 15;
export const CHECK_IN_MARKS = [5, 10] as const; // minutes after claim to nudge

const MIN = 60_000;

/** How many nudge marks have elapsed since the claim (0–2). Drives the cron. */
export function dueNudgeCount(claimedAtMs: number, nowMs: number): number {
  const elapsedMin = (nowMs - claimedAtMs) / MIN;
  return CHECK_IN_MARKS.filter((m) => elapsedMin >= m).length;
}

/**
 * The nudge mark (in minutes) to prompt the volunteer with right now, or null
 * if none is pending. A mark is pending when its time has passed and the
 * volunteer hasn't confirmed since then. The most recent pending mark wins.
 */
export function activeMark(
  claimedAtMs: number,
  lastCheckInAtMs: number | null,
  nowMs: number
): number | null {
  for (let i = CHECK_IN_MARKS.length - 1; i >= 0; i--) {
    const mark = CHECK_IN_MARKS[i];
    const markTime = claimedAtMs + mark * MIN;
    const passed = nowMs >= markTime;
    const unconfirmed = lastCheckInAtMs === null || lastCheckInAtMs < markTime;
    if (passed && unconfirmed) return mark;
  }
  return null;
}

/** Milliseconds left until the 15-min auto-release, formatted "M:SS". */
export function formatCountdown(remainingMs: number): string {
  const totalSec = Math.floor(Math.max(0, remainingMs) / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test`
Expected: PASS — all 8 tests pass.

- [ ] **Step 6: Commit**

```bash
git add lib/checkin-marks.ts lib/checkin-marks.test.ts package.json
git commit -m "feat: pure check-up timing math (marks, due-count, countdown)"
```

---

## Task 2: Schema — track confirmations and dispatched nudges

**Files:**
- Modify: `prisma/schema.prisma` (the `Pickup` model, around lines 106-117)

> No automated test — this is a schema migration verified by a successful
> `prisma migrate` and `prisma generate`. Requires `DATABASE_URL` / `DIRECT_URL`
> in `.env` (Supabase). If the DB is unreachable, stop and surface that.

- [ ] **Step 1: Add the two fields to the `Pickup` model**

In `prisma/schema.prisma`, inside `model Pickup`, add these lines after `holdUntil DateTime`:

```prisma
  lastCheckInAt DateTime? // last "still on it" confirmation; suppresses re-prompting
  nudgesSent    Int       @default(0) // count of 5-min check-up nudges the cron has dispatched (0–2)
```

- [ ] **Step 2: Create and apply the migration**

Run: `npm run db:migrate -- --name add_checkin_fields`
Expected: a new migration under `prisma/migrations/`, applied cleanly; Prisma Client regenerated.

- [ ] **Step 3: Regenerate the client (belt-and-suspenders)**

Run: `npm run db:generate`
Expected: "Generated Prisma Client" with no errors.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add lastCheckInAt and nudgesSent to Pickup"
```

---

## Task 3: Push notification seam

**Files:**
- Create: `lib/notify.ts`

> Trivial no-op seam; no separate test (it is exercised by Task 4's tests, which
> inject a stand-in). The point is a single, well-typed integration point.

- [ ] **Step 1: Create the seam**

Create `lib/notify.ts`:

```ts
import { CHECK_IN_MARKS } from "./checkin-marks";

export interface CheckInPush {
  pickupId: string;
  listingId: string;
  volunteerId: string;
  listingTitle: string;
  /** 1-based nudge index: 1 → the 5-min mark, 2 → the 10-min mark. */
  markIndex: number;
}

/**
 * Integration seam for the check-up push notification. No-op until Firebase
 * Cloud Messaging is provisioned — this is the ONLY place FCM plugs in. When
 * wired, look up the volunteer's FCM token(s) and send via firebase-admin here.
 */
export async function sendCheckInPush(push: CheckInPush): Promise<void> {
  if (process.env.NODE_ENV !== "production") {
    const minutes = CHECK_IN_MARKS[push.markIndex - 1];
    console.log(
      `[check-in] would push volunteer ${push.volunteerId} at the ${minutes}-min mark for "${push.listingTitle}"`
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/notify.ts
git commit -m "feat: add no-op check-in push seam (FCM integration point)"
```

---

## Task 4: Check-in dispatcher

**Files:**
- Create: `lib/checkins.ts`
- Test: `lib/checkins.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/checkins.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { dispatchCheckIns } from "./checkins";

const MIN = 60_000;
const t0 = 1_000_000_000_000;

function fakeDb(pickups: any[]) {
  const updates: Record<string, any> = {};
  const db: any = {
    pickup: {
      findMany: async () => pickups,
      update: async ({ where, data }: any) => {
        updates[where.id] = { ...(updates[where.id] ?? {}), ...data };
        const p = pickups.find((x) => x.id === where.id);
        if (p) Object.assign(p, data);
        return p;
      },
    },
  };
  return { db, updates };
}

function pickup(over: Record<string, any> = {}) {
  return {
    id: "pk1",
    listingId: "ls1",
    volunteerId: "vol1",
    claimedAt: new Date(t0),
    nudgesSent: 0,
    listing: { title: "Bagels", status: "claimed" },
    ...over,
  };
}

test("dispatchCheckIns: no nudge before the 5-min mark", async () => {
  const { db } = fakeDb([pickup()]);
  const pushes: number[] = [];
  const res = await dispatchCheckIns(db, t0 + 4 * MIN, async (p) => {
    pushes.push(p.markIndex);
  });
  assert.equal(res.nudged, 0);
  assert.deepEqual(pushes, []);
});

test("dispatchCheckIns: one push at 5 min, persists nudgesSent", async () => {
  const { db, updates } = fakeDb([pickup()]);
  const pushes: number[] = [];
  const res = await dispatchCheckIns(db, t0 + 6 * MIN, async (p) => {
    pushes.push(p.markIndex);
  });
  assert.equal(res.nudged, 1);
  assert.deepEqual(pushes, [1]);
  assert.equal(updates["pk1"].nudgesSent, 1);
});

test("dispatchCheckIns: idempotent — already-sent marks don't re-push", async () => {
  const { db } = fakeDb([pickup({ nudgesSent: 1 })]);
  const pushes: number[] = [];
  const res = await dispatchCheckIns(db, t0 + 6 * MIN, async (p) => {
    pushes.push(p.markIndex);
  });
  assert.equal(res.nudged, 0);
  assert.deepEqual(pushes, []);
});

test("dispatchCheckIns: catches up both marks after a gap", async () => {
  const { db, updates } = fakeDb([pickup({ nudgesSent: 0 })]);
  const pushes: number[] = [];
  const res = await dispatchCheckIns(db, t0 + 11 * MIN, async (p) => {
    pushes.push(p.markIndex);
  });
  assert.equal(res.nudged, 2);
  assert.deepEqual(pushes, [1, 2]);
  assert.equal(updates["pk1"].nudgesSent, 2);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module './checkins'`.

- [ ] **Step 3: Implement `dispatchCheckIns`**

Create `lib/checkins.ts`:

```ts
import { prisma } from "./prisma";
import { dueNudgeCount } from "./checkin-marks";
import { sendCheckInPush } from "./notify";

// A structural slice of the Prisma client — just the methods these functions
// touch. Lets tests inject a fake db without standing up a database.
type Db = Pick<
  typeof prisma,
  "pickup" | "foodListing" | "listingEvent" | "$transaction"
>;

/**
 * Fire any due check-up nudges for active claims. Idempotent: tracks how many
 * marks it has already dispatched via Pickup.nudgesSent, so repeated cron runs
 * never double-notify. Marks at 5 and 10 min; the 15-min auto-cancel is the
 * sweep's job, not ours.
 */
export async function dispatchCheckIns(
  db: Db = prisma,
  now: number = Date.now(),
  notify = sendCheckInPush
): Promise<{ nudged: number }> {
  const pickups = await db.pickup.findMany({
    where: { listing: { status: "claimed" } },
    include: { listing: true },
  });

  let nudged = 0;
  for (const p of pickups) {
    const due = dueNudgeCount(p.claimedAt.getTime(), now);
    if (due <= p.nudgesSent) continue;
    for (let markIndex = p.nudgesSent + 1; markIndex <= due; markIndex++) {
      await notify({
        pickupId: p.id,
        listingId: p.listingId,
        volunteerId: p.volunteerId,
        listingTitle: p.listing.title,
        markIndex,
      });
      nudged++;
    }
    await db.pickup.update({ where: { id: p.id }, data: { nudgesSent: due } });
  }
  return { nudged };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: PASS — all dispatch tests pass (plus Task 1's still passing).

- [ ] **Step 5: Commit**

```bash
git add lib/checkins.ts lib/checkins.test.ts
git commit -m "feat: idempotent check-in dispatcher driven by nudgesSent"
```

---

## Task 5: Confirm and release core logic

**Files:**
- Modify: `lib/checkins.ts` (add two functions)
- Modify: `lib/checkins.test.ts` (add tests)

- [ ] **Step 1: Write the failing tests**

Append to `lib/checkins.test.ts`:

```ts
import { confirmCheckInFor, releaseClaimFor } from "./checkins";

function txDb(pickupRow: any) {
  const calls: any = { updated: null, deleted: false, listing: null, events: [] };
  const db: any = {
    pickup: {
      findUnique: async () => pickupRow,
      update: async ({ data }: any) => {
        calls.updated = data;
        return pickupRow;
      },
      delete: async () => {
        calls.deleted = true;
        return pickupRow;
      },
    },
    foodListing: {
      update: async ({ data }: any) => {
        calls.listing = data;
        return {};
      },
    },
    listingEvent: {
      create: async ({ data }: any) => {
        calls.events.push(data);
        return data;
      },
    },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  };
  return { db, calls };
}

test("confirmCheckInFor: stamps lastCheckInAt and logs checked_in, never touches the hold", async () => {
  const { db, calls } = txDb({
    volunteerId: "vol1",
    listing: { status: "claimed" },
  });
  await confirmCheckInFor(db, "vol1", "ls1", t0);
  assert.equal(calls.updated.lastCheckInAt.getTime(), t0);
  assert.equal("holdUntil" in calls.updated, false);
  assert.equal(calls.events[0].type, "checked_in");
});

test("confirmCheckInFor: rejects a non-owner", async () => {
  const { db } = txDb({ volunteerId: "vol1", listing: { status: "claimed" } });
  await assert.rejects(
    () => confirmCheckInFor(db, "intruder", "ls1", t0),
    /no longer active/
  );
});

test("releaseClaimFor: reopens the listing and logs withdrawn (not a flake)", async () => {
  const { db, calls } = txDb({
    volunteerId: "vol1",
    listing: { status: "claimed" },
  });
  await releaseClaimFor(db, "vol1", "ls1");
  assert.equal(calls.deleted, true);
  assert.equal(calls.listing.status, "open");
  assert.equal(calls.events[0].type, "withdrawn");
  assert.equal(calls.events[0].meta.reason, "volunteer_released");
});

test("releaseClaimFor: rejects when the claim was already swept", async () => {
  const { db } = txDb({ volunteerId: "vol1", listing: { status: "open" } });
  await assert.rejects(
    () => releaseClaimFor(db, "vol1", "ls1"),
    /no longer active/
  );
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `confirmCheckInFor`/`releaseClaimFor` are not exported.

- [ ] **Step 3: Implement both functions**

Append to `lib/checkins.ts`:

```ts
/** Guard: load the active claim for this listing owned by this user, or throw. */
async function loadOwnedClaim(db: Db, userId: string, listingId: string) {
  const pickup = await db.pickup.findUnique({
    where: { listingId },
    include: { listing: true },
  });
  if (
    !pickup ||
    pickup.volunteerId !== userId ||
    pickup.listing.status !== "claimed"
  ) {
    throw new Error("This pickup is no longer active.");
  }
  return pickup;
}

/** Record a liveness confirmation. Does NOT extend the hold (liveness-only). */
export async function confirmCheckInFor(
  db: Db,
  userId: string,
  listingId: string,
  now: number = Date.now()
): Promise<void> {
  await loadOwnedClaim(db, userId, listingId);
  await db.$transaction([
    db.pickup.update({
      where: { listingId },
      data: { lastCheckInAt: new Date(now) },
    }),
    db.listingEvent.create({
      data: { listingId, type: "checked_in", actorId: userId },
    }),
  ]);
}

/** Voluntarily release a claim — reopens the listing; logged non-punitively. */
export async function releaseClaimFor(
  db: Db,
  userId: string,
  listingId: string
): Promise<void> {
  await loadOwnedClaim(db, userId, listingId);
  await db.$transaction([
    db.pickup.delete({ where: { listingId } }),
    db.foodListing.update({
      where: { id: listingId },
      data: { status: "open" },
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
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — all tests across both files pass.

- [ ] **Step 5: Commit**

```bash
git add lib/checkins.ts lib/checkins.test.ts
git commit -m "feat: confirmCheckInFor and releaseClaimFor with ownership guards"
```

---

## Task 6: Server-action wrappers

**Files:**
- Modify: `app/actions.ts`

> Thin wrappers over Task 5's tested core; no separate test (they only resolve
> the session user and revalidate, both existing patterns).

- [ ] **Step 1: Add the import**

In `app/actions.ts`, after the existing `import { prisma } from "@/lib/prisma";` line, add:

```ts
import { confirmCheckInFor, releaseClaimFor } from "@/lib/checkins";
```

- [ ] **Step 2: Add the two server actions**

In `app/actions.ts`, after the `claimListing` function (around line 116), add:

```ts
/** Record a "still on it" check-up confirmation for the caller's claim. */
export async function confirmCheckIn(listingId: string) {
  const userId = await currentUserId();
  await confirmCheckInFor(prisma, userId, listingId);
  refreshViews(listingId);
}

/** Voluntarily release the caller's claim, reopening the listing. */
export async function releaseClaim(listingId: string) {
  const userId = await currentUserId();
  await releaseClaimFor(prisma, userId, listingId);
  refreshViews(listingId);
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add app/actions.ts
git commit -m "feat: confirmCheckIn and releaseClaim server actions"
```

---

## Task 7: Wire the dispatcher into the cron sweep

**Files:**
- Modify: `app/api/cron/sweep/route.ts`

- [ ] **Step 1: Update the route**

Replace the body of `app/api/cron/sweep/route.ts` with:

```ts
import { NextResponse } from "next/server";
import { runSweep } from "@/lib/sweep";
import { dispatchCheckIns } from "@/lib/checkins";

export const dynamic = "force-dynamic";

// Hit by Vercel Cron (which sends `Authorization: Bearer $CRON_SECRET`) or any
// external scheduler. If CRON_SECRET is set, the header must match.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Sweep FIRST so any just-expired hold is released before the nudge pass —
  // a claim that's both due for a nudge and past its hold is released, not nudged.
  const swept = await runSweep();
  const checkins = await dispatchCheckIns();
  return NextResponse.json({ ok: true, ...swept, ...checkins });
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/cron/sweep/route.ts
git commit -m "feat: dispatch check-in nudges from the cron sweep"
```

---

## Task 8: Surface claim timing to the client

**Files:**
- Modify: `lib/types.ts` (the `Listing` interface)
- Modify: `lib/listings.ts` (`serializeListing`, `getListings`, `getListing`)
- Modify: `app/listings/[id]/page.tsx`

> No unit test — serialization is verified end-to-end in Task 10's manual check.

- [ ] **Step 1: Extend the `Listing` interface**

In `lib/types.ts`, inside `interface Listing`, add these fields after `imageUrl?: string;`:

```ts
  /** Epoch ms when the active claim was made (present when claimed/in transit). */
  claimedAt?: number;
  /** Epoch ms of the 15-min auto-release deadline. */
  holdUntil?: number;
  /** Epoch ms of the volunteer's last check-up confirmation, if any. */
  lastCheckInAt?: number;
  /** True when the current viewer is the volunteer who claimed it. */
  mine?: boolean;
```

- [ ] **Step 2: Serialize the new fields**

In `lib/listings.ts`, change the `serializeListing` signature and add the fields.

Change the signature line:

```ts
export function serializeListing(l: DbListing, viewerId?: string): Listing {
```

Inside the returned object, after `imageUrl: l.imageUrl ?? l.restaurant.imageUrl ?? undefined,` add:

```ts
    claimedAt: l.pickup?.claimedAt.getTime(),
    holdUntil: l.pickup?.holdUntil.getTime(),
    lastCheckInAt: l.pickup?.lastCheckInAt?.getTime(),
    mine: viewerId != null && l.pickup?.volunteerId === viewerId,
```

- [ ] **Step 3: Thread `viewerId` through the fetchers**

In `lib/listings.ts`, update `getListings` and `getListing`:

```ts
export async function getListings(viewerId?: string): Promise<Listing[]> {
  const rows = await prisma.foodListing.findMany({
    include: listingInclude,
    orderBy: { expiresAt: "asc" },
  });
  return rows.map((r) => serializeListing(r, viewerId));
}

export async function getListing(
  id: string,
  viewerId?: string
): Promise<Listing | null> {
  const row = await prisma.foodListing.findUnique({
    where: { id },
    include: listingInclude,
  });
  return row ? serializeListing(row, viewerId) : null;
}
```

> Note: `getRestaurantDetail` / `getDropOffDetail` call `serializeListing(row)`
> with one argument — that still type-checks because `viewerId` is optional, so
> leave them unchanged (`mine` is simply `false` there, which is correct).

- [ ] **Step 4: Pass the session user id from the detail page**

Replace `app/listings/[id]/page.tsx` with:

```tsx
import { ListingDetail } from "@/components/ListingDetail";
import { getListing } from "@/lib/listings";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

export default async function ListingDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await auth();
  const listing = await getListing(params.id, session?.user?.id);

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <ListingDetail listing={listing} />
    </main>
  );
}
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/listings.ts "app/listings/[id]/page.tsx"
git commit -m "feat: surface claim timing and ownership to the client"
```

---

## Task 9: Check-up prompt component

**Files:**
- Create: `components/CheckInPrompt.tsx`
- Modify: `components/ListingDetail.tsx`

> No unit test — all risky logic lives in the tested `checkin-marks` module; this
> is a thin presentational shell, verified in Task 10's manual check.

- [ ] **Step 1: Create the component**

Create `components/CheckInPrompt.tsx`:

```tsx
"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "./Button";
import { Toast, useToast } from "./Toast";
import { Clock } from "./icons";
import { activeMark, formatCountdown } from "@/lib/checkin-marks";
import { confirmCheckIn, releaseClaim } from "@/app/actions";

export function CheckInPrompt({
  listingId,
  claimedAt,
  holdUntil,
  lastCheckInAt,
}: {
  listingId: string;
  claimedAt: number;
  holdUntil: number;
  lastCheckInAt?: number;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [isPending, startTransition] = useTransition();
  const { message, show } = useToast();

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const remaining = holdUntil - now;
  const mark = activeMark(claimedAt, lastCheckInAt ?? null, now);

  function onConfirm() {
    startTransition(async () => {
      try {
        await confirmCheckIn(listingId);
        show("Thanks — still yours.");
      } catch {
        show("This pickup is no longer active.");
      }
    });
  }

  function onRelease() {
    startTransition(async () => {
      try {
        await releaseClaim(listingId);
        show("Released — back on the feed for someone else.");
      } catch {
        show("This pickup is no longer active.");
      }
    });
  }

  return (
    <div className="rounded-xl border border-neutral-200/40 bg-white p-5">
      <p className="mb-3 font-mono text-[10px] uppercase tracking-wide text-neutral-600">
        Check-up
      </p>
      <p className="flex items-center gap-2 font-mono text-sm text-neutral-700">
        <span className="text-neutral-400">
          <Clock />
        </span>
        auto-releases in {formatCountdown(remaining)}
      </p>

      {mark !== null && (
        <div className="mt-4 rounded-md bg-urgent-50 px-4 py-3">
          <p className="text-sm font-medium text-urgent-800">
            Still picking this up?
          </p>
          <p className="mt-0.5 text-[13px] text-urgent-800/80">
            Confirm so we know you&apos;re on it — or release it for someone else.
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              variant="primary"
              className="flex-1"
              onClick={onConfirm}
              disabled={isPending}
            >
              Still on it
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              onClick={onRelease}
              disabled={isPending}
            >
              I can&apos;t make it
            </Button>
          </div>
        </div>
      )}

      <Toast message={message} />
    </div>
  );
}
```

- [ ] **Step 2: Render it in `ListingDetail`**

In `components/ListingDetail.tsx`, add the import after the existing `import { advanceListing, claimListing } from "@/app/actions";` line:

```tsx
import { CheckInPrompt } from "./CheckInPrompt";
```

Then, inside the `aside`, immediately after the closing `</div>` of the "Next step" card (the block that ends the `{!terminal && ( ... )}` section) and before `</aside>`, add:

```tsx
          {listing.status === "claimed" &&
            listing.mine &&
            listing.claimedAt != null &&
            listing.holdUntil != null && (
              <CheckInPrompt
                listingId={listing.id}
                claimedAt={listing.claimedAt}
                holdUntil={listing.holdUntil}
                lastCheckInAt={listing.lastCheckInAt}
              />
            )}
```

- [ ] **Step 3: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add components/CheckInPrompt.tsx components/ListingDetail.tsx
git commit -m "feat: check-up prompt with countdown, confirm, and release"
```

---

## Task 10: Manual end-to-end verification

**Files:** none (manual). Requires a working `.env` and a seeded DB.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Expected: server on `http://localhost:3000`, compiles cleanly.

- [ ] **Step 2: Claim a listing as a volunteer**

Sign in as a volunteer, open a listing, click "Claim pickup".
Expected: status flips to `claimed`; the "Check-up" card appears in the sidebar with a live "auto-releases in 14:5x" countdown ticking down each second. No prompt yet.

- [ ] **Step 3: Force the prompt (simulate the 5-min mark)**

To avoid waiting 5 minutes, in a DB client (or `npm run db:studio`) set the active `Pickup.claimedAt` back 6 minutes, then reload the listing page.
Expected: the honey prompt "Still picking this up?" appears with "Still on it" and "I can't make it".

- [ ] **Step 4: Confirm**

Click "Still on it".
Expected: toast "Thanks — still yours."; the prompt disappears (a `checked_in` event is written; `lastCheckInAt` now suppresses the 5-min mark). Push the `claimedAt` back to 11 minutes and reload → the prompt returns for the 10-min mark.

- [ ] **Step 5: Release**

Click "I can't make it".
Expected: toast "Released — back on the feed…"; the listing returns to `open` and reappears in the feed; a `withdrawn` event is logged. Confirm on `/impact` (or via stats) that reliability is unaffected by the release.

- [ ] **Step 6: Exercise the dispatcher**

Run: `curl -s http://localhost:3000/api/cron/sweep` (or with `-H "Authorization: Bearer $CRON_SECRET"` if set).
Expected: JSON like `{ ok: true, released, expired, at, nudged }`; the dev console logs `[check-in] would push …` lines for any claim past a fresh mark; re-running immediately yields `nudged: 0` (idempotent).

- [ ] **Step 7: Final commit (if any manual tweaks were needed)**

```bash
git add -A
git commit -m "chore: check-up confirmations verified end-to-end" --allow-empty
```

---

## Self-review notes

- **Spec coverage:** check-up at 5/10 (Tasks 1,4,9) · liveness-only, hold untouched (Task 5 test asserts no `holdUntil`) · 15-min auto-cancel unchanged (untouched `runSweep`) · in-app prompt (Task 9) · push seam (Task 3) · voluntary release (Tasks 5,6,9) · `withdrawn` excluded from reliability (no change to `stats.ts`, which only filters `delivered`/`released`/`failed`) · server-tracked `nudgesSent` (Task 2) · detail-page-only surface (Task 9). All covered.
- **Push live-send** is intentionally out of scope (seam only), per the spec.
- **Reliability math** is deliberately untouched; `withdrawn` is simply absent from the existing filter, which is the non-punitive behavior.
