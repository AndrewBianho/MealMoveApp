import { test } from "node:test";
import assert from "node:assert/strict";
import { googleMapsDirectionsUrl } from "./directions";

test("routes you → pickup → drop-off when both legs are known", () => {
  const url = googleMapsDirectionsUrl({
    pickup: { lat: 40.1, lng: -75.3 },
    dropOff: { lat: 40.2, lng: -75.4 },
  });
  assert.ok(url);
  const q = new URL(url).searchParams;
  assert.equal(q.get("api"), "1");
  assert.equal(q.get("travelmode"), "driving");
  // Destination is the drop-off; the pickup is the intermediate waypoint.
  assert.equal(q.get("destination"), "40.2,-75.4");
  assert.equal(q.get("waypoints"), "40.1,-75.3");
});

test("falls back to the pickup as destination before a drop-off is chosen", () => {
  const url = googleMapsDirectionsUrl({ pickup: { lat: 40.1, lng: -75.3 } });
  assert.ok(url);
  const q = new URL(url).searchParams;
  assert.equal(q.get("destination"), "40.1,-75.3");
  assert.equal(q.get("waypoints"), null);
});

test("returns null when there is nowhere to navigate", () => {
  assert.equal(googleMapsDirectionsUrl({}), null);
  assert.equal(googleMapsDirectionsUrl({ pickup: null, dropOff: null }), null);
});
