import { test } from "node:test";
import assert from "node:assert/strict";
import { isSuperAdmin, isAdmin, canClaimPickups, roleAllowed } from "./roles";

test("isSuperAdmin only true for super_admin", () => {
  assert.equal(isSuperAdmin("super_admin"), true);
  assert.equal(isSuperAdmin("org_admin"), false);
  assert.equal(isSuperAdmin("volunteer"), false);
  assert.equal(isSuperAdmin(null), false);
  assert.equal(isSuperAdmin(undefined), false);
});

test("isAdmin true for org_admin and super_admin only", () => {
  assert.equal(isAdmin("org_admin"), true);
  assert.equal(isAdmin("super_admin"), true);
  assert.equal(isAdmin("volunteer"), false);
  assert.equal(isAdmin("restaurant"), false);
  assert.equal(isAdmin(null), false);
});

test("canClaimPickups is volunteer-only — every other account type is out", () => {
  assert.equal(canClaimPickups("volunteer"), true);
  assert.equal(canClaimPickups("restaurant"), false);
  assert.equal(canClaimPickups("drop_off"), false);
  assert.equal(canClaimPickups("org_admin"), false);
  // Deliberate: super_admin passes every viewing gate but never claims.
  assert.equal(canClaimPickups("super_admin"), false);
  assert.equal(canClaimPickups(null), false);
  assert.equal(canClaimPickups(undefined), false);
});

test("roleAllowed lets super_admin pass any gate, others only when listed", () => {
  assert.equal(roleAllowed("super_admin", ["volunteer"]), true);
  assert.equal(roleAllowed("org_admin", ["org_admin"]), true);
  assert.equal(roleAllowed("volunteer", ["org_admin"]), false);
  assert.equal(roleAllowed(null, ["volunteer"]), false);
});
