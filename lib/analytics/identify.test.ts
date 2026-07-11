import { test } from "node:test";
import assert from "node:assert/strict";
import { hashUserId, sanitizeProps, PII_DENYLIST } from "./identify";

test("hashUserId is deterministic sha256 hex, not the raw id", () => {
  const h = hashUserId("user_123");
  assert.equal(h, hashUserId("user_123"));
  assert.match(h, /^[a-f0-9]{64}$/);
  assert.notEqual(h, "user_123");
});

test("sanitizeProps strips every PII denylist key", () => {
  const out = sanitizeProps({
    name: "Ada", phone: "5551234567", email: "a@b.co",
    address: "1 Main", lat: 40.1, lng: -75.5, coordinates: [40, -75],
    listingId: "l1", servings: 12,
  });
  for (const k of PII_DENYLIST) assert.equal(k in out, false);
  assert.deepEqual(out, { listingId: "l1", servings: 12 });
});

test("sanitizeProps leaves non-PII props untouched", () => {
  const out = sanitizeProps({ role: "volunteer", step: 3, wasNearest: true });
  assert.deepEqual(out, { role: "volunteer", step: 3, wasNearest: true });
});
