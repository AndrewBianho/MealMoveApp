// `any` keeps the lightweight test doubles below readable.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildAnnouncementPayload,
  sendAnnouncement,
  unseenCount,
} from "./announcements";

test("buildAnnouncementPayload routes to /updates with title as subject", () => {
  const p = buildAnnouncementPayload({ title: "Hi", body: "Body text" });
  assert.equal(p.url, "/updates");
  assert.equal(p.title, "Hi");
  assert.equal(p.email.subject, "Hi");
  assert.match(p.email.html, /Body text/);
});

test("buildAnnouncementPayload truncates a long push body", () => {
  const long = "x".repeat(300);
  const p = buildAnnouncementPayload({ title: "t", body: long });
  assert.ok(p.body.length <= 140);
  assert.ok(p.body.endsWith("…"));
});

test("sendAnnouncement dispatches to the resolved audience and stamps the label", async () => {
  const created: any[] = [];
  const updated: any[] = [];
  const findWhere: any[] = [];
  const dispatched: any[] = [];
  const db: any = {
    announcement: {
      create: async ({ data }: any) => {
        created.push(data);
        return { id: "ann1" };
      },
      update: async (args: any) => void updated.push(args),
    },
    user: {
      findMany: async (args: any) => {
        findWhere.push(args.where);
        return [{ id: "v1", lat: null, lng: null }, { id: "v2", lat: null, lng: null }];
      },
    },
    listingEvent: { groupBy: async () => [], findMany: async () => [] },
    pickup: { groupBy: async () => [] },
    restaurant: { findFirst: async () => null },
    dropOff: { findFirst: async () => null },
  };
  const dispatch = (async (id: string, _p: any, opts: any) => {
    dispatched.push({ id, opts });
    return { channel: "push" as const };
  }) as any;

  const res = await sendAnnouncement(
    { authorId: "admin1", title: "T", body: "B", world: "real", audience: { kind: "everyone" } },
    { db, dispatch }
  );

  assert.equal(res.recipientCount, 2);
  assert.deepEqual(created[0], {
    authorId: "admin1",
    title: "T",
    body: "B",
    demo: false,
    audienceLabel: "Everyone",
  });
  assert.deepEqual(findWhere[0], { role: "volunteer", status: "active", dataMode: "real" });
  assert.equal(dispatched.length, 2);
  assert.equal(dispatched[0].opts.force, true);
  assert.deepEqual(updated[0], { where: { id: "ann1" }, data: { recipientCount: 2 } });
});

test("sendAnnouncement only reaches the audience's members", async () => {
  const dispatched: string[] = [];
  const db: any = {
    announcement: {
      create: async () => ({ id: "ann1" }),
      update: async () => {},
    },
    user: {
      findMany: async () => [{ id: "v1", lat: null, lng: null }, { id: "v2", lat: null, lng: null }],
    },
    // v1 has completed a rescue, so only v2 is `new`.
    listingEvent: { groupBy: async () => [], findMany: async () => [{ actorId: "v1" }] },
    pickup: { groupBy: async () => [] },
    restaurant: { findFirst: async () => null },
    dropOff: { findFirst: async () => null },
  };
  const dispatch = (async (id: string) => {
    dispatched.push(id);
    return { channel: "push" as const };
  }) as any;

  const res = await sendAnnouncement(
    { authorId: "a1", title: "T", body: "B", world: "real", audience: { kind: "new" } },
    { db, dispatch }
  );

  assert.equal(res.recipientCount, 1);
  assert.deepEqual(dispatched, ["v2"]);
});

test("unseenCount counts announcements newer than the seen timestamp", async () => {
  const seenAt = new Date("2026-07-10T00:00:00Z");
  let where: any = null;
  const db: any = {
    user: { findUnique: async () => ({ announcementsSeenAt: seenAt }) },
    announcement: {
      count: async (a: any) => {
        where = a.where;
        return 3;
      },
    },
  };
  const n = await unseenCount("v1", "real", { db });
  assert.equal(n, 3);
  assert.equal(where.demo, false);
  assert.deepEqual(where.createdAt, { gt: seenAt });
});

test("unseenCount with no seen timestamp counts all in-world", async () => {
  let where: any = null;
  const db: any = {
    user: { findUnique: async () => ({ announcementsSeenAt: null }) },
    announcement: {
      count: async (a: any) => {
        where = a.where;
        return 5;
      },
    },
  };
  const n = await unseenCount("v1", "demo", { db });
  assert.equal(n, 5);
  assert.equal(where.demo, true);
  assert.equal("createdAt" in where, false);
});
