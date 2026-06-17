// Test doubles below stand in for the Prisma client; `any` keeps the fakes
// lightweight (we only implement the handful of methods under test).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  startDeliveryWithPhotoFor,
  markDeliveredWithPhotoFor,
} from "./photos";

const t0 = 1_000_000_000_000;

function txDb(pickupRow: any) {
  const calls: any = { pickup: null, listing: null, events: [], messages: [] };
  const db: any = {
    pickup: {
      findUnique: async () => pickupRow,
      update: async ({ data }: any) => {
        calls.pickup = { ...(calls.pickup ?? {}), ...data };
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
  await startDeliveryWithPhotoFor(db, "vol1", "ls1", "https://x/p.jpg", async (n) => {
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
  await startDeliveryWithPhotoFor(db, "vol1", "ls1", "https://x/p.jpg", async () => {});
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
  await startDeliveryWithPhotoFor(db, "vol1", "ls1", "https://x/p.jpg", async (n) => {
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
