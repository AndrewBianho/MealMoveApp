/* eslint-disable @typescript-eslint/no-explicit-any */
import { test } from "node:test";
import assert from "node:assert/strict";
import { getOrgVolunteerImpact } from "./orgStats";

// Two delivered pickups by org volunteers (12 + 8 meals), across 2 volunteers.
function db(capture?: (w: any) => void): any {
  return {
    pickup: {
      findMany: async (a: any) => {
        capture?.(a.where);
        return [
          { volunteerId: "v1", listing: { servings: 12 } },
          { volunteerId: "v2", listing: { servings: 8 } },
        ];
      },
    },
  };
}

test("sums meals and counts distinct volunteers for the org", async () => {
  const r = await getOrgVolunteerImpact("org_malvern", { db: db() });
  assert.equal(r.meals, 20);
  assert.equal(r.volunteers, 2);
  assert.equal(r.pickups, 2);
});

test("filters pickups by the org's volunteers", async () => {
  let where: any = null;
  await getOrgVolunteerImpact("org_malvern", { db: db((w) => (where = w)) });
  assert.deepEqual(where.volunteer, { organizationId: "org_malvern" });
  assert.deepEqual(where.deliveredAt, { not: null });
});

test("scopes to the world's listings when a world is given", async () => {
  let where: any = null;
  await getOrgVolunteerImpact("org_malvern", { db: db((w) => (where = w)), world: "real" });
  assert.deepEqual(where.listing, { demo: false });
  assert.deepEqual(where.volunteer, { organizationId: "org_malvern" });
});

test("without a world, does not filter by listing demo flag", async () => {
  let where: any = null;
  await getOrgVolunteerImpact("org_malvern", { db: db((w) => (where = w)) });
  assert.equal("listing" in where, false);
});

test("counts distinct volunteers when one volunteer has multiple pickups", async () => {
  const d: any = {
    pickup: {
      findMany: async () => [
        { volunteerId: "v1", listing: { servings: 5 } },
        { volunteerId: "v1", listing: { servings: 7 } },
      ],
    },
  };
  const r = await getOrgVolunteerImpact("org_x", { db: d });
  assert.equal(r.meals, 12);
  assert.equal(r.volunteers, 1);
  assert.equal(r.pickups, 2);
});
