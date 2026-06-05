// Test doubles below stand in for the Prisma client; `any` keeps the fakes
// lightweight (we only implement the handful of methods under test).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canAccessChat,
  isChatActive,
  postMessage,
  type ChatListing,
  type ChatUser,
} from "./chat";

function listing(over: Partial<ChatListing> = {}): ChatListing {
  return {
    id: "ls1",
    restaurantId: "r1",
    dropOffId: "d1",
    status: "claimed",
    pickup: { volunteerId: "vol1", buddyId: null },
    ...over,
  };
}

function user(over: Partial<ChatUser> = {}): ChatUser {
  return { id: "vol1", role: "volunteer", restaurantId: null, ...over };
}

test("canAccessChat: the claiming volunteer is in", () => {
  assert.equal(canAccessChat(user(), listing()), true);
});

test("canAccessChat: a different volunteer is out", () => {
  assert.equal(canAccessChat(user({ id: "other" }), listing()), false);
});

test("canAccessChat: the buddy on the claim is in", () => {
  assert.equal(
    canAccessChat(
      user({ id: "vol2" }),
      listing({ pickup: { volunteerId: "vol1", buddyId: "vol2" } })
    ),
    true
  );
});

test("canAccessChat: the listing's restaurant is in, a different one is out", () => {
  assert.equal(
    canAccessChat(user({ role: "restaurant", restaurantId: "r1" }), listing()),
    true
  );
  assert.equal(
    canAccessChat(user({ role: "restaurant", restaurantId: "r2" }), listing()),
    false
  );
});

test("canAccessChat: drop-off admin is in when a drop-off is assigned, out otherwise", () => {
  assert.equal(canAccessChat(user({ role: "drop_off_admin" }), listing()), true);
  assert.equal(
    canAccessChat(user({ role: "drop_off_admin" }), listing({ dropOffId: null })),
    false
  );
});

test("canAccessChat: org admin is always in", () => {
  assert.equal(
    canAccessChat(user({ role: "org_admin" }), listing({ pickup: null })),
    true
  );
});

test("isChatActive: true for claimed/in_transit, false once it ends", () => {
  assert.equal(isChatActive({ status: "claimed" }), true);
  assert.equal(isChatActive({ status: "in_transit" }), true);
  assert.equal(isChatActive({ status: "delivered" }), false);
  assert.equal(isChatActive({ status: "expired" }), false);
});

function fakeDb() {
  const created: any[] = [];
  const db: any = {
    message: {
      create: async ({ data }: any) => {
        created.push(data);
        return { id: "m1", ...data };
      },
    },
  };
  return { db, created };
}

test("postMessage: a participant on an active claim is stored (trimmed)", async () => {
  const { db, created } = fakeDb();
  await postMessage(db, user(), listing(), "  on my way  ");
  assert.equal(created[0].body, "on my way");
  assert.equal(created[0].senderId, "vol1");
  assert.equal(created[0].listingId, "ls1");
});

test("postMessage: rejects a non-participant", async () => {
  const { db, created } = fakeDb();
  await assert.rejects(
    () => postMessage(db, user({ id: "stranger" }), listing(), "hi"),
    /not part of this conversation/
  );
  assert.equal(created.length, 0);
});

test("postMessage: rejects once the claim is closed", async () => {
  const { db } = fakeDb();
  await assert.rejects(
    () => postMessage(db, user(), listing({ status: "delivered" }), "hi"),
    /closed/
  );
});

test("postMessage: rejects an empty body", async () => {
  const { db } = fakeDb();
  await assert.rejects(() => postMessage(db, user(), listing(), "   "), /empty/);
});
