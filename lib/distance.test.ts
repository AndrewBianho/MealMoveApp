import { test } from "node:test";
import assert from "node:assert/strict";
import { haversineMiles, formatMiles } from "./distance";

test("haversineMiles is zero for the same point", () => {
  const p = { lat: 40.0, lng: -75.0 };
  assert.equal(haversineMiles(p, p), 0);
});

test("haversineMiles ~ 69 miles per degree of latitude", () => {
  const d = haversineMiles({ lat: 40, lng: -75 }, { lat: 41, lng: -75 });
  assert.ok(Math.abs(d - 69) < 0.5, `expected ~69 mi, got ${d}`);
});

test("haversineMiles is symmetric", () => {
  const a = { lat: 39.95, lng: -75.19 };
  const b = { lat: 40.01, lng: -75.13 };
  assert.ok(Math.abs(haversineMiles(a, b) - haversineMiles(b, a)) < 1e-9);
});

test("formatMiles labels close, mid, and far ranges", () => {
  assert.equal(formatMiles(0.04), "<0.1 mi");
  assert.equal(formatMiles(0.42), "0.4 mi");
  assert.equal(formatMiles(3.27), "3.3 mi");
  assert.equal(formatMiles(12.6), "13 mi");
});

test("formatMiles falls back to the em-dash placeholder for non-finite input", () => {
  assert.equal(formatMiles(NaN), "—");
  assert.equal(formatMiles(Infinity), "—");
});
