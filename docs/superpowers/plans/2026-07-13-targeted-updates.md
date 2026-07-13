# Targeted Updates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an org admin target an update at a specific group of volunteers (reliability band, first-timers, lapsed, or near a location) instead of only "everyone."

**Architecture:** A new `lib/segments.ts` owns an `Audience` discriminated union and one `resolveAudience(audience, world)` function that filters the same base set — active in-world volunteers — down to the matching IDs, returning both the IDs and a human label. `sendAnnouncement` swaps its inline "all volunteers" query for that resolver. The composer gains an audience picker with a live recipient count. Delivery (force push/email + the in-app inbox) is untouched.

**Tech Stack:** Next.js 14 App Router (RSC + server actions), Prisma/PostgreSQL, Tailwind, `node:test` for lib units.

## Global Constraints

- **Only `Code/` is committed**; commit directly to `main` (no feature branches). The repo has pre-existing untracked iCloud-duplicate files (`"* 2.tsx"`, `"migration 2.sql"`) — **never stage them**.
- **After Prisma migrate: restart `next dev`** — new fields are undefined at runtime until then. Do NOT run `npm run build` while `next dev` is live.
- **Tailwind only**; existing tokens only — **never a new color/hex**. Sentence case everywhere. `font-mono` for counts/metadata, `font-display` for card titles, `font-sans` for body. Text is `neutral-800/900` (primary) or `neutral-700` (secondary); never `neutral-400/500/600` for text.
- **This is a staff-console surface** → compact scale: body `text-sm`, mono micro-labels `text-[11px]`, chips `text-[13px]`.
- **NON-PUNITIVE IS A HARD REQUIREMENT.** The audience block is **not a status surface**: never `urgent`(honey) or `failed`(tomato) hues, even for the low-reliability band. Segment labels are **intent-named**, never deficit-named. The compose flow shows a **count only** — never names, never individual percentages, never a list of who is in a segment.
- Reliability bands reuse the app's existing meter thresholds: **≥80 / 50–79 / <50**. No new scoring is invented.
- Existing behavior must be preserved: an `Audience` of `{ kind: "everyone" }` reproduces today's send exactly.
- Run one test file: `node --require ./lib/stub-server-only.cjs --import tsx --test lib/<name>.test.ts`. Full suite: `npm test`. Typecheck: `npm run typecheck`.

---

### Task 1: Schema — `Announcement.audienceLabel`

**Files:**
- Modify: `prisma/schema.prisma`
- Creates: `prisma/migrations/<timestamp>_announcement_audience/migration.sql` (generated)

**Interfaces:**
- Produces: `Announcement.audienceLabel: String @default("Everyone")`.

- [ ] **Step 1: Add the field**

In the `Announcement` model in `prisma/schema.prisma`, add this line after `body`:

```prisma
  // Human label of who this went to ("Everyone", "New volunteers",
  // "Volunteers near Maple St Cafe · 5 mi"). Denormalized at send for the log.
  audienceLabel  String   @default("Everyone")
```

- [ ] **Step 2: Create the migration**

Run: `npm run db:migrate -- --name announcement_audience`
Expected: an additive migration (one `ALTER TABLE "Announcement" ADD COLUMN "audienceLabel" TEXT NOT NULL DEFAULT 'Everyone'`), applied, client regenerated. Existing rows backfill to `Everyone`.

- [ ] **Step 3: Verify the field exists**

Run: `node --import tsx -e "import {prisma} from './lib/prisma'; prisma.announcement.findFirst({select:{audienceLabel:true}}).then(r=>console.log('ok',r)).finally(()=>prisma.\$disconnect())"`
Expected: prints `ok` (with a row or `null`), no unknown-field error.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add Announcement.audienceLabel for targeted updates"
```

---

### Task 2: `lib/segments.ts` — the audience resolver

**Files:**
- Create: `lib/segments.ts`
- Test: `lib/segments.test.ts`

**Interfaces:**
- Consumes: `milesBetween` (`lib/geo`), `World` (`lib/announcements`), `prisma`.
- Produces:
  - `type Audience` (discriminated union), `ReliabilityBand`, `LapsedDays`, `RadiusMi`, `AnchorKind`
  - `RELIABILITY_BANDS`, `LAPSED_DAYS`, `RADII` (option constants the UI renders from)
  - `interface ResolvedAudience { ids: string[]; label: string }`
  - `resolveAudience(audience, world, deps?): Promise<ResolvedAudience>`
  - `countAudience(audience, world, deps?): Promise<number>`
  - `cleanAudience(input: unknown): Audience | null` (server-side validation)

**Note on the interface:** `resolveAudience` returns `{ ids, label }` together (rather than a separate `audienceLabel()` function as the spec sketched) so the `near` anchor is looked up once instead of twice. Same behavior, one query fewer.

- [ ] **Step 1: Write the failing tests**

Create `lib/segments.test.ts`:

```ts
// `any` keeps the lightweight test doubles below readable.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveAudience, countAudience, cleanAudience } from "./segments";

