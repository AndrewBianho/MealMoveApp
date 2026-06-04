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
