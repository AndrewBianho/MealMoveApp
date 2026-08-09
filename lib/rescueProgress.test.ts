import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RESCUE_STEPS,
  progressOf,
  isTerminal,
  nextStepOf,
  stepCounterLabel,
  isLiveOwnRescue,
} from "./rescueProgress";
import type { ListingStatus } from "./types";

const at = (status: ListingStatus, extra = {}) => ({ status, ...extra });

test("progressOf maps each live status to its lifecycle step", () => {
  assert.equal(progressOf(at("open")), 0);
  assert.equal(progressOf(at("claimed")), 1);
  assert.equal(progressOf(at("in transit")), 2);
  assert.equal(progressOf(at("delivered")), 3);
});

test("progressOf treats 'taken home' as a pause inside in-transit, not its own step", () => {
  // The food is picked up and still owed to the drop-off, so it sits at the
  // same step as "in transit" — never advancing, never falling back.
  assert.equal(progressOf(at("taken home")), progressOf(at("in transit")));
  assert.equal(progressOf(at("taken home")), 2);
});

test("progressOf freezes an ended rescue at the step it actually reached", () => {
  assert.equal(progressOf(at("expired")), 0);
  assert.equal(progressOf(at("failed", { claimedAt: 1 })), 1);
  assert.equal(progressOf(at("failed", { photoAtPickupUrl: "u" })), 2);
  assert.equal(progressOf(at("failed", { pickedUpAt: 1 })), 2);
  assert.equal(progressOf(at("failed", { deliveredAt: 1 })), 3);
});

test("progressOf reads the pickup photo as proof the food was collected", () => {
  // A rescue that failed after the pickup photo still reached "Picked up" —
  // the photo is the evidence, even with no pickedUpAt stamp.
  const withPhoto = at("failed", { claimedAt: 1, photoAtPickupUrl: "u" });
  const withoutPhoto = at("failed", { claimedAt: 1 });
  assert.equal(progressOf(withPhoto), 2);
  assert.equal(progressOf(withoutPhoto), 1);
});

test("isTerminal is true only for rescues that ended without delivery", () => {
  assert.equal(isTerminal("expired"), true);
  assert.equal(isTerminal("failed"), true);
  assert.equal(isTerminal("delivered"), false);
  assert.equal(isTerminal("in transit"), false);
});

test("nextStepOf names the step the current photo advances into", () => {
  // The two prompts the volunteer actually sees on the detail page.
  assert.deepEqual(nextStepOf(at("claimed")), { index: 2, name: "Picked up" });
  assert.deepEqual(nextStepOf(at("in transit")), { index: 3, name: "Delivered" });
  // Held overnight, the next tap is still the delivery photo.
  assert.deepEqual(nextStepOf(at("taken home")), { index: 3, name: "Delivered" });
});

test("nextStepOf returns null when there is nothing left to advance into", () => {
  assert.equal(nextStepOf(at("delivered")), null);
  assert.equal(nextStepOf(at("expired")), null);
  assert.equal(nextStepOf(at("failed", { pickedUpAt: 1 })), null);
});

test("stepCounterLabel counts toward the step being worked, and stops at the end", () => {
  assert.equal(stepCounterLabel(at("open")), "Step 2 of 4");
  assert.equal(stepCounterLabel(at("claimed")), "Step 3 of 4");
  assert.equal(stepCounterLabel(at("in transit")), "Step 4 of 4");
  // Never "step 5 of 4".
  assert.equal(stepCounterLabel(at("delivered")), null);
  assert.equal(stepCounterLabel(at("failed")), null);
});

test("isLiveOwnRescue is true only for the viewer's own in-flight rescue", () => {
  assert.equal(isLiveOwnRescue({ status: "claimed", mine: true }), true);
  assert.equal(isLiveOwnRescue({ status: "in transit", mine: true }), true);
  assert.equal(isLiveOwnRescue({ status: "taken home", mine: true }), true);
  // Someone else's rescue, or one of yours that's over.
  assert.equal(isLiveOwnRescue({ status: "claimed", mine: false }), false);
  assert.equal(isLiveOwnRescue({ status: "claimed" }), false);
  assert.equal(isLiveOwnRescue({ status: "open", mine: true }), false);
  assert.equal(isLiveOwnRescue({ status: "delivered", mine: true }), false);
});

test("RESCUE_STEPS is the four-step vocabulary both surfaces render", () => {
  assert.deepEqual(
    [...RESCUE_STEPS],
    ["Posted", "Claimed", "Picked up", "Delivered"]
  );
});