// v2 sits ~3.45 mi north of v1's point; v3 has no known position.
const VOLS = [
  { id: "v1", lat: 40.0, lng: -75.0 },
  { id: "v2", lat: 40.05, lng: -75.0 },
  { id: "v3", lat: null, lng: null },
];

function db(over: any = {}): any {
  return {
    user: { findMany: async () => VOLS },
    listingEvent: { groupBy: async () => [], findMany: async () => [] },
    pickup: { groupBy: async () => [] },
    restaurant: { findFirst: async () => null },
    dropOff: { findFirst: async () => null },
    ...over,
  };
}

test("everyone resolves to all active in-world volunteers", async () => {
  const r = await resolveAudience({ kind: "everyone" }, "real", { db: db() });
  assert.deepEqual(r.ids, ["v1", "v2", "v3"]);
  assert.equal(r.label, "Everyone");
});

test("everyone queries active in-world volunteers only", async () => {
  let where: any = null;
  const d = db({
    user: {
      findMany: async (a: any) => {
        where = a.where;
        return VOLS;
      },
    },
  });
  await resolveAudience({ kind: "everyone" }, "demo", { db: d });
  assert.deepEqual(where, { role: "volunteer", status: "active", dataMode: "demo" });
});

test("reliability bands split at 50 and 80 and exclude no-history volunteers", async () => {
  const events = [
    // v1: 1 delivered / 1 flaked = 50% -> finding_footing
    { actorId: "v1", type: "delivered", _count: { _all: 1 } },
    { actorId: "v1", type: "released", _count: { _all: 1 } },
    // v2: 1 delivered / 4 flaked = 20% -> needs_support
    { actorId: "v2", type: "delivered", _count: { _all: 1 } },
    { actorId: "v2", type: "failed", _count: { _all: 4 } },
    // v3: no events -> in no band at all
  ];
  const d = db({ listingEvent: { groupBy: async () => events, findMany: async () => [] } });

  const low = await resolveAudience({ kind: "reliability", band: "needs_support" }, "real", { db: d });
  assert.deepEqual(low.ids, ["v2"]);

  const mid = await resolveAudience({ kind: "reliability", band: "finding_footing" }, "real", { db: d });
  assert.deepEqual(mid.ids, ["v1"]);

  const star = await resolveAudience({ kind: "reliability", band: "star" }, "real", { db: d });
  assert.deepEqual(star.ids, []);
});

test("reliability scopes the event query to the world", async () => {
  let where: any = null;
  const d = db({
    listingEvent: {
      groupBy: async (a: any) => {
        where = a.where;
        return [];
      },
      findMany: async () => [],
    },
  });
  await resolveAudience({ kind: "reliability", band: "star" }, "demo", { db: d });
  assert.deepEqual(where.listing, { demo: true });
  assert.deepEqual(where.type, { in: ["delivered", "released", "failed"] });
});

test("new = active volunteers with no delivered event", async () => {
  const d = db({
    listingEvent: { groupBy: async () => [], findMany: async () => [{ actorId: "v1" }] },
  });
  const r = await resolveAudience({ kind: "new" }, "real", { db: d });
  assert.deepEqual(r.ids, ["v2", "v3"]);
  assert.equal(r.label, "New volunteers");
});

test("lapsed excludes never-claimed volunteers and respects the cutoff", async () => {
  const now = new Date("2026-07-13T00:00:00Z");
  const d = db({
    pickup: {
      groupBy: async () => [
        { volunteerId: "v1", _max: { claimedAt: new Date("2026-05-01T00:00:00Z") } }, // > 30d
        { volunteerId: "v2", _max: { claimedAt: new Date("2026-07-10T00:00:00Z") } }, // < 30d
        // v3 never claimed -> `new`, not lapsed
      ],
    },
  });
  const r = await resolveAudience({ kind: "lapsed", days: 30 }, "real", { db: d, now });
  assert.deepEqual(r.ids, ["v1"]);
  assert.match(r.label, /30\+ days/);
});

