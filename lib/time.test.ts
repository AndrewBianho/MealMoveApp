import { test } from "node:test";
import assert from "node:assert/strict";
import { formatEventTime } from "./time";

// Regression for UX audit MM-01: the feed card (a Server Component, formatting
// in the deploy's UTC) and the detail stepper (a client component, formatting
// in the browser's zone) showed the same rescue's timestamps hours apart.
// formatEventTime pins every stamp to the org timezone, so the value no longer
// depends on where it renders. These assertions lock that: a known instant must
// format to its America/New_York wall-clock time regardless of the ambient TZ.

// 2026-07-15T17:18:00Z is 1:18 PM in America/New_York (EDT, UTC-4).
const JULY_AFTERNOON_UTC = Date.UTC(2026, 6, 15, 17, 18, 0);

test("formats an event time in the org timezone, not the runtime's", () => {
  // A past date, so it takes the weekday branch ("Wed, 1:18 PM"); we assert the
  // time portion only, which is what the bug got wrong. The ET wall-clock time
  // is 1:18 PM — never the 5:18 PM a UTC runtime would have printed.
  const out = formatEventTime(JULY_AFTERNOON_UTC);
  assert.ok(out.includes("1:18 PM"), `expected ET 1:18 PM, got ${out}`);
});

test("is stable regardless of the process timezone", () => {
  const original = process.env.TZ;
  try {
    process.env.TZ = "Asia/Tokyo";
    const tokyo = formatEventTime(JULY_AFTERNOON_UTC);
    process.env.TZ = "America/Los_Angeles";
    const la = formatEventTime(JULY_AFTERNOON_UTC);
    // Both pin to ET, so they agree with each other (and both read 1:18 PM).
    assert.equal(tokyo, la);
    assert.ok(tokyo.includes("1:18 PM"), `expected ET 1:18 PM, got ${tokyo}`);
  } finally {
    process.env.TZ = original;
  }
});

test("returns an empty string for missing timestamps", () => {
  assert.equal(formatEventTime(undefined), "");
  assert.equal(formatEventTime(null), "");
  assert.equal(formatEventTime(0), "");
});
