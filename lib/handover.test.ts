// Test doubles below stand in for the Prisma client; `any` keeps the fakes
// lightweight (we only implement the handful of methods under test).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { test } from "node:test";
import assert from "node:assert/strict";
import { markArrivedFor, confirmReceiptFor, ARRIVED, RECEIVED } from "./handover";

// --- arrival ---------------------------------------------------------------

function arrivalDb(
  opts: { status?: string; pickedUp?: boolean; existingArrival?: boolean } = {}
) {
  const events: any[] = [];
  const messages: any[] = [];
  const pickup: any = {
    id: "pk1",
    volunteerId: "vol1",
    buddyId: null,
    claimedAt: new Date(),
    // pickupStage reads the pickup's own fields, not the listing status: a
    // claim with no pickup photo is still at "claimed".
    photoAtPickupUrl: opts.pickedUp === false ? null : "https://x/p.jpg",
    takenHomeAt: null,
    deliveredAt: null,
    listing: {
      id: "ls1",
      status: opts.status ?? "in_transit",
      carsNeeded: null,
      dropOff: { name: "St. Mark's Shelter" },
    },
  };
  pickup.listing.pickups = [pickup];
  const db: any = {
    pickup: { findFirst: async () => pickup },
    listingEvent: {
      findFirst: async () => (opts.existingArrival ? { id: "ev0" } : null),
      create: async ({ data }: any) => {
        events.push(data);
        return data;
      },
    },
    message: {
      create: async ({ data }: any) => {
        messages.push(data);
        return data;
      },
    },
    foodListing: { update: async () => ({}) },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  };
  return { db, events, messages };
}

test("markArrivedFor: records the arrival and tells the thread where they are", async () => {
  const { db, events, messages } = arrivalDb();
  const res = await markArrivedFor(db, "vol1", "ls1");

  assert.equal(res.alreadyArrived, false);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, ARRIVED);
  assert.equal(events[0].actorId, "vol1");
  assert.match(messages[0].body, /St\. Mark's Shelter/);
});

test("markArrivedFor: arriving twice records once", async () => {
  const { db, events, messages } = arrivalDb({ existingArrival: true });
  const res = await markArrivedFor(db, "vol1", "ls1");

  assert.equal(res.alreadyArrived, true);
  assert.equal(events.length, 0, "no second event");
  assert.equal(messages.length, 0, "and no second message in the thread");
});

test("markArrivedFor: rejects someone who isn't on the claim", async () => {
  const { db } = arrivalDb();
  await assert.rejects(() => markArrivedFor(db, "intruder", "ls1"), /no longer active/);
});

test("markArrivedFor: rejects a rescue that hasn't been picked up yet", async () => {
  const { db } = arrivalDb({ status: "claimed", pickedUp: false });
  await assert.rejects(() => markArrivedFor(db, "vol1", "ls1"), /no longer active/);
});

// --- receipt ---------------------------------------------------------------

function receiptDb(opts: { status?: string; existingReceipt?: boolean } = {}) {
  const events: any[] = [];
  const db: any = {
    foodListing: {
      findUnique: async () => ({
        id: "ls1",
        status: opts.status ?? "delivered",
        dropOffId: "do1",
      }),
    },
    listingEvent: {
      findFirst: async () => (opts.existingReceipt ? { id: "ev0" } : null),
      create: async ({ data }: any) => {
        events.push(data);
        return data;
      },
    },
  };
  return { db, events };
}

const theDropOff = { id: "u-do", role: "drop_off", dropOffId: "do1" };

test("confirmReceiptFor: the listing's own drop-off can acknowledge", async () => {
  const { db, events } = receiptDb();
  const res = await confirmReceiptFor(db, theDropOff, "ls1");

  assert.equal(res.alreadyConfirmed, false);
  assert.equal(events[0].type, RECEIVED);
  assert.equal(events[0].actorId, "u-do");
});

test("confirmReceiptFor: a different drop-off cannot acknowledge someone else's", async () => {
  const { db, events } = receiptDb();
  await assert.rejects(
    () => confirmReceiptFor(db, { id: "u-x", role: "drop_off", dropOffId: "do2" }, "ls1"),
    /Only the drop-off/
  );
  assert.equal(events.length, 0);
});

test("confirmReceiptFor: a volunteer cannot acknowledge on the drop-off's behalf", async () => {
  const { db } = receiptDb();
  await assert.rejects(
    () => confirmReceiptFor(db, { id: "vol1", role: "volunteer", dropOffId: null }, "ls1"),
    /Only the drop-off/
  );
});

test("confirmReceiptFor: an org admin may acknowledge for the chapter", async () => {
  const { db, events } = receiptDb();
  await confirmReceiptFor(db, { id: "adm", role: "org_admin", dropOffId: null }, "ls1");
  assert.equal(events.length, 1);
});

test("confirmReceiptFor: nothing to receive before it is delivered", async () => {
  const { db } = receiptDb({ status: "in transit" });
  await assert.rejects(() => confirmReceiptFor(db, theDropOff, "ls1"), /hasn't been delivered/);
});

test("confirmReceiptFor: acknowledging twice records once", async () => {
  const { db, events } = receiptDb({ existingReceipt: true });
  const res = await confirmReceiptFor(db, theDropOff, "ls1");

  assert.equal(res.alreadyConfirmed, true);
  assert.equal(events.length, 0);
});
