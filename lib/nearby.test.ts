import { test } from "node:test";
import assert from "node:assert/strict";
import { countWithin, NEARBY_RADIUS_KM } from "./nearby";

const MALVERN = { lat: 40.02724, lng: -75.51239 };

// ~1 mi north and ~10 mi north of the anchor, plus an unlocated volunteer.
const oneMileNorth = { lat: MALVERN.lat + 1 / 69, lng: MALVERN.lng };
const tenMilesNorth = { lat: MALVERN.lat + 10 / 69, lng: MALVERN.lng };

test("countWithin: counts only located volunteers inside the radius", () => {
  const vols = [oneMileNorth, tenMilesNorth, { lat: null, lng: null }];
  // Default 5km ≈ 3.1mi: only the 1-mi volunteer qualifies.
  assert.equal(countWithin(MALVERN, vols, NEARBY_RADIUS_KM), 1);
});

test("countWithin: a wider radius pulls in farther volunteers", () => {
  const vols = [oneMileNorth, tenMilesNorth];
  assert.equal(countWithin(MALVERN, vols, 20), 2); // 20km ≈ 12.4mi
});

test("countWithin: zero when nobody is located or in range", () => {
  assert.equal(countWithin(MALVERN, [{ lat: null, lng: null }]), 0);
  assert.equal(countWithin(MALVERN, [tenMilesNorth]), 0);
  assert.equal(countWithin(MALVERN, []), 0);
});
