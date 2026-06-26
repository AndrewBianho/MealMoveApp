import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanSafetyAnswers, SAFETY_QUESTIONS } from "./safety";

test("cleanSafetyAnswers: keeps known boolean keys, drops the rest", () => {
  const got = cleanSafetyAnswers({
    tempKept: true,
    underTwoHours: false,
    sealed: "yes", // wrong type → dropped
    bogus: true, // unknown key → dropped
  });
  assert.deepEqual(got, { tempKept: true, underTwoHours: false });
});

test("cleanSafetyAnswers: empty or garbage → null", () => {
  assert.equal(cleanSafetyAnswers(null), null);
  assert.equal(cleanSafetyAnswers({}), null);
  assert.equal(cleanSafetyAnswers("nope"), null);
  assert.equal(cleanSafetyAnswers({ bogus: true }), null);
});

test("SAFETY_QUESTIONS: stable, non-empty catalogue", () => {
  assert.ok(SAFETY_QUESTIONS.length >= 2);
  for (const q of SAFETY_QUESTIONS) {
    assert.equal(typeof q.key, "string");
    assert.ok(q.label.length > 0);
  }
});
