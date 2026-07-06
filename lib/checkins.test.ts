// Test doubles below stand in for the Prisma client; `any` keeps the fakes
// lightweight (we only implement the handful of methods under test).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { test } from "node:test";
import assert from "node:assert/strict";
import { releaseClaimFor } from "./checkins";

function txDb(pickupRow: any) {
  const pickup = pickupRow
    ? { id: "pk1", buddyId: null, photoAtPickupUrl: null, ...pickupRow }
    : null;
  const calls: any = { updated: null, deleted: false, listing: null, events: [], invitesCancelled: null };
  const db: any = {
    pickup: {
      findFirst: async () => pickup,
      update: async ({ data }: any) => {
        calls.updated = data;
        return pickup;
      },
      delete: async () => {
        calls.deleted = true;
        return pickup;
      },
      // The sole-volunteer release checks for other cars before clearing the
      // listing's drop-off; these single-claim fixtures never have any.
      count: async () => 0,
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
    buddyInvite: {
      updateMany: async ({ data }: any) => {
        calls.invitesCancelled = data.status;
        return { count: 1 };
      },
    },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  };
  return { db, calls };
}

test("releaseClaimFor: reopens the listing and logs withdrawn (not a flake)", async () => {
  const { db, calls } = txDb({
    volunteerId: "vol1",
    listing: { status: "claimed" },
  });
  await releaseClaimFor(db, "vol1", "ls1");
  assert.equal(calls.deleted, true);
  assert.equal(calls.listing.status, "open");
  // The destination was the claimer's choice — it leaves with the claim.
  assert.equal(calls.listing.dropOffId, null);
  assert.equal(calls.invitesCancelled, "cancelled"); // stale invites cleared
  assert.equal(calls.events[0].type, "withdrawn");
  assert.equal(calls.events[0].meta.reason, "volunteer_released");
});

test("releaseClaimFor: rejects when the claim was already swept", async () => {
  // The sweep deletes the pickup row — there's nothing left to release.
  const { db } = txDb(null);
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
