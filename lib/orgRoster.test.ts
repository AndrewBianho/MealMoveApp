// The `any` casts below inspect the shape of the returned Prisma `where` object
// in tests; they don't warrant a full type. Same convention as lib/stats.test.ts.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { test } from "node:test";
import assert from "node:assert/strict";
import { rosterWhere, assertSameOrg } from "./orgRoster";

test("rosterWhere scopes managed roles to the admin's org but keeps partners global", () => {
  const w: any = rosterWhere("org_malvern", false);
  assert.equal(w.status, "active");
  assert.equal(w.demo, false);
  // partners branch: any org
  assert.deepEqual(w.OR[0], { role: { in: ["restaurant", "drop_off"] } });
  // managed branch: scoped to the org
  assert.deepEqual(w.OR[1], {
    role: { in: ["volunteer", "org_admin"] },
    organizationId: "org_malvern",
  });
});

test("rosterWhere with no admin org shows partners only (managed roles excluded)", () => {
  const w: any = rosterWhere(null, true);
  assert.equal(w.demo, true);
  assert.equal(w.OR.length, 1);
  assert.deepEqual(w.OR[0], { role: { in: ["restaurant", "drop_off"] } });
});

test("assertSameOrg is true only for matching non-null orgs", () => {
  assert.equal(assertSameOrg("a", "a"), true);
  assert.equal(assertSameOrg("a", "b"), false);
  assert.equal(assertSameOrg(null, "a"), false);
  assert.equal(assertSameOrg("a", null), false);
  assert.equal(assertSameOrg(null, null), false);
});
