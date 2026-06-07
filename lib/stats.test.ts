// Test doubles below stand in for the Prisma client; `any` keeps the fakes
// lightweight (we only implement the handful of methods under test).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { test } from "node:test";
import assert from "node:assert/strict";
import { getVolunteerImpact } from "./stats";

type Ev = { actorId: string; type: string; listingId: string };
type Lst = {
  id: string;
  servings: number;
  weightLbs: number | null;
  restaurantId: string;
};

// Minimal fake Prisma slice: canned event + listing tables, filtered in-memory
// to mirror the `where` clauses the function uses.
function makeDb(events: Ev[], listings: Lst[]) {
  return {
    listingEvent: {
      findMany: async ({ where }: any) => {
        const types: string[] = where.type.in;
        return events.filter(
          (e) => e.actorId === where.actorId && types.includes(e.type)
        );
      },
    },
    foodListing: {
      findMany: async ({ where }: any) => {
        const ids: string[] = where.id.in;
        return listings.filter((l) => ids.includes(l.id));
      },
    },
  } as any;
}

test("aggregates impact, credits a buddy seat, and uses the weight fallback", async () => {
  // u1 delivered L1 (as primary) and L2 (as buddy — same actorId on its own
  // delivered event), and flaked once (released L3). L2 has no weightLbs.
  const events: Ev[] = [
    { actorId: "u1", type: "delivered", listingId: "L1" },
    { actorId: "u1", type: "delivered", listingId: "L2" },
    { actorId: "u1", type: "released", listingId: "L3" },
  ];
  const listings: Lst[] = [
    { id: "L1", servings: 10, weightLbs: 8, restaurantId: "r1" },
    { id: "L2", servings: 5, weightLbs: null, restaurantId: "r1" },
  ];
  const impact = await getVolunteerImpact("u1", makeDb(events, listings));

  assert.equal(impact.mealsRescued, 15);
  assert.equal(impact.lbsSaved, 12); // 8 + round(5 * 0.8 = 4)
  assert.equal(impact.pickupsCompleted, 2);
  assert.equal(impact.restaurantsHelped, 1); // both from r1
  assert.equal(impact.attempts, 3); // 2 delivered + 1 released
  assert.equal(impact.completionRate, 67); // round(2/3 * 100)
});

test("counts distinct restaurants once", async () => {
  const events: Ev[] = [
    { actorId: "u1", type: "delivered", listingId: "L1" },
    { actorId: "u1", type: "delivered", listingId: "L2" },
  ];
  const listings: Lst[] = [
    { id: "L1", servings: 3, weightLbs: null, restaurantId: "r1" },
    { id: "L2", servings: 3, weightLbs: null, restaurantId: "r2" },
  ];
  const impact = await getVolunteerImpact("u1", makeDb(events, listings));
  assert.equal(impact.restaurantsHelped, 2);
  assert.equal(impact.completionRate, 100);
});

test("returns all zeros with no divide-by-zero for a new volunteer", async () => {
  const impact = await getVolunteerImpact("nobody", makeDb([], []));
  assert.deepEqual(impact, {
    mealsRescued: 0,
    lbsSaved: 0,
    pickupsCompleted: 0,
    restaurantsHelped: 0,
    completionRate: 0,
    attempts: 0,
  });
});
