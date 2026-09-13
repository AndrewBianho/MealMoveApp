// Test doubles below stand in for the Prisma client; `any` keeps the fakes
// lightweight (we only implement the handful of methods under test).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { test } from "node:test";
import assert from "node:assert/strict";
import { runSweep } from "./sweep";

// A fake db exposing only what runSweep's expire pass touches.
function sweepDb(opts: { stale: any[] }) {
  const writes: any[] = [];
  const db: any = {
    foodListing: {
      findMany: async () => opts.stale,
      update: async (args: any) => {
        writes.push(args);
        return {};
      },
    },
    listingEvent: {
      create: async ({ data }: any) => {
        writes.push(data);
        return data;
      },
    },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  };
  return { db, writes };
}

test("runSweep: expires open listings past their window", async () => {
  const { db, writes } = sweepDb({ stale: [{ id: "ls1" }, { id: "ls2" }] });
  const res = await runSweep({ db });
  assert.equal(res.expired, 2);
  assert.ok(
    writes.some((w) => w.data?.status === "expired"),
    "flips the listing to expired"
  );
  assert.ok(
    writes.some((w) => w.type === "expired" && w.listingId === "ls1"),
    "records an expired event per listing"
  );
});

test("runSweep: nothing to expire is a clean no-op", async () => {
  const { db, writes } = sweepDb({ stale: [] });
  const res = await runSweep({ db });
  assert.equal(res.expired, 0);
  assert.equal(writes.length, 0);
});

// The 15-minute claim hold was removed on 2026-09-13. The sweep no longer
// touches pickups at all, so an abandoned claim is never reclaimed here — it
// stands until the volunteer delivers or releases it.
test("runSweep: never touches pickups", async () => {
  const { db } = sweepDb({ stale: [] });
  db.pickup = {
    findMany: async () => assert.fail("sweep must not read pickups"),
    delete: async () => assert.fail("sweep must not delete pickups"),
  };
  await runSweep({ db });
});
