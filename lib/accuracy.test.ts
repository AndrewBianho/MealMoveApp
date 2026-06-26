import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aggregateAccuracy,
  cleanAccuracyNote,
  cleanRescueAccuracy,
  ACCURACY_NOTE_MAX,
} from "./accuracy";

test("cleanRescueAccuracy: keeps known values, rejects the rest", () => {
  assert.equal(cleanRescueAccuracy("yes"), "yes");
  assert.equal(cleanRescueAccuracy("partly"), "partly");
  assert.equal(cleanRescueAccuracy("no"), "no");
  assert.equal(cleanRescueAccuracy("maybe"), null);
  assert.equal(cleanRescueAccuracy(""), null);
  assert.equal(cleanRescueAccuracy(null), null);
  assert.equal(cleanRescueAccuracy(3), null);
});

test("cleanAccuracyNote: trims, bounds, and nulls empties", () => {
  assert.equal(cleanAccuracyNote("  half the trays were gone  "), "half the trays were gone");
  assert.equal(cleanAccuracyNote("   "), null);
  assert.equal(cleanAccuracyNote(null), null);
  assert.equal(cleanAccuracyNote(42), null);
  assert.equal(cleanAccuracyNote("x".repeat(500))?.length, ACCURACY_NOTE_MAX);
});

test("aggregateAccuracy: counts and computes the as-described percentage", () => {
  const got = aggregateAccuracy(["yes", "yes", "yes", "partly", "no", null, undefined]);
  assert.deepEqual(got, { total: 5, yes: 3, partly: 1, no: 1, accuratePct: 60 });
});

test("aggregateAccuracy: no signals → null percentage, not a divide-by-zero", () => {
  const got = aggregateAccuracy([null, undefined]);
  assert.deepEqual(got, { total: 0, yes: 0, partly: 0, no: 0, accuratePct: null });
});
