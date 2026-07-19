// Test doubles below stand in for the Prisma client; `any` keeps the fakes
// lightweight (we only implement the handful of methods under test).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  startDeliveryWithPhotoFor,
  markDeliveredWithPhotoFor,
  recordRescueAccuracyFor,
} from "./photos";

const t0 = 1_000_000_000_000;

// The claim's stage now lives on the pickup row (photo/taken-home/delivered
// stamps), not the listing status — seed the stamps that match the fixture's
// listing status so the old status-driven fixtures keep describing the same
// scenario.
function stageStamps(status?: string) {
  switch (status) {
    case "in_transit":
      return { photoAtPickupUrl: "https://x/seed.jpg" };
    case "taken_home":
      return { photoAtPickupUrl: "https://x/seed.jpg", takenHomeAt: new Date(t0) };
    case "delivered":
      return { photoAtPickupUrl: "https://x/seed.jpg", deliveredAt: new Date(t0) };
    default:
      return {};
  }
}

function txDb(pickupRow: any) {
  const pickup: any = {
    id: "pk1",
    buddyId: null,
    photoAtPickupUrl: null,
    takenHomeAt: null,
    deliveredAt: null,
    ...stageStamps(pickupRow.listing?.status),
    ...pickupRow,
    listing: { carsNeeded: null, ...pickupRow.listing },
  };
  pickup.listing.pickups = [pickup];
  const calls: any = { pickup: null, listing: null, events: [], messages: [] };
  const db: any = {
    pickup: {
      findFirst: async () => pickup,
      update: async ({ data }: any) => {
        calls.pickup = { ...(calls.pickup ?? {}), ...data };
        return pickup;
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
    message: {
      create: async ({ data }: any) => {
        calls.messages.push(data);
        return data;
      },
    },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  };
  return { db, calls };
}

test("startDeliveryWithPhotoFor: stores the pickup photo, advances to in_transit, logs both events", async () => {
  const { db, calls } = txDb({
    volunteerId: "vol1",
    listing: { status: "claimed" },
  });
  await startDeliveryWithPhotoFor(db, "vol1", "ls1", "https://x/p.jpg");
  assert.equal(calls.pickup.photoAtPickupUrl, "https://x/p.jpg");
  assert.equal(calls.listing.status, "in_transit");
  assert.deepEqual(
    calls.events.map((e: any) => e.type),
    ["photo_at_pickup", "in_transit"]
  );
  assert.equal(calls.events[0].meta.photoUrl, "https://x/p.jpg");
});

test("startDeliveryWithPhotoFor: requires a photo", async () => {
  const { db } = txDb({ volunteerId: "vol1", listing: { status: "claimed" } });
  await assert.rejects(
    () => startDeliveryWithPhotoFor(db, "vol1", "ls1", "  "),
    /pickup photo is required/
  );
});

test("startDeliveryWithPhotoFor: rejects a non-owner", async () => {
  const { db } = txDb({ volunteerId: "vol1", listing: { status: "claimed" } });
  await assert.rejects(
    () => startDeliveryWithPhotoFor(db, "intruder", "ls1", "https://x/p.jpg"),
    /no longer active/
  );
});

test("startDeliveryWithPhotoFor: rejects when not in claimed status", async () => {
  const { db } = txDb({
    volunteerId: "vol1",
    listing: { status: "in_transit" },
  });
  await assert.rejects(
    () => startDeliveryWithPhotoFor(db, "vol1", "ls1", "https://x/p.jpg"),
    /no longer active/
  );
});

test("startDeliveryWithPhotoFor: notifies the drop-off that food is on its way", async () => {
  const { db } = txDb({
    volunteerId: "vol1",
    listing: {
      status: "claimed",
      title: "Bagels",
      dropOff: { id: "d1", name: "Shelter Kitchen" },
    },
  });
  const notices: any[] = [];
  await startDeliveryWithPhotoFor(db, "vol1", "ls1", "https://x/p.jpg", null, async (n) => {
    notices.push(n);
  });
  assert.equal(notices.length, 1);
  assert.equal(notices[0].dropOffId, "d1");
  assert.equal(notices[0].dropOffName, "Shelter Kitchen");
  assert.equal(notices[0].listingTitle, "Bagels");
});

test("startDeliveryWithPhotoFor: posts a pickup update into the coordination thread", async () => {
  const { db, calls } = txDb({
    volunteerId: "vol1",
    listing: {
      status: "claimed",
      title: "Bagels",
      dropOff: { id: "d1", name: "Shelter Kitchen" },
    },
  });
  // Inject a no-op notify: this test covers thread-posting, not the drop-off
  // notice, and the real dispatch would query the database (unavailable in CI).
  await startDeliveryWithPhotoFor(db, "vol1", "ls1", "https://x/p.jpg", null, async () => {});
  assert.equal(calls.messages.length, 1);
  assert.equal(calls.messages[0].senderId, "vol1");
  assert.equal(calls.messages[0].listingId, "ls1");
  assert.match(calls.messages[0].body, /Picked up.*Shelter Kitchen/);
});

test("startDeliveryWithPhotoFor: no drop-off notice when none is assigned yet, but still posts to the thread", async () => {
  const { db, calls } = txDb({
    volunteerId: "vol1",
    listing: { status: "claimed", title: "Bagels", dropOff: null },
  });
  const notices: any[] = [];
  await startDeliveryWithPhotoFor(db, "vol1", "ls1", "https://x/p.jpg", null, async (n) => {
    notices.push(n);
  });
  assert.equal(notices.length, 0);
  assert.equal(calls.messages.length, 1);
  assert.match(calls.messages[0].body, /Picked up — on the way now/);
});

test("markDeliveredWithPhotoFor: stores the delivery photo, stamps deliveredAt, completes", async () => {
  const { db, calls } = txDb({
    volunteerId: "vol1",
    listing: { status: "in_transit" },
  });
  await markDeliveredWithPhotoFor(db, "vol1", "ls1", "https://x/d.jpg", t0);
  assert.equal(calls.pickup.photoAtDeliveryUrl, "https://x/d.jpg");
  assert.equal(calls.pickup.deliveredAt.getTime(), t0);
  assert.equal(calls.listing.status, "delivered");
  assert.deepEqual(
    calls.events.map((e: any) => e.type),
    ["photo_at_delivery", "delivered"]
  );
});

test("markDeliveredWithPhotoFor: requires a photo", async () => {
  const { db } = txDb({
    volunteerId: "vol1",
    listing: { status: "in_transit" },
  });
  await assert.rejects(
    () => markDeliveredWithPhotoFor(db, "vol1", "ls1", ""),
    /delivery photo is required/
  );
});

test("markDeliveredWithPhotoFor: rejects when not in_transit", async () => {
  const { db } = txDb({ volunteerId: "vol1", listing: { status: "claimed" } });
  await assert.rejects(
    () => markDeliveredWithPhotoFor(db, "vol1", "ls1", "https://x/d.jpg"),
    /no longer active/
  );
});

test("recordRescueAccuracyFor: saves the signal + note on a delivered pickup and logs it", async () => {
  const { db, calls } = txDb({
    volunteerId: "vol1",
    listing: { status: "delivered" },
  });
  await recordRescueAccuracyFor(db, "vol1", "ls1", "partly", "  half the trays were gone  ");
  assert.equal(calls.pickup.rescueAccuracy, "partly");
  assert.equal(calls.pickup.rescueAccuracyNote, "half the trays were gone");
  assert.deepEqual(
    calls.events.map((e: any) => e.type),
    ["rescue_accuracy"]
  );
  assert.equal(calls.events[0].meta.accuracy, "partly");
});

test("recordRescueAccuracyFor: a buddy can record it; an empty note stores null", async () => {
  const { db, calls } = txDb({
    volunteerId: "vol1",
    buddyId: "vol2",
    listing: { status: "delivered" },
  });
  await recordRescueAccuracyFor(db, "vol2", "ls1", "yes", "   ");
  assert.equal(calls.pickup.rescueAccuracy, "yes");
  assert.equal(calls.pickup.rescueAccuracyNote, null);
});

test("recordRescueAccuracyFor: rejects a bad value, a non-owner, and a too-early status", async () => {
  await assert.rejects(
    () =>
      recordRescueAccuracyFor(
        txDb({ volunteerId: "vol1", listing: { status: "delivered" } }).db,
        "vol1",
        "ls1",
        "maybe"
      ),
    /as described/
  );
  await assert.rejects(
    () =>
      recordRescueAccuracyFor(
        txDb({ volunteerId: "vol1", listing: { status: "delivered" } }).db,
        "intruder",
        "ls1",
        "yes"
      ),
    /isn't ready/
  );
  await assert.rejects(
    () =>
      recordRescueAccuracyFor(
        txDb({ volunteerId: "vol1", listing: { status: "claimed" } }).db,
        "vol1",
        "ls1",
        "yes"
      ),
    /isn't ready/
  );
});

test("markDeliveredWithPhotoFor: a buddy can capture the photo, and both seats get delivery credit", async () => {
  const { db, calls } = txDb({
    volunteerId: "vol1",
    buddyId: "vol2",
    listing: { status: "in_transit" },
  });
  // The buddy (vol2), not the primary, marks it delivered.
  await markDeliveredWithPhotoFor(db, "vol2", "ls1", "https://x/d.jpg", t0);
  assert.deepEqual(
    calls.events.map((e: any) => e.type),
    ["photo_at_delivery", "delivered", "delivered"]
  );
  // The photo is credited to whoever captured it (vol2); delivery credit goes
  // to both seats so reliability counts both volunteers.
  assert.equal(calls.events[0].actorId, "vol2");
  const credited = calls.events
    .filter((e: any) => e.type === "delivered")
    .map((e: any) => e.actorId)
    .sort();
  assert.deepEqual(credited, ["vol1", "vol2"]);
});

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
