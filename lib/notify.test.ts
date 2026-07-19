// Test doubles below stand in for the Prisma client; `any` keeps the fakes
// lightweight (we only implement the handful of methods under test).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildRestaurantRescuePayload,
  sendRestaurantRescueNotice,
} from "./notify";

test("buildRestaurantRescuePayload: claimed, single car", () => {
  const p = buildRestaurantRescuePayload({
    event: "claimed",
    restaurantId: "r1",
    listingId: "ls1",
    listingTitle: "Bagels",
  });
  assert.equal(p.title, "Someone's coming for your pickup");
  assert.match(p.body, /A volunteer claimed "Bagels"/);
  assert.equal(p.url, "/restaurant/listings");
  assert.equal(p.email.subject, "Someone's coming for your pickup");
  assert.match(p.email.html, /Bagels/);
});

test("buildRestaurantRescuePayload: claimed, multi car shows progress", () => {
  const p = buildRestaurantRescuePayload({
    event: "claimed",
    restaurantId: "r1",
    listingId: "ls1",
    listingTitle: "Trays",
    carsNeeded: 3,
    carsClaimed: 2,
  });
  assert.equal(p.title, "Your pickup was claimed");
  assert.match(p.body, /2 of 3 cars claimed/);
});

test("buildRestaurantRescuePayload: delivered", () => {
  const p = buildRestaurantRescuePayload({
    event: "delivered",
    restaurantId: "r1",
    listingId: "ls1",
    listingTitle: "Bagels",
  });
  assert.equal(p.title, "Your food was delivered");
  assert.match(p.body, /reached its drop-off/);
});

test("buildRestaurantRescuePayload: fell_through is non-punitive", () => {
  const p = buildRestaurantRescuePayload({
    event: "fell_through",
    restaurantId: "r1",
    listingId: "ls1",
    listingTitle: "Bagels",
  });
  assert.equal(p.title, "Your pickup is open again");
  assert.match(p.body, /couldn't make it/);
  assert.match(p.body, /back open/);
});

test("sendRestaurantRescueNotice: dispatches once per restaurant member", async () => {
  const calls: any[] = [];
  await sendRestaurantRescueNotice(
    { event: "claimed", restaurantId: "r1", listingId: "ls1", listingTitle: "Bagels" },
    {
      recipientIds: async () => ["m1", "m2"],
      dispatch: (async (userId: string, payload: any) => {
        calls.push({ userId, payload });
        return { channel: "push" as const };
      }) as any,
    }
  );
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map((c) => c.userId).sort(), ["m1", "m2"]);
  assert.equal(calls[0].payload.title, "Someone's coming for your pickup");
});

test("sendRestaurantRescueNotice: one failing dispatch does not reject the fan-out", async () => {
  await assert.doesNotReject(() =>
    sendRestaurantRescueNotice(
      { event: "delivered", restaurantId: "r1", listingId: "ls1", listingTitle: "Bagels" },
      {
        recipientIds: async () => ["ok", "bad"],
        dispatch: (async (userId: string) => {
          if (userId === "bad") throw new Error("token dead");
          return { channel: "push" as const };
        }) as any,
      }
    )
  );
});