test("near filters by radius and drops volunteers with no position", async () => {
  const d = db({
    restaurant: { findFirst: async () => ({ name: "Maple St Cafe", lat: 40.0, lng: -75.0 }) },
  });
  const r = await resolveAudience(
    { kind: "near", anchor: { kind: "restaurant", id: "r1" }, radiusMi: 2 },
    "real",
    { db: d }
  );
  assert.deepEqual(r.ids, ["v1"]); // v2 is ~3.45 mi out; v3 has no position
  assert.match(r.label, /Maple St Cafe/);
});

test("near with a missing or out-of-world anchor matches nobody", async () => {
  const r = await resolveAudience(
    { kind: "near", anchor: { kind: "dropoff", id: "nope" }, radiusMi: 5 },
    "real",
    { db: db() }
  );
  assert.deepEqual(r.ids, []);
});

test("countAudience returns the resolved size", async () => {
  assert.equal(await countAudience({ kind: "everyone" }, "real", { db: db() }), 3);
});

test("cleanAudience accepts valid shapes and rejects bad ones", () => {
  assert.deepEqual(cleanAudience({ kind: "everyone" }), { kind: "everyone" });
  assert.deepEqual(cleanAudience({ kind: "new" }), { kind: "new" });
  assert.deepEqual(cleanAudience({ kind: "lapsed", days: 30 }), { kind: "lapsed", days: 30 });
  assert.deepEqual(
    cleanAudience({ kind: "near", anchor: { kind: "restaurant", id: "r1" }, radiusMi: 5 }),
    { kind: "near", anchor: { kind: "restaurant", id: "r1" }, radiusMi: 5 }
  );
  assert.equal(cleanAudience({ kind: "lapsed", days: 7 }), null); // not an allowed preset
  assert.equal(cleanAudience({ kind: "reliability", band: "bogus" }), null);
  assert.equal(cleanAudience({ kind: "near", anchor: { kind: "restaurant", id: "r1" }, radiusMi: 3 }), null);
  assert.equal(cleanAudience({ kind: "nope" }), null);
  assert.equal(cleanAudience(null), null);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --require ./lib/stub-server-only.cjs --import tsx --test lib/segments.test.ts`
Expected: FAIL — `Cannot find module './segments'`.

- [ ] **Step 3: Implement the module**

Create `lib/segments.ts`:

```ts
import type { PrismaClient } from "@prisma/client";
import { prisma } from "./prisma";
import { milesBetween } from "./geo";
import type { World } from "./announcements";

// Who an org-admin update goes to. Every audience is a filter over the same
// base — active volunteers in the admin's world — so demo/real never mix.
//
// NON-PUNITIVE BY CONSTRUCTION (PRODUCT.md: "reliability is felt, not
// punished"): the reliability bands exist to aim *support*, never to grade or
// rank a person. Labels are intent-named, callers only ever surface a count,
// and no name or individual percentage leaves this module.

export type ReliabilityBand = "needs_support" | "finding_footing" | "star";
export type LapsedDays = 14 | 30 | 60;
export type RadiusMi = 2 | 5 | 10;
export type AnchorKind = "restaurant" | "dropoff";

export type Audience =
  | { kind: "everyone" }
  | { kind: "reliability"; band: ReliabilityBand }
  | { kind: "new" }
  | { kind: "lapsed"; days: LapsedDays }
  | { kind: "near"; anchor: { kind: AnchorKind; id: string }; radiusMi: RadiusMi };

export const RELIABILITY_BANDS: readonly ReliabilityBand[] = [
  "needs_support",
  "finding_footing",
  "star",
];
export const LAPSED_DAYS: readonly LapsedDays[] = [14, 30, 60];
export const RADII: readonly RadiusMi[] = [2, 5, 10];

const BAND_LABEL: Record<ReliabilityBand, string> = {
  needs_support: "Volunteers who could use encouragement",
  finding_footing: "Volunteers finding their footing",
  star: "Volunteers who've been rock solid",
};

// The reliability meter's existing thresholds — sage ≥80 / honey 50–79 /
// tomato <50. Reused, not reinvented.
function bandOf(pct: number): ReliabilityBand {
  if (pct >= 80) return "star";
  if (pct >= 50) return "finding_footing";
  return "needs_support";
}

export interface ResolvedAudience {
  ids: string[];
  label: string;
}

type SegDb = Pick<
  PrismaClient,
  "user" | "listingEvent" | "pickup" | "restaurant" | "dropOff"
>;

const MS_PER_DAY = 86_400_000;

async function findAnchor(
  db: SegDb,
  anchor: { kind: AnchorKind; id: string },
  demo: boolean
): Promise<{ name: string; lat: number; lng: number } | null> {
  // Scoped by `demo`, so an anchor from the other world simply isn't found and
  // the audience resolves to nobody.
  const row =
    anchor.kind === "restaurant"
      ? await db.restaurant.findFirst({
          where: { id: anchor.id, demo },
          select: { name: true, lat: true, lng: true },
        })
      : await db.dropOff.findFirst({
          where: { id: anchor.id, demo },
          select: { name: true, lat: true, lng: true },
        });
  return row ?? null;
}

export async function resolveAudience(
  audience: Audience,
  world: World,
  deps: { db?: SegDb; now?: Date } = {}
): Promise<ResolvedAudience> {
  const db = deps.db ?? prisma;
  const now = deps.now ?? new Date();
  const demo = world === "demo";

  // One base set, filtered five ways.
  const base = await db.user.findMany({
    where: { role: "volunteer", status: "active", dataMode: world },
    select: { id: true, lat: true, lng: true },
  });

  switch (audience.kind) {
    case "everyone":
      return { ids: base.map((v) => v.id), label: "Everyone" };

    case "reliability": {
      // Same signal as the reliability meter: a delivered event counts for a
      // volunteer; a released (hold expired) or failed one counts against.
      const rows = await db.listingEvent.groupBy({
        by: ["actorId", "type"],
        where: {
          actorId: { not: null },
          type: { in: ["delivered", "released", "failed"] },
          listing: { demo },
        },
        _count: { _all: true },
      });

      const tally = new Map<string, { delivered: number; flaked: number }>();
      for (const r of rows) {
        if (!r.actorId) continue;
        const t = tally.get(r.actorId) ?? { delivered: 0, flaked: 0 };
        if (r.type === "delivered") t.delivered += r._count._all;
        else t.flaked += r._count._all;
        tally.set(r.actorId, t);
      }

      const ids = base
        .filter((v) => {
          const t = tally.get(v.id);
          // No history at all → they're `new`, never sorted into a band.
          if (!t) return false;
          const total = t.delivered + t.flaked;
          if (total === 0) return false;
          return bandOf(Math.round((t.delivered / total) * 100)) === audience.band;
        })
        .map((v) => v.id);

      return { ids, label: BAND_LABEL[audience.band] };
    }

    case "new": {
      const done = await db.listingEvent.findMany({
        where: { actorId: { not: null }, type: "delivered", listing: { demo } },
        select: { actorId: true },
        distinct: ["actorId"],
      });
      const completed = new Set(done.map((e) => e.actorId));
      return {
        ids: base.filter((v) => !completed.has(v.id)).map((v) => v.id),
        label: "New volunteers",
      };
    }

    case "lapsed": {
      const cutoff = new Date(now.getTime() - audience.days * MS_PER_DAY);
      const rows = await db.pickup.groupBy({
        by: ["volunteerId"],
        where: { listing: { demo } },
        _max: { claimedAt: true },
      });
      const lastClaim = new Map(rows.map((r) => [r.volunteerId, r._max.claimedAt]));

      const ids = base
        .filter((v) => {
          const at = lastClaim.get(v.id);
          // Never claimed → they're `new`, not lapsed.
          if (!at) return false;
          return at < cutoff;
        })
        .map((v) => v.id);

      return { ids, label: `Haven't been around lately · ${audience.days}+ days` };
    }

    case "near": {
      const anchor = await findAnchor(db, audience.anchor, demo);
      if (!anchor) return { ids: [], label: "Volunteers near a location" };
      const ids = base
        .filter(
          (v) =>
            v.lat !== null &&
            v.lng !== null &&
            milesBetween(v.lat, v.lng, anchor.lat, anchor.lng) <= audience.radiusMi
        )
        .map((v) => v.id);
      return {
        ids,
        label: `Volunteers near ${anchor.name} · ${audience.radiusMi} mi`,
      };
    }
  }
}

export async function countAudience(
  audience: Audience,
  world: World,
  deps: { db?: SegDb; now?: Date } = {}
): Promise<number> {
  return (await resolveAudience(audience, world, deps)).ids.length;
}

// Server-side validation: an audience arrives from the client, so never trust
// its shape. Returns null for anything not in the allowed sets.
export function cleanAudience(input: unknown): Audience | null {
  if (!input || typeof input !== "object") return null;
  const a = input as Record<string, unknown>;

  switch (a.kind) {
    case "everyone":
      return { kind: "everyone" };
    case "new":
      return { kind: "new" };
    case "reliability":
      return RELIABILITY_BANDS.includes(a.band as ReliabilityBand)
        ? { kind: "reliability", band: a.band as ReliabilityBand }
        : null;
    case "lapsed":
      return LAPSED_DAYS.includes(a.days as LapsedDays)
        ? { kind: "lapsed", days: a.days as LapsedDays }
        : null;
    case "near": {
      const anchor = a.anchor as Record<string, unknown> | undefined;
      const anchorOk =
        !!anchor &&
        (anchor.kind === "restaurant" || anchor.kind === "dropoff") &&
        typeof anchor.id === "string" &&
        anchor.id.length > 0;
      if (!anchorOk || !RADII.includes(a.radiusMi as RadiusMi)) return null;
      return {
        kind: "near",
        anchor: { kind: anchor.kind as AnchorKind, id: anchor.id as string },
        radiusMi: a.radiusMi as RadiusMi,
      };
    }
    default:
      return null;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --require ./lib/stub-server-only.cjs --import tsx --test lib/segments.test.ts`
Expected: all 10 tests PASS, output pristine.

- [ ] **Step 5: Commit**

```bash
git add lib/segments.ts lib/segments.test.ts
git commit -m "feat: add audience segments (reliability band, new, lapsed, near)"
```

---

### Task 3: Wire `sendAnnouncement` to an audience

**Files:**
- Modify: `lib/announcements.ts`
- Test: `lib/announcements.test.ts` (update the existing send test)

**Interfaces:**
- Consumes: `resolveAudience`, `Audience` (Task 2); `Announcement.audienceLabel` (Task 1).
- Produces: `sendAnnouncement({ authorId, title, body, world, audience }, deps?)` — resolves recipients via the audience, stamps `recipientCount` + `audienceLabel`. `listAnnouncements` now also selects `audienceLabel`.

- [ ] **Step 1: Update the failing test**

In `lib/announcements.test.ts`, **replace** the existing test named
`"sendAnnouncement targets active in-world volunteers and force-dispatches"`
with this version (the fake db now needs the delegates `resolveAudience` touches, and the created row carries `audienceLabel`):

```ts
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
```

Also add this test after it, proving a narrower audience actually narrows the send:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --require ./lib/stub-server-only.cjs --import tsx --test lib/announcements.test.ts`
Expected: FAIL — `sendAnnouncement` doesn't accept `audience` and doesn't write `audienceLabel`.

- [ ] **Step 3: Implement**

In `lib/announcements.ts`:

Add the import at the top:

```ts
import { resolveAudience, type Audience } from "./segments";
```

Widen the db slice (it now also feeds the resolver) — replace:

```ts
type SendDb = Pick<PrismaClient, "announcement" | "user">;
```

with:

```ts
type SendDb = Pick<
  PrismaClient,
  "announcement" | "user" | "listingEvent" | "pickup" | "restaurant" | "dropOff"
>;
```

Replace the whole `sendAnnouncement` function with:

```ts
export async function sendAnnouncement(
  input: {
    authorId: string;
    title: string;
    body: string;
    world: World;
    audience: Audience;
  },
  deps: {
    db?: SendDb;
    dispatch?: typeof dispatchToUser;
    resolve?: typeof resolveAudience;
    now?: Date;
  } = {}
): Promise<{ announcementId: string; recipientCount: number }> {
  const db = deps.db ?? prisma;
  const dispatch = deps.dispatch ?? dispatchToUser;
  const resolve = deps.resolve ?? resolveAudience;
  const demo = input.world === "demo";

  // Who hears it. `{ kind: "everyone" }` is the whole active in-world roster —
  // the original behavior.
  const { ids, label } = await resolve(input.audience, input.world, {
    db,
    now: deps.now,
  });

  const announcement = await db.announcement.create({
    data: {
      authorId: input.authorId,
      title: input.title,
      body: input.body,
      demo,
      audienceLabel: label,
    },
    select: { id: true },
  });

  const payload = buildAnnouncementPayload(input);
  await Promise.all(ids.map((id) => dispatch(id, payload, { force: true })));

  await db.announcement.update({
    where: { id: announcement.id },
    data: { recipientCount: ids.length },
  });

  return { announcementId: announcement.id, recipientCount: ids.length };
}
```

In `listAnnouncements`, add `audienceLabel` to the `select`:

```ts
    select: {
      id: true,
      title: true,
      body: true,
      createdAt: true,
      recipientCount: true,
      audienceLabel: true,
    },
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --require ./lib/stub-server-only.cjs --import tsx --test lib/announcements.test.ts`
Expected: all tests PASS (the two send tests plus the existing payload/unseen ones).

- [ ] **Step 5: Commit**

```bash
git add lib/announcements.ts lib/announcements.test.ts
git commit -m "feat: send announcements to a resolved audience"
```

---

### Task 4: Server actions — audience send + live count

**Files:**
- Modify: `app/actions.ts`

**Interfaces:**
- Consumes: `cleanAudience`, `countAudience` (Task 2); `sendAnnouncement` (Task 3); `getDataMode`.
- Produces:
  - `sendAnnouncementAction(title, body, audienceInput: unknown)` → `{ ok: true; recipientCount } | { ok: false; error }`
  - `countAudienceAction(audienceInput: unknown)` → `{ ok: true; count } | { ok: false; error }`

- [ ] **Step 1: Add the import**

At the top of `app/actions.ts`, add:

```ts
import { cleanAudience, countAudience } from "@/lib/segments";
```

(`sendAnnouncement` and `getDataMode` are already imported.)

- [ ] **Step 2: Replace `sendAnnouncementAction` and add `countAudienceAction`**

Replace the existing `sendAnnouncementAction` with the version below, and add `countAudienceAction` after it:

```ts
export async function sendAnnouncementAction(
  title: string,
  body: string,
  audienceInput: unknown
): Promise<{ ok: true; recipientCount: number } | { ok: false; error: string }> {
  const session = await auth();
  if (session?.user?.role !== "org_admin" || !session.user.id) {
    return { ok: false, error: "Only org admins can send updates." };
  }
  const t = title.trim();
  const b = body.trim();
  if (!t || !b) return { ok: false, error: "Add a title and a message." };
  if (t.length > ANN_TITLE_MAX)
    return { ok: false, error: `Title is too long (max ${ANN_TITLE_MAX}).` };
  if (b.length > ANN_BODY_MAX)
    return { ok: false, error: `Message is too long (max ${ANN_BODY_MAX}).` };

  // The audience arrives from the client — validate it, never trust it.
  const audience = cleanAudience(audienceInput);
  if (!audience) return { ok: false, error: "Pick a valid group to send to." };

  const world = await getDataMode();

  // Never send into the void: a group with nobody in it would create an
  // announcement no one hears.
  if ((await countAudience(audience, world)) === 0) {
    return { ok: false, error: "No volunteers match this group right now." };
  }

  const { recipientCount } = await sendAnnouncement({
    authorId: session.user.id,
    title: t,
    body: b,
    world,
    audience,
  });
  revalidatePath("/admin/updates");
  return { ok: true, recipientCount };
}

// Powers the composer's live "this will reach N volunteers" line. Returns a
// COUNT only — never names, never individual percentages (reliability is a
// support signal here, never a grade).
export async function countAudienceAction(
  audienceInput: unknown
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const session = await auth();
  if (session?.user?.role !== "org_admin") {
    return { ok: false, error: "Only org admins can preview a group." };
  }
  const audience = cleanAudience(audienceInput);
  if (!audience) return { ok: false, error: "Pick a valid group." };
  const world = await getDataMode();
  return { ok: true, count: await countAudience(audience, world) };
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/actions.ts
git commit -m "feat: audience-aware send action and live audience count action"
```

---

### Task 5: Composer audience picker + sent-log audience

**Files:**
- Modify: `components/AnnouncementComposer.tsx`
- Modify: `app/admin/updates/page.tsx`

**Interfaces:**
- Consumes: `countAudienceAction`, `sendAnnouncementAction` (Task 4); the `Audience` types + option constants (Task 2); `listAnnouncements` now returning `audienceLabel` (Task 3); existing `Button`, `Toast`/`useToast`, `cn`.
- Produces: `AnnouncementComposer` takes a new `anchors: AnchorOption[]` prop.

- [ ] **Step 1: Rewrite the composer**

Replace `components/AnnouncementComposer.tsx` entirely with:

```tsx
"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Button } from "./Button";
import { Toast, useToast } from "./Toast";
import { cn } from "./cn";
import { sendAnnouncementAction, countAudienceAction } from "@/app/actions";
import type {
  Audience,
  AnchorKind,
  LapsedDays,
  RadiusMi,
  ReliabilityBand,
} from "@/lib/segments";

const TITLE_MAX = 120;
const BODY_MAX = 2000;

export type AnchorOption = { kind: AnchorKind; id: string; name: string };

type Kind = Audience["kind"];

// Intent-named, never deficit-named. The reliability bands aim *support*; they
// are not a grade, and this surface shows a COUNT only — never names, never
// individual percentages (PRODUCT.md: reliability is felt, not punished).
const KINDS: Kind[] = ["everyone", "reliability", "new", "lapsed", "near"];
const KIND_LABEL: Record<Kind, string> = {
  everyone: "Everyone",
  reliability: "By how it's been going",
  new: "New volunteers",
  lapsed: "Haven't been around lately",
  near: "Near a location",
};

const BANDS: ReliabilityBand[] = ["needs_support", "finding_footing", "star"];
const BAND_LABEL: Record<ReliabilityBand, string> = {
  needs_support: "Could use encouragement",
  finding_footing: "Finding their footing",
  star: "Rock solid",
};
const DAYS: LapsedDays[] = [14, 30, 60];
const RADII: RadiusMi[] = [2, 5, 10];

// Follows the app's nav-pill spec: fully round, ink fill when active.
function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400",
        active
          ? "bg-neutral-900 text-neutral-50"
          : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200 hover:text-neutral-900"
      )}
    >
      {children}
    </button>
  );
}

// Compose card for org admins. Sending is gated behind an in-place confirm
// (no modal — matches the app's cancel-pickup pattern) because it pushes and
// emails a whole group at once.
export function AnnouncementComposer({ anchors }: { anchors: AnchorOption[] }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<Kind>("everyone");
  const [band, setBand] = useState<ReliabilityBand>("needs_support");
  const [days, setDays] = useState<LapsedDays>(30);
  const [radiusMi, setRadiusMi] = useState<RadiusMi>(5);
  const [anchorIdx, setAnchorIdx] = useState(0);
  const [reach, setReach] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { message, show } = useToast();

  const anchor = anchors[anchorIdx];

  const audience: Audience | null = useMemo(() => {
    switch (kind) {
      case "everyone":
        return { kind: "everyone" };
      case "new":
        return { kind: "new" };
      case "reliability":
        return { kind: "reliability", band };
      case "lapsed":
        return { kind: "lapsed", days };
      case "near":
        return anchor
          ? { kind: "near", anchor: { kind: anchor.kind, id: anchor.id }, radiusMi }
          : null;
    }
  }, [kind, band, days, radiusMi, anchor]);

  // Live reach preview, debounced so stepping through options doesn't spam the
  // server. A count only — this never asks for or receives names.
  useEffect(() => {
    if (!audience) {
      setReach(0);
      return;
    }
    let cancelled = false;
    setReach(null);
    const timer = setTimeout(async () => {
      const res = await countAudienceAction(audience);
      if (!cancelled) setReach(res.ok ? res.count : 0);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [audience]);

  const canSend =
    title.trim().length > 0 &&
    body.trim().length > 0 &&
    !!audience &&
    (reach ?? 0) > 0;

  function send() {
    if (!audience) return;
    startTransition(async () => {
      const res = await sendAnnouncementAction(title, body, audience);
      setConfirming(false);
      if (res.ok) {
        show(
          `Sent to ${res.recipientCount} volunteer${res.recipientCount === 1 ? "" : "s"}.`
        );
        setTitle("");
        setBody("");
      } else {
        show(res.error);
      }
    });
  }

  return (
    <section className="rounded-2xl border border-neutral-900/5 bg-card p-5 shadow-card">
      <div className="mb-4 border-b border-neutral-200 pb-4">
        <span className="mb-2 block font-mono text-[11px] text-neutral-700">Send to</span>
        <div className="flex flex-wrap gap-1.5">
          {KINDS.map((k) => (
            <Pill key={k} active={kind === k} onClick={() => setKind(k)}>
              {KIND_LABEL[k]}
            </Pill>
          ))}
        </div>

        {kind === "reliability" && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {BANDS.map((b) => (
              <Pill key={b} active={band === b} onClick={() => setBand(b)}>
                {BAND_LABEL[b]}
              </Pill>
            ))}
          </div>
        )}

        {kind === "lapsed" && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {DAYS.map((d) => (
              <Pill key={d} active={days === d} onClick={() => setDays(d)}>
                {d}+ days
              </Pill>
            ))}
          </div>
        )}

        {kind === "near" && (
          <div className="mt-3 space-y-2">
            {anchors.length === 0 ? (
              <p className="text-sm text-neutral-700">
                No locations yet — add a restaurant or drop-off first.
              </p>
            ) : (
              <>
                <select
                  value={anchorIdx}
                  onChange={(e) => setAnchorIdx(Number(e.target.value))}
                  aria-label="Location"
                  className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400"
                >
                  {anchors.map((a, i) => (
                    <option key={`${a.kind}:${a.id}`} value={i}>
                      {a.name}
                    </option>
                  ))}
                </select>
                <div className="flex flex-wrap gap-1.5">
                  {RADII.map((r) => (
                    <Pill key={r} active={radiusMi === r} onClick={() => setRadiusMi(r)}>
                      {r} mi
                    </Pill>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        <p className="mt-3 font-mono text-[11px] text-neutral-700">
          {reach === null
            ? "Counting…"
            : reach === 0
              ? "No volunteers match this group right now."
              : `This will reach ${reach} volunteer${reach === 1 ? "" : "s"}.`}
        </p>
      </div>

      <label className="block">
        <span className="mb-1 block font-mono text-[11px] text-neutral-700">Title</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value.slice(0, TITLE_MAX))}
          placeholder="Winter drive this Saturday"
          className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400"
        />
      </label>

      <label className="mt-3 block">
        <span className="mb-1 block font-mono text-[11px] text-neutral-700">Message</span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, BODY_MAX))}
          rows={4}
          placeholder="What volunteers need to know…"
          className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400"
        />
        <span className="mt-1 block text-right font-mono text-[11px] text-neutral-700">
          {body.length}/{BODY_MAX}
        </span>
      </label>

      <p className="mt-2 text-[13px] text-neutral-700">
        Write warmly — volunteers are people doing a favor, not workers being policed.
      </p>

      {confirming ? (
        <div className="mt-3 rounded-xl bg-neutral-100 p-3">
          <p className="text-sm text-neutral-800">
            Send to {KIND_LABEL[kind]} — {reach ?? 0} volunteer
            {(reach ?? 0) === 1 ? "" : "s"}? Push and email go out right away.
          </p>
          <div className="mt-3 flex gap-2">
            <Button variant="primary" onClick={send} disabled={isPending}>
              {isPending ? "Sending…" : "Yes, send it"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => setConfirming(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3">
          <Button variant="primary" onClick={() => setConfirming(true)} disabled={!canSend}>
            Send update
          </Button>
        </div>
      )}

      <Toast message={message} />
    </section>
  );
}
```

- [ ] **Step 2: Load anchors on the page and show the audience in the sent log**

In `app/admin/updates/page.tsx`:

Add the prisma import:

```tsx
import { prisma } from "@/lib/prisma";
import type { AnchorOption } from "@/components/AnnouncementComposer";
```

After `const sent = await listAnnouncements(world);`, add:

```tsx
  // Anchor options for the "near a location" audience — this world's
  // restaurants and drop-offs, which already carry coordinates.
  const demo = world === "demo";
  const [restaurants, dropOffs] = await Promise.all([
    prisma.restaurant.findMany({
      where: { demo },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.dropOff.findMany({
      where: { demo },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  const anchors: AnchorOption[] = [
    ...restaurants.map((r) => ({ kind: "restaurant" as const, id: r.id, name: r.name })),
    ...dropOffs.map((d) => ({ kind: "dropoff" as const, id: d.id, name: d.name })),
  ];
```

Change the composer call:

```tsx
      <AnnouncementComposer anchors={anchors} />
```

Update the header sub-line (it no longer always goes to everyone):

```tsx
        <p className="mt-1 text-sm text-neutral-700">
          Send a note to your volunteers — everyone, or a specific group.
        </p>
```

And in the sent log, replace the reach line:

```tsx
                <p className="mt-2 font-mono text-[11px] text-neutral-700">
                  Reached {a.recipientCount}
                </p>
```

with:

```tsx
                <p className="mt-2 font-mono text-[11px] text-neutral-700">
                  {a.audienceLabel} · reached {a.recipientCount}
                </p>
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: all tests pass (existing + Task 2/3 additions).

- [ ] **Step 5: Commit**

```bash
git add components/AnnouncementComposer.tsx app/admin/updates/page.tsx
git commit -m "feat: audience picker with live reach count in the updates composer"
```

---

## Final verification

- [ ] `npm test` — all pass. `npm run typecheck` — clean.
- [ ] Live (dev server, demo world, org admin at `/admin/updates`): switching the audience updates the "this will reach N volunteers" line; a zero-match group disables Send with the hint; sending to a narrow group reaches only those volunteers' inboxes; the sent log shows the audience label.
- [ ] Non-punitive check: nowhere in the compose flow does a volunteer **name** or an individual **percentage** appear — only counts and intent-named group labels. No honey/tomato hues on the audience block.
