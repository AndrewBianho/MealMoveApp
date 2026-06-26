import { test } from "node:test";
import assert from "node:assert/strict";
import { quietHoursActive, formatHour, describeQuietHours } from "./quietHours";

const at = (hour: number) => new Date(2026, 0, 1, hour, 30);

test("quietHoursActive: same-day window [start,end)", () => {
  assert.equal(quietHoursActive(9, 17, at(8)), false);
  assert.equal(quietHoursActive(9, 17, at(9)), true);
  assert.equal(quietHoursActive(9, 17, at(16)), true);
  assert.equal(quietHoursActive(9, 17, at(17)), false); // end is exclusive
});

test("quietHoursActive: window wrapping midnight (22 → 7)", () => {
  assert.equal(quietHoursActive(22, 7, at(23)), true);
  assert.equal(quietHoursActive(22, 7, at(2)), true);
  assert.equal(quietHoursActive(22, 7, at(6)), true);
  assert.equal(quietHoursActive(22, 7, at(7)), false);
  assert.equal(quietHoursActive(22, 7, at(12)), false);
});

test("quietHoursActive: unset or zero-length → never quiet", () => {
  assert.equal(quietHoursActive(null, 7, at(2)), false);
  assert.equal(quietHoursActive(22, null, at(2)), false);
  assert.equal(quietHoursActive(undefined, undefined, at(2)), false);
  assert.equal(quietHoursActive(8, 8, at(8)), false);
});

test("formatHour / describeQuietHours: friendly labels", () => {
  assert.equal(formatHour(0), "12 AM");
  assert.equal(formatHour(12), "12 PM");
  assert.equal(formatHour(22), "10 PM");
  assert.equal(formatHour(7), "7 AM");
  assert.equal(describeQuietHours(22, 7), "10 PM – 7 AM");
  assert.equal(describeQuietHours(null, 7), null);
  assert.equal(describeQuietHours(8, 8), null);
});
