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
