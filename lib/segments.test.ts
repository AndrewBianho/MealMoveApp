// `any` keeps the lightweight test doubles below readable.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveAudience, countAudience, cleanAudience } from "./segments";

// v2 sits ~3.45 mi north of v1's point; v3 has no known position.
const VOLS = [
  { id: "v1", lat: 40.0, lng: -75.0 },
  { id: "v2", lat: 40.05, lng: -75.0 },
  { id: "v3", lat: null, lng: null },
];

function db(over: any = {}): any {
  return {
    user: { findMany: async () => VOLS },
    listingEvent: { groupBy: async () => [], findMany: async () => [] },
    pickup: { findMany: async () => [] },
    restaurant: { findFirst: async () => null },
    dropOff: { findFirst: async () => null },
    ...over,
  };
}

test("everyone resolves to all active in-world volunteers", async () => {
  const r = await resolveAudience({ kind: "everyone" }, "real", { db: db() });
  assert.deepEqual(r.ids, ["v1", "v2", "v3"]);
  assert.equal(r.label, "Everyone");
});

test("everyone queries active in-world volunteers only", async () => {
  let where: any = null;
  const d = db({
    user: {
      findMany: async (a: any) => {
        where = a.where;
        return VOLS;
      },
    },
  });
  await resolveAudience({ kind: "everyone" }, "demo", { db: d });
  assert.deepEqual(where, { role: "volunteer", status: "active", dataMode: "demo" });
});

test("reliability bands split at 50 and 80 and exclude no-history volunteers", async () => {
  const events = [
    // v1: 1 delivered / 1 flaked = 50% -> finding_footing
    { actorId: "v1", type: "delivered", _count: { _all: 1 } },
    { actorId: "v1", type: "released", _count: { _all: 1 } },
    // v2: 1 delivered / 4 flaked = 20% -> needs_support
    { actorId: "v2", type: "delivered", _count: { _all: 1 } },
    { actorId: "v2", type: "failed", _count: { _all: 4 } },
    // v3: no events -> in no band at all
  ];
  const d = db({ listingEvent: { groupBy: async () => events, findMany: async () => [] } });

  const low = await resolveAudience({ kind: "reliability", band: "needs_support" }, "real", { db: d });
  assert.deepEqual(low.ids, ["v2"]);

  const mid = await resolveAudience({ kind: "reliability", band: "finding_footing" }, "real", { db: d });
  assert.deepEqual(mid.ids, ["v1"]);

  const star = await resolveAudience({ kind: "reliability", band: "star" }, "real", { db: d });
  assert.deepEqual(star.ids, []);
});

test("reliability bands split exactly at the 80% boundary", async () => {
  const events = [
    // v1: 4 delivered / 1 flaked = 80% -> star, not finding_footing
    { actorId: "v1", type: "delivered", _count: { _all: 4 } },
    { actorId: "v1", type: "released", _count: { _all: 1 } },
  ];
  const d = db({ listingEvent: { groupBy: async () => events, findMany: async () => [] } });

  const star = await resolveAudience({ kind: "reliability", band: "star" }, "real", { db: d });
  assert.deepEqual(star.ids, ["v1"]);

  const mid = await resolveAudience({ kind: "reliability", band: "finding_footing" }, "real", { db: d });
  assert.deepEqual(mid.ids, []);
});

test("reliability scopes the event query to the world", async () => {
  let where: any = null;
  const d = db({
    listingEvent: {
      groupBy: async (a: any) => {
        where = a.where;
        return [];
      },
      findMany: async () => [],
    },
  });
  await resolveAudience({ kind: "reliability", band: "star" }, "demo", { db: d });
  assert.deepEqual(where.listing, { demo: true });
  assert.deepEqual(where.type, { in: ["delivered", "released", "failed"] });
});

test("new = active volunteers with no terminal event history", async () => {
  const d = db({
    listingEvent: { groupBy: async () => [], findMany: async () => [{ actorId: "v1" }] },
  });
  const r = await resolveAudience({ kind: "new" }, "real", { db: d });
  assert.deepEqual(r.ids, ["v2", "v3"]);
  assert.equal(r.label, "New volunteers");
});

test("a volunteer who only flaked is excluded from `new` and lands in needs_support (regression: new/reliability overlap)", async () => {
  // v1's only event is a flake (released, no delivered) -> has history, so
  // must NOT be `new`, and must fall into the needs_support band (0%).
  const events = [{ actorId: "v1", type: "released", _count: { _all: 1 } }];
  const d = db({
    listingEvent: {
      groupBy: async () => events,
      findMany: async () => [{ actorId: "v1" }],
    },
  });

  const newAudience = await resolveAudience({ kind: "new" }, "real", { db: d });
  assert.ok(!newAudience.ids.includes("v1"), "flaker must not appear in `new`");

  const needsSupport = await resolveAudience(
    { kind: "reliability", band: "needs_support" },
    "real",
    { db: d }
  );
  assert.ok(needsSupport.ids.includes("v1"), "flaker must appear in needs_support");
});

