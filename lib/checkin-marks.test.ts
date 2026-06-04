import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dueNudgeCount,
  activeMark,
  formatCountdown,
  HOLD_MINUTES,
  CHECK_IN_MARKS,
} from "./checkin-marks";

const MIN = 60_000;
const t0 = 1_000_000_000_000;

test("dueNudgeCount: none before the 5-min mark", () => {
  assert.equal(dueNudgeCount(t0, t0 + 4 * MIN), 0);
});

test("dueNudgeCount: one at 5 min, two at 10 min", () => {
  assert.equal(dueNudgeCount(t0, t0 + 5 * MIN), 1);
  assert.equal(dueNudgeCount(t0, t0 + 10 * MIN), 2);
});

test("dueNudgeCount: capped at 2 past 15 min", () => {
  assert.equal(dueNudgeCount(t0, t0 + 30 * MIN), 2);
});

test("activeMark: null before any mark passes", () => {
  assert.equal(activeMark(t0, null, t0 + 4 * MIN), null);
});

test("activeMark: 5 once the 5-min mark passes and never confirmed", () => {
  assert.equal(activeMark(t0, null, t0 + 6 * MIN), 5);
});

test("activeMark: 10 wins once the 10-min mark passes", () => {
  assert.equal(activeMark(t0, null, t0 + 11 * MIN), 10);
});

test("activeMark: a confirmation suppresses the current mark only", () => {
  assert.equal(activeMark(t0, t0 + 6 * MIN, t0 + 7 * MIN), null);
  assert.equal(activeMark(t0, t0 + 6 * MIN, t0 + 11 * MIN), 10);
});

test("formatCountdown: formats mm:ss and clamps negatives to 0:00", () => {
  assert.equal(formatCountdown(7 * MIN + 21_000), "7:21");
  assert.equal(formatCountdown(65_000), "1:05");
  assert.equal(formatCountdown(-5_000), "0:00");
});

test("constants are the single source of truth", () => {
  assert.equal(HOLD_MINUTES, 15);
  assert.deepEqual([...CHECK_IN_MARKS], [5, 10]);
});
