import { test } from "node:test";
import assert from "node:assert/strict";
import { rankDropOffs, rankRestaurantsForDropOff } from "./recommend";
import type { DropOffLocation, MapRestaurant } from "./types";

// A small fixture: one perishable prepared-food restaurant, three drop-offs at
// increasing distance with varying constraints.
const rest: MapRestaurant = {
  id: "r1",
  name: "Saxbys",
  lat: 40.0,
  lng: -75.5,
  servings: 30,
  categories: ["prepared"],
  perishable: true,
  count: 1,
};

const near: DropOffLocation = {
  id: "near",
  name: "Near (no fridge)",
  lat: 40.001,
  lng: -75.5,
  acceptedCategories: ["prepared"],
  refrigerated: false, // can't take perishable
  needLevel: "steady",
};
const mid: DropOffLocation = {
  id: "mid",
  name: "Mid (eligible)",
  lat: 40.02,
  lng: -75.5,
  acceptedCategories: ["prepared"],
  refrigerated: true,
  needLevel: "steady",
};
const far: DropOffLocation = {
  id: "far",
  name: "Far (eligible)",
  lat: 40.05,
  lng: -75.5,
  acceptedCategories: ["prepared"],
  refrigerated: true,
  needLevel: "steady",
};

test("rankDropOffs: eligible first, then nearest", () => {
  const ranked = rankDropOffs(rest, [far, near, mid]);
  // near is closest but ineligible (no fridge), so the two eligible come first.
  assert.deepEqual(ranked.map((x) => x.dropOff.id), ["mid", "far", "near"]);
  assert.equal(ranked[2].eligible, false);
  assert.match(ranked[2].reason ?? "", /refrigerated/);
});

test("rankDropOffs: higher need edges out a steady drop-off it's marginally farther than", () => {
  // `mid` (eligible, steady) is at 40.02; a high-need drop-off just past it is
  // within the ~0.5 mi need credit, so it surfaces above the nearer steady one.
  const highNeedFar: DropOffLocation = {
    ...mid,
    id: "highNeedFar",
    name: "High need (just farther)",
    lat: 40.025, // ~0.35 mi past mid
    needLevel: "high",
  };
  const ranked = rankDropOffs(rest, [mid, highNeedFar]).filter((x) => x.eligible);
  assert.deepEqual(ranked.map((x) => x.dropOff.id), ["highNeedFar", "mid"]);
  // Display still reports the real distance, not the discounted one.
  assert.ok(ranked[0].miles > ranked[1].miles);
});

test("rankDropOffs: need never overrides a much-closer drop-off", () => {
  // `mid` is high-need but `far`… flip it: a much-closer steady drop-off beats a
  // far high-need one, because the credit is bounded (~0.5 mi).
  const highNeedFar: DropOffLocation = {
    ...far, // 40.05, well past mid (40.02) — ~2 mi
    id: "highNeedFar",
    name: "High need (far)",
    needLevel: "high",
  };
  const ranked = rankDropOffs(rest, [mid, highNeedFar]).filter((x) => x.eligible);
  assert.deepEqual(ranked.map((x) => x.dropOff.id), ["mid", "highNeedFar"]);
});

test("rankRestaurantsForDropOff: mirrors eligibility from the drop-off side", () => {
  const r2: MapRestaurant = { ...rest, id: "r2", name: "Far one", lat: 40.06 };
  // `mid` accepts prepared + is refrigerated, so both restaurants are eligible;
  // the nearer one (r1 at 40.0, ~0.02° from the drop-off at 40.02, vs r2 at
  // 40.06, ~0.04°) ranks first.
  const ranked = rankRestaurantsForDropOff(mid, [r2, rest]);
  assert.equal(ranked[0].restaurant.id, "r1");
  assert.equal(ranked.every((x) => x.eligible), true);

  // `near` has no fridge, so a perishable restaurant is ineligible for it.
  const forNear = rankRestaurantsForDropOff(near, [rest]);
  assert.equal(forNear[0].eligible, false);
  assert.match(forNear[0].reason ?? "", /refrigerated/);
});
