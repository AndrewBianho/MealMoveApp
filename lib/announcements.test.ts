// `any` keeps the lightweight test doubles below readable.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildAnnouncementPayload,
  sendAnnouncement,
  unseenCount,
  listAnnouncementsFor,
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
    pickup: { findMany: async () => [] },
    restaurant: { findFirst: async () => null },
    dropOff: { findFirst: async () => null },
  };
  const dispatch = (async (id: string, _p: any, opts: any) => {
    dispatched.push({ id, opts });
    return { channel: "push" as const };
  }) as any;

  const res = await sendAnnouncement(
    { authorId: "admin1", title: "T", body: "B", world: "real", audience: { kind: "everyone" }, organizationId: "org_x" },
    { db, dispatch }
  );

  assert.equal(res.recipientCount, 2);
  assert.deepEqual(created[0], {
    authorId: "admin1",
    title: "T",
    body: "B",
    demo: false,
    audienceLabel: "Everyone",
    recipientIds: ["v1", "v2"],
    organizationId: "org_x",
  });
  assert.deepEqual(findWhere[0], { role: "volunteer", status: "active", dataMode: "real", organizationId: "org_x" });
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
    pickup: { findMany: async () => [] },
    restaurant: { findFirst: async () => null },
    dropOff: { findFirst: async () => null },
  };
  const dispatch = (async (id: string) => {
    dispatched.push(id);
    return { channel: "push" as const };
  }) as any;

  const res = await sendAnnouncement(
    { authorId: "a1", title: "T", body: "B", world: "real", audience: { kind: "new" }, organizationId: "org_x" },
    { db, dispatch }
  );

  assert.equal(res.recipientCount, 1);
  assert.deepEqual(dispatched, ["v2"]);
});

test("sendAnnouncement throws when the resolved audience is empty (TOCTOU guard)", async () => {
  const db: any = {
    announcement: {
      create: async () => {
        throw new Error("should never be called — audience is empty");
      },
      update: async () => {},
    },
    user: { findMany: async () => [] },
    listingEvent: { groupBy: async () => [], findMany: async () => [] },
    pickup: { findMany: async () => [] },
    restaurant: { findFirst: async () => null },
    dropOff: { findFirst: async () => null },
  };
  const dispatch = (async () => ({ channel: "push" as const })) as any;

  await assert.rejects(
    () =>
      sendAnnouncement(
        { authorId: "a1", title: "T", body: "B", world: "real", audience: { kind: "everyone" }, organizationId: "org_x" },
        { db, dispatch }
      ),
    /no volunteers/i
  );
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
  assert.deepEqual(where.recipientIds, { has: "v1" });
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
  assert.deepEqual(where.recipientIds, { has: "v1" });
  assert.equal("createdAt" in where, false);
});

test("unseenCount only counts announcements whose recipientIds contains the user", async () => {
  // A real (non-mocked) where-filter check: simulate two announcements, one
  // targeted at v1, one not, and confirm the query is scoped by recipient.
  let capturedWhere: any = null;
  const announcements = [
    { id: "a1", recipientIds: ["v1", "v2"] },
    { id: "a2", recipientIds: ["v2"] },
  ];
  const db: any = {
    user: { findUnique: async () => ({ announcementsSeenAt: null }) },
    announcement: {
      count: async (a: any) => {
        capturedWhere = a.where;
        return announcements.filter((x) => x.recipientIds.includes(a.where.recipientIds.has))
          .length;
      },
    },
  };
  const n = await unseenCount("v1", "real", { db });
  assert.equal(n, 1);
  assert.deepEqual(capturedWhere.recipientIds, { has: "v1" });
});

test("listAnnouncementsFor filters by recipient, unlike the admin's listAnnouncements", async () => {
  let where: any = null;
  const db: any = {
    announcement: {
      findMany: async (a: any) => {
        where = a.where;
        return [];
      },
    },
  };
  await listAnnouncementsFor("v1", "real", { db });
  assert.equal(where.demo, false);
  assert.deepEqual(where.recipientIds, { has: "v1" });
});

test("sendAnnouncement stores organizationId and scopes the audience", async () => {
  const created: any[] = [];
  let resolveOrg: string | undefined = "unset";
  const d: any = {
    announcement: {
      create: async (a: any) => {
        created.push(a.data);
        return { id: "a1", ...a.data };
      },
      update: async () => ({}),
    },
    user: { findMany: async () => [] },
  };
  await sendAnnouncement(
    {
      authorId: "admin1",
      title: "Hi",
      body: "Body",
      world: "real",
      audience: { kind: "everyone" },
      organizationId: "org_malvern",
    },
    {
      db: d,
      dispatch: (async () => {}) as any,
      resolve: (async (_a: any, _w: any, deps: any) => {
        resolveOrg = deps?.organizationId;
        return { ids: ["v1"], label: "Everyone" };
      }) as any,
    }
  );
  assert.equal(created[0].organizationId, "org_malvern");
  assert.equal(resolveOrg, "org_malvern");
});
