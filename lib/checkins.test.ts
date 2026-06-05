// Test doubles below stand in for the Prisma client; `any` keeps the fakes
// lightweight (we only implement the handful of methods under test).
/* eslint-disable @typescript-eslint/no-explicit-any */
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

test("releaseClaimFor: the buddy steps off — claim stays claimed, partner covers", async () => {
  const { db, calls } = txDb({
    volunteerId: "vol1",
    buddyId: "vol2",
    listing: { status: "claimed" },
  });
  await releaseClaimFor(db, "vol2", "ls1");
  assert.equal(calls.deleted, false); // food not reopened
  assert.equal(calls.listing, null);
  assert.equal(calls.updated.buddyId, null); // buddy seat cleared
  assert.equal(calls.events[0].type, "buddy_withdrawn");
});

test("releaseClaimFor: the primary steps off — buddy is promoted, claim stays claimed", async () => {
  const { db, calls } = txDb({
    volunteerId: "vol1",
    buddyId: "vol2",
    listing: { status: "claimed" },
  });
  await releaseClaimFor(db, "vol1", "ls1");
  assert.equal(calls.deleted, false);
  assert.equal(calls.listing, null);
  assert.equal(calls.updated.volunteerId, "vol2"); // buddy promoted
  assert.equal(calls.updated.buddyId, null);
  assert.equal(calls.events[0].type, "withdrawn");
  assert.equal(calls.events[0].meta.promotedBuddy, "vol2");
});
