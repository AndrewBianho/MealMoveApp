// Test doubles below stand in for the Prisma client; `any` keeps the fakes
// lightweight (we only implement the handful of methods under test).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bandFor,
  selectTargets,
  escalateBroadcasts,
  DEFAULT_BROADCAST_CONFIG,
  type Candidate,
} from "./broadcast";

test("bandFor: maps minutes-left to the urgency bands", () => {
  assert.equal(bandFor(120), "open");
  assert.equal(bandFor(35), "open");
  assert.equal(bandFor(34), "soon");
  assert.equal(bandFor(10), "soon");
  assert.equal(bandFor(9), "closing_soon");
  assert.equal(bandFor(0), "closing_soon");
  assert.equal(bandFor(-1), null);
});

test("selectTargets: open band pings the nearest N, located only", () => {
  const candidates: Candidate[] = [
    { volunteerId: "far", miles: 9 },
    { volunteerId: "near", miles: 1 },
    { volunteerId: "mid", miles: 4 },
    { volunteerId: "noloc", miles: null },
  ];
  const got = selectTargets("open", candidates, { ...DEFAULT_BROADCAST_CONFIG, nearestN: 2 });
  assert.deepEqual(got, ["near", "mid"]);
});

test("selectTargets: soon widens to a radius, closing_soon wider still", () => {
  // 4 mi ≈ 6.4 km, 9 mi ≈ 14.5 km.
  const candidates: Candidate[] = [
    { volunteerId: "a", miles: 2 }, // ~3.2km
    { volunteerId: "b", miles: 4 }, // ~6.4km
    { volunteerId: "c", miles: 9 }, // ~14.5km
    { volunteerId: "noloc", miles: null },
  ];
  assert.deepEqual(selectTargets("soon", candidates), ["a"]); // only within 5km
  assert.deepEqual(selectTargets("closing_soon", candidates), ["a", "b", "c"]); // within 15km
});

// --- escalateBroadcasts integration over a fake Prisma client ---

function fakeDb(opts: { listings: any[]; volunteers: any[]; sent?: any[] }) {
  const broadcasts: any[] = [...(opts.sent ?? [])];
  const db: any = {
    foodListing: { findMany: async () => opts.listings },
    user: { findMany: async () => opts.volunteers },
    listingBroadcast: {
      findMany: async ({ where }: any) =>
        broadcasts.filter(
          (b) =>
            b.listingId === where.listingId &&
            b.band === where.band &&
            where.volunteerId.in.includes(b.volunteerId)
        ),
      createMany: async ({ data }: any) => {
        broadcasts.push(...data);
        return { count: data.length };
      },
    },
  };
  return { db, broadcasts };
}

const RESTAURANT = { lat: 40.02724, lng: -75.51239 }; // Malvern anchor

function listing(over: any = {}) {
  return {
    id: "ls1",
    title: "Bagels",
    servings: 12,
    demo: false,
    // 40 min out → open band by default.
    expiresAt: new Date(Date.now() + 40 * 60_000),
    restaurant: RESTAURANT,
    ...over,
  };
}

// A volunteer right at the restaurant (0 mi away), real world, opted in.
function vol(over: any = {}) {
  return { id: "v1", lat: RESTAURANT.lat, lng: RESTAURANT.lng, dataMode: "real", ...over };
}

test("escalateBroadcasts: fires once per volunteer per band, no dupes", async () => {
  const { db, broadcasts } = fakeDb({
    listings: [listing()],
    volunteers: [vol({ id: "v1" }), vol({ id: "v2" })],
  });
  const sent: Array<[string, string]> = [];
  const dispatch = async (id: string, p: any) => {
    sent.push([id, p.title]);
  };

  const first = await escalateBroadcasts({ db, dispatch: dispatch as any, now: new Date() });
  assert.equal(first.notified, 2);
  assert.equal(first.byBand.open, 2);
  assert.equal(sent.length, 2);
  assert.equal(broadcasts.length, 2);

  // Re-running the same pass must not re-notify (deduped by sent-state).
  const second = await escalateBroadcasts({ db, dispatch: dispatch as any, now: new Date() });
  assert.equal(second.notified, 0);
  assert.equal(sent.length, 2);
});

test("escalateBroadcasts: a new band reaches the volunteer again", async () => {
  // Same listing, now 5 min out → closing_soon, with a prior `open` send logged.
  const { db } = fakeDb({
    listings: [listing({ expiresAt: new Date(Date.now() + 5 * 60_000) })],
    volunteers: [vol({ id: "v1" })],
    sent: [{ listingId: "ls1", volunteerId: "v1", band: "open" }],
  });
  const sent: string[] = [];
  const res = await escalateBroadcasts({
    db,
    dispatch: (async (id: string) => void sent.push(id)) as any,
    now: new Date(),
  });
  assert.equal(res.notified, 1);
  assert.equal(res.byBand.closing_soon, 1);
  assert.deepEqual(sent, ["v1"]);
});

test("escalateBroadcasts: skips volunteers in the other world", async () => {
  const { db } = fakeDb({
    listings: [listing({ demo: false })],
    volunteers: [vol({ id: "v1", dataMode: "demo" })], // wrong world
  });
  const res = await escalateBroadcasts({ db, dispatch: (async () => {}) as any, now: new Date() });
  assert.equal(res.notified, 0);
});
