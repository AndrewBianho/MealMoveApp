import { test } from "node:test";
import assert from "node:assert/strict";
import { computeFunnel, computeFlakeRate, computeServingsRescued, type PickupRecord } from "./operational";

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
