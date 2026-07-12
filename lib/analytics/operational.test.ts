import { test } from "node:test";
import assert from "node:assert/strict";
import { computeFunnel, computeFlakeRate, computeServingsRescued, deriveListingStatus, type PickupRecord } from "./operational";

const sample: PickupRecord[] = [
  { status: "delivered", servings: 10 },
  { status: "delivered", servings: 5 },
  { status: "in_transit", servings: 8 },
  { status: "flaked", servings: 6 },
  { status: "claimed", servings: 4 },
];

test("computeServingsRescued sums only delivered", () => {
  assert.equal(computeServingsRescued(sample), 15);
});

test("computeFlakeRate = flaked / (flaked + delivered)", () => {
  assert.equal(computeFlakeRate(sample), 1 / 3);
  assert.equal(computeFlakeRate([]), 0);
});

test("computeFunnel counts each stage reached", () => {
  assert.deepEqual(computeFunnel(sample), { claimed: 5, pickedUp: 3, delivered: 2 });
});

test("deriveListingStatus: delivered wins even alongside released", () => {
  assert.equal(deriveListingStatus(new Set(["released", "delivered"])), "delivered");
});

test("deriveListingStatus: claimed only", () => {
  assert.equal(deriveListingStatus(new Set(["claimed"])), "claimed");
});

test("deriveListingStatus: claimed + released is flaked", () => {
  assert.equal(deriveListingStatus(new Set(["claimed", "released"])), "flaked");
});

test("deriveListingStatus: claimed + in_transit is in_transit", () => {
  assert.equal(deriveListingStatus(new Set(["claimed", "in_transit"])), "in_transit");
});

test("deriveListingStatus: claimed + in_transit + taken_home is taken_home", () => {
  assert.equal(
    deriveListingStatus(new Set(["claimed", "in_transit", "taken_home"])),
    "taken_home",
  );
});
