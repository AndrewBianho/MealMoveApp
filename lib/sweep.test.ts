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
