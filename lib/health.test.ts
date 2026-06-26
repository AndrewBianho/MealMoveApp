import { test } from "node:test";
import assert from "node:assert/strict";
import { computeHealthMetrics, type HealthListing, type FirstClaim } from "./health";

const MIN = 60_000;
// A fixed window: start at t0, end 30 days later.
const t0 = 1_000_000_000_000;
const end = t0 + 30 * 24 * 60 * MIN;
const post = (n: number) => t0 + n * 24 * 60 * MIN; // n days into the window

function listing(over: Partial<HealthListing>): HealthListing {
  return {
    postedAt: post(1),
    expiresAt: post(1) + 60 * MIN,
    restaurantId: "r1",
    claimedAt: null,
    deliveredAt: null,
    ...over,
  };
}

test("computeHealthMetrics: claim rate counts only claims before expiry", () => {
  const listings = [
    listing({ claimedAt: post(1) + 10 * MIN }), // claimed in time
    listing({ claimedAt: post(1) + 90 * MIN }), // claimed AFTER expiry → not counted
    listing({ claimedAt: null }), // never claimed
  ];
  const m = computeHealthMetrics(listings, [], t0, end, 30);
  assert.equal(m.posted, 3);
  assert.deepEqual(m.claimRate, { value: 1 / 3, num: 1, den: 3 });
});

test("computeHealthMetrics: median time-to-claim over claimed listings only", () => {
  const listings = [
    listing({ postedAt: post(1), claimedAt: post(1) + 10 * MIN }), // 10 min
    listing({ postedAt: post(2), claimedAt: post(2) + 30 * MIN }), // 30 min
    listing({ postedAt: post(3), claimedAt: post(3) + 20 * MIN }), // 20 min
    listing({ claimedAt: null }), // ignored
  ];
  const m = computeHealthMetrics(listings, [], t0, end, 30);
  assert.equal(m.medianTimeToClaimMin, 20);
});

test("computeHealthMetrics: completion rate is delivered ÷ claimed", () => {
  const listings = [
    listing({ claimedAt: post(1) + MIN, deliveredAt: post(1) + 40 * MIN }),
    listing({ claimedAt: post(1) + MIN, deliveredAt: null }), // claimed, not delivered
    listing({ claimedAt: null }), // never claimed → not in denominator
  ];
  const m = computeHealthMetrics(listings, [], t0, end, 30);
  assert.deepEqual(m.completionRate, { value: 0.5, num: 1, den: 2 });
});

test("computeHealthMetrics: repeat-post rate is restaurants posting >1", () => {
  const listings = [
    listing({ restaurantId: "a" }),
    listing({ restaurantId: "a" }), // a posted twice
    listing({ restaurantId: "b" }), // b posted once
  ];
  const m = computeHealthMetrics(listings, [], t0, end, 30);
  assert.deepEqual(m.repeatPostRate, { value: 0.5, num: 1, den: 2 });
});

test("computeHealthMetrics: first-time completion only counts first claims in window", () => {
  const firstClaims: FirstClaim[] = [
    { at: post(2), delivered: true },
    { at: post(5), delivered: false },
    { at: t0 - 1, delivered: true }, // before window → excluded
  ];
  const m = computeHealthMetrics([], firstClaims, t0, end, 30);
  assert.deepEqual(m.firstTimeCompletionRate, { value: 0.5, num: 1, den: 2 });
});

test("computeHealthMetrics: empty window → null rates, not 0%", () => {
  const m = computeHealthMetrics([], [], t0, end, 30);
  assert.equal(m.posted, 0);
  assert.equal(m.claimRate.value, null);
  assert.equal(m.medianTimeToClaimMin, null);
  assert.equal(m.completionRate.value, null);
  assert.equal(m.repeatPostRate.value, null);
  assert.equal(m.firstTimeCompletionRate.value, null);
});

test("computeHealthMetrics: filters out listings posted outside the window", () => {
  const listings = [
    listing({ postedAt: post(1), claimedAt: post(1) + MIN }),
    listing({ postedAt: t0 - 1 }), // posted before window
    listing({ postedAt: end + 1 }), // posted after window
  ];
  const m = computeHealthMetrics(listings, [], t0, end, 30);
  assert.equal(m.posted, 1);
});