test("lapsed excludes never-claimed volunteers and respects the cutoff", async () => {
  const now = new Date("2026-07-13T00:00:00Z");
  const d = db({
    pickup: {
      findMany: async () => [
        { volunteerId: "v1", buddyId: null, claimedAt: new Date("2026-05-01T00:00:00Z") }, // > 30d
        { volunteerId: "v2", buddyId: null, claimedAt: new Date("2026-07-10T00:00:00Z") }, // < 30d
        // v3 never claimed -> `new`, not lapsed
      ],
    },
  });
  const r = await resolveAudience({ kind: "lapsed", days: 30 }, "real", { db: d, now });
  assert.deepEqual(r.ids, ["v1"]);
  assert.match(r.label, /30\+ days/);
});

test("lapsed counts a buddy-only claim (second seat), not just the primary volunteer", async () => {
  const now = new Date("2026-07-13T00:00:00Z");
  const d = db({
    pickup: {
      findMany: async () => [
        // v3 never appears as volunteerId, only as buddyId -> must still count
        // as having claimed, and be eligible for lapsed past the cutoff.
        { volunteerId: "v1", buddyId: "v3", claimedAt: new Date("2026-05-01T00:00:00Z") },
        { volunteerId: "v2", buddyId: null, claimedAt: new Date("2026-07-10T00:00:00Z") },
      ],
    },
  });
  const r = await resolveAudience({ kind: "lapsed", days: 30 }, "real", { db: d, now });
  assert.deepEqual(r.ids.sort(), ["v1", "v3"]);
});

test("near filters by radius and drops volunteers with no position", async () => {
  const d = db({
    restaurant: { findFirst: async () => ({ name: "Maple St Cafe", lat: 40.0, lng: -75.0 }) },
  });
  const r = await resolveAudience(
    { kind: "near", anchor: { kind: "restaurant", id: "r1" }, radiusMi: 2 },
    "real",
    { db: d }
  );
  assert.deepEqual(r.ids, ["v1"]); // v2 is ~3.45 mi out; v3 has no position
  assert.match(r.label, /Maple St Cafe/);
});

test("near with a missing anchor matches nobody", async () => {
  const r = await resolveAudience(
    { kind: "near", anchor: { kind: "dropoff", id: "nope" }, radiusMi: 5 },
    "real",
    { db: db() }
  );
  assert.deepEqual(r.ids, []);
});

test("near scopes the anchor lookup to the world's demo flag", async () => {
  let where: any = null;
  const d = db({
    dropOff: {
      findFirst: async (a: any) => {
        where = a.where;
        return null;
      },
    },
  });

  await resolveAudience(
    { kind: "near", anchor: { kind: "dropoff", id: "d1" }, radiusMi: 5 },
    "demo",
    { db: d }
  );
  assert.deepEqual(where, { id: "d1", demo: true });

  await resolveAudience(
    { kind: "near", anchor: { kind: "dropoff", id: "d1" }, radiusMi: 5 },
    "real",
    { db: d }
  );
  assert.deepEqual(where, { id: "d1", demo: false });
});

test("countAudience returns the resolved size", async () => {
  assert.equal(await countAudience({ kind: "everyone" }, "real", { db: db() }), 3);
});

test("cleanAudience accepts valid shapes and rejects bad ones", () => {
  assert.deepEqual(cleanAudience({ kind: "everyone" }), { kind: "everyone" });
  assert.deepEqual(cleanAudience({ kind: "new" }), { kind: "new" });
  assert.deepEqual(cleanAudience({ kind: "lapsed", days: 30 }), { kind: "lapsed", days: 30 });
  assert.deepEqual(
    cleanAudience({ kind: "near", anchor: { kind: "restaurant", id: "r1" }, radiusMi: 5 }),
    { kind: "near", anchor: { kind: "restaurant", id: "r1" }, radiusMi: 5 }
  );
  assert.equal(cleanAudience({ kind: "lapsed", days: 7 }), null); // not an allowed preset
  assert.equal(cleanAudience({ kind: "reliability", band: "bogus" }), null);
  assert.equal(cleanAudience({ kind: "near", anchor: { kind: "restaurant", id: "r1" }, radiusMi: 3 }), null);
  assert.equal(cleanAudience({ kind: "nope" }), null);
  assert.equal(cleanAudience(null), null);
});
