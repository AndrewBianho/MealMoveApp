// Test doubles below stand in for the Prisma client; `any` keeps the fakes
// lightweight (we only implement the handful of methods under test).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isOnClaim,
  invitableVolunteers,
  inviteBuddyFor,
  respondToInviteFor,
  cancelInviteFor,
} from "./buddies";

const t0 = 1_000_000_000_000;

// A configurable fake covering the delegates buddies.ts touches.
function fakeDb(opts: any = {}) {
  const calls: any = {
    events: [],
    upserts: [],
    inviteUpdates: [],
    pickupUpdates: [],
  };
  const db: any = {
    pickup: {
      findUnique: async () => opts.pickup ?? null,
      update: async ({ data }: any) => {
        calls.pickupUpdates.push(data);
        if (opts.pickup) Object.assign(opts.pickup, data);
        return opts.pickup;
      },
    },
    buddyInvite: {
      findUnique: async ({ where }: any) =>
        opts.invite && opts.invite.id === where.id ? opts.invite : null,
      findFirst: async () => opts.outstanding ?? null,
      findMany: async () => opts.pendingInvites ?? [],
      upsert: async ({ create }: any) => {
        calls.upserts.push(create);
        return { id: "inv1", ...create };
      },
      update: async ({ data }: any) => {
        calls.inviteUpdates.push(data);
        if (opts.invite) Object.assign(opts.invite, data);
        return opts.invite;
      },
    },
    user: {
      findUnique: async ({ where }: any) => opts.users?.[where.id] ?? null,
      findMany: async ({ where }: any) => {
        const notIn = new Set<string>(where.id?.notIn ?? []);
        return (opts.allVolunteers ?? []).filter((u: any) => !notIn.has(u.id));
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

const noNotify = async () => {};

test("isOnClaim: matches the primary volunteer or the buddy, no one else", () => {
  const pk = { volunteerId: "vol1", buddyId: "vol2" };
  assert.equal(isOnClaim(pk, "vol1"), true);
  assert.equal(isOnClaim(pk, "vol2"), true);
  assert.equal(isOnClaim(pk, "other"), false);
  assert.equal(isOnClaim({ volunteerId: "vol1", buddyId: null }, "vol2"), false);
});

test("invitableVolunteers: excludes the inviter, the current buddy, and pending invitees", async () => {
  const { db } = fakeDb({
    pickup: { buddyId: "volB" },
    pendingInvites: [{ inviteeId: "volC" }],
    allVolunteers: [
      { id: "volA", name: "Ann" },
      { id: "volB", name: "Bea" },
      { id: "volC", name: "Cal" },
      { id: "volD", name: "Dev" },
    ],
  });
  const result = await invitableVolunteers(db, "ls1", "volA");
  assert.deepEqual(
    result.map((v) => v.id),
    ["volD"]
  );
});

test("inviteBuddyFor: creates a pending invite, logs the event, and notifies", async () => {
  const notified: any[] = [];
  const { db, calls } = fakeDb({
    pickup: { volunteerId: "volA", buddyId: null, listing: { status: "claimed", title: "Bagels" } },
    users: {
      volB: { id: "volB", role: "volunteer" },
      volA: { name: "Ann" },
    },
  });
  const invite = await inviteBuddyFor(db, "volA", "ls1", "volB", async (p) => {
    notified.push(p);
  });
  assert.equal(invite.id, "inv1");
  assert.deepEqual(calls.upserts[0], {
    listingId: "ls1",
    inviterId: "volA",
    inviteeId: "volB",
    status: "pending",
  });
  assert.equal(calls.events[0].type, "buddy_invited");
  assert.equal(notified[0].inviteeId, "volB");
  assert.equal(notified[0].inviterName, "Ann");
  assert.equal(notified[0].listingTitle, "Bagels");
});

test("inviteBuddyFor: rejects inviting yourself", async () => {
  const { db } = fakeDb({
    pickup: { volunteerId: "volA", buddyId: null, listing: { status: "claimed" } },
  });
  await assert.rejects(
    () => inviteBuddyFor(db, "volA", "ls1", "volA", noNotify),
    /can't invite yourself/
  );
});

test("inviteBuddyFor: only the primary may invite", async () => {
  const { db } = fakeDb({
    pickup: { volunteerId: "volA", buddyId: null, listing: { status: "claimed" } },
    users: { volB: { id: "volB", role: "volunteer" } },
  });
  await assert.rejects(
    () => inviteBuddyFor(db, "intruder", "ls1", "volB", noNotify),
    /who claimed this can invite/
  );
});

test("inviteBuddyFor: rejects when the claim already has a buddy", async () => {
  const { db } = fakeDb({
    pickup: { volunteerId: "volA", buddyId: "volZ", listing: { status: "claimed" } },
  });
  await assert.rejects(
    () => inviteBuddyFor(db, "volA", "ls1", "volB", noNotify),
    /already has a buddy/
  );
});

test("inviteBuddyFor: rejects a second outstanding invite to a different person", async () => {
  const { db } = fakeDb({
    pickup: { volunteerId: "volA", buddyId: null, listing: { status: "claimed" } },
    users: { volB: { id: "volB", role: "volunteer" } },
    outstanding: { inviteeId: "volC", status: "pending" },
  });
  await assert.rejects(
    () => inviteBuddyFor(db, "volA", "ls1", "volB", noNotify),
    /already have a pending buddy invite/
  );
});

test("inviteBuddyFor: rejects when the claim is no longer active", async () => {
  const { db } = fakeDb({
    pickup: { volunteerId: "volA", buddyId: null, listing: { status: "delivered" } },
  });
  await assert.rejects(
    () => inviteBuddyFor(db, "volA", "ls1", "volB", noNotify),
    /no longer active/
  );
});

test("respondToInviteFor: accepting sets the buddy seat and logs buddy_joined", async () => {
  const { db, calls } = fakeDb({
    invite: { id: "inv1", inviteeId: "volB", listingId: "ls1", status: "pending" },
    pickup: { volunteerId: "volA", buddyId: null, listing: { status: "claimed" } },
  });
  await respondToInviteFor(db, "volB", "inv1", true, t0);
  assert.equal(calls.pickupUpdates[0].buddyId, "volB");
  assert.equal(calls.inviteUpdates[0].status, "accepted");
  assert.equal(calls.inviteUpdates[0].respondedAt.getTime(), t0);
  assert.equal(calls.events[0].type, "buddy_joined");
});

test("respondToInviteFor: declining marks the invite and never touches the claim", async () => {
  const { db, calls } = fakeDb({
    invite: { id: "inv1", inviteeId: "volB", listingId: "ls1", status: "pending" },
  });
  await respondToInviteFor(db, "volB", "inv1", false, t0);
  assert.equal(calls.inviteUpdates[0].status, "declined");
  assert.equal(calls.pickupUpdates.length, 0);
  assert.equal(calls.events.length, 0);
});

test("respondToInviteFor: rejects someone who isn't the invitee", async () => {
  const { db } = fakeDb({
    invite: { id: "inv1", inviteeId: "volB", listingId: "ls1", status: "pending" },
  });
  await assert.rejects(
    () => respondToInviteFor(db, "stranger", "inv1", true, t0),
    /no longer available/
  );
});

test("respondToInviteFor: accepting rejects when a buddy already joined", async () => {
  const { db } = fakeDb({
    invite: { id: "inv1", inviteeId: "volB", listingId: "ls1", status: "pending" },
    pickup: { volunteerId: "volA", buddyId: "volZ", listing: { status: "claimed" } },
  });
  await assert.rejects(
    () => respondToInviteFor(db, "volB", "inv1", true, t0),
    /already has a buddy/
  );
});

test("cancelInviteFor: the inviter pulls back an outstanding invite", async () => {
  const { db, calls } = fakeDb({
    outstanding: { id: "inv1", inviterId: "volA", status: "pending" },
  });
  await cancelInviteFor(db, "volA", "ls1", t0);
  assert.equal(calls.inviteUpdates[0].status, "cancelled");
});

test("cancelInviteFor: rejects when there's nothing to cancel", async () => {
  const { db } = fakeDb({ outstanding: null });
  await assert.rejects(
    () => cancelInviteFor(db, "volA", "ls1", t0),
    /no invite to cancel/
  );
});
