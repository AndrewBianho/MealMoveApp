# Mass Updates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let org admins send a chapter-wide update to all volunteers, delivered as push/email and persisted to an in-app `/updates` inbox.

**Architecture:** A new `Announcement` model persists each update, tagged with the sender's world (demo/real). A pure `lib/announcements.ts` module builds the notification payload, fans out via the existing `dispatchToUser` (extended with a `force` flag that bypasses opt-out/quiet-hours for chapter comms), and answers unseen-count/inbox queries. Two server actions (org-admin send, volunteer mark-seen) sit on top. UI is a compact admin composer + sent log, and a comfortable volunteer inbox with a feed banner and nav badge.

**Tech Stack:** Next.js 14 App Router (RSC + server actions), Prisma/PostgreSQL, Tailwind, `node:test` for lib units.

## Global Constraints

- **Only `Code/` is committed** to git; commit directly to `main` (no feature branches).
- **After any Prisma migrate: restart `next dev`** — new models are undefined at runtime until the dev server restarts. Do NOT run `npm run build` while `next dev` is live.
- **Tailwind only** for styling; no inline style objects. Use existing tokens; never introduce a new color/hex.
- **Sentence case everywhere**; `font-mono` for timestamps/counts, `font-display` (Fraunces) for card titles, `font-sans` for body. Body/primary text `neutral-800/900`; secondary `neutral-700` (never `neutral-400/500/600` for text).
- **Announcements are not a status** — never honey (`urgent`)/tomato (`failed`) hues. Use neutral + `clay` (secondary accent) for the banner/badge.
- **Volunteer-facing scale**: body `text-[16px]`, card titles `text-[24px]`, touch targets ≥44px. **Staff console scale**: body `text-sm`, mono micro-labels `text-[11px]`.
- Text caps: title ≤ 120 chars, body ≤ 2000 chars — enforced server-side.
- Run one test file: `node --require ./lib/stub-server-only.cjs --import tsx --test lib/<name>.test.ts`. Typecheck: `npm run typecheck`.

---

### Task 1: Data model — `Announcement` + `User.announcementsSeenAt`

**Files:**
- Modify: `prisma/schema.prisma`
- Creates: `prisma/migrations/<timestamp>_mass_updates/migration.sql` (generated)

**Interfaces:**
- Produces: Prisma model `Announcement { id, authorId, title, body, demo, recipientCount, createdAt }`; `User.announcementsSeenAt: DateTime?`; `User.announcements` back-relation.

- [ ] **Step 1: Add the `Announcement` model**

Append to `prisma/schema.prisma` (after the last model):

```prisma
// A chapter-wide update an org admin sends to volunteers. Persisted so an
// announcement survives the push/email moment and lives in the /updates inbox
// (institutional-memory goal). World-tagged so demo/real inboxes stay separate.
model Announcement {
  id             String   @id @default(cuid())
  author         User     @relation("AnnouncementAuthor", fields: [authorId], references: [id])
  authorId       String
  title          String
  body           String   @db.Text
  demo           Boolean // sent to volunteers whose dataMode matches this world
  recipientCount Int      @default(0) // reach, stamped once at send time
  createdAt      DateTime @default(now())

  @@index([demo, createdAt])
}
```

- [ ] **Step 2: Add the `User` field and back-relation**

In the `User` model in `prisma/schema.prisma`, add these two lines next to the other notification fields (e.g. after `notifyPrimedAt`):

```prisma
  announcementsSeenAt  DateTime? // when the volunteer last opened /updates
  announcements        Announcement[] @relation("AnnouncementAuthor")
```

- [ ] **Step 3: Create the migration**

Run: `npm run db:migrate -- --name mass_updates`
Expected: Prisma creates the migration, applies it, and regenerates the client. No prompts (additive change).

- [ ] **Step 4: Restart the dev server**

Stop the running `next dev` and start it again (`npm run dev`) so the new `prisma.announcement` model is defined at runtime.
Expected: server boots, "Ready" logged.

- [ ] **Step 5: Verify the model exists**

Run: `node --import tsx -e "import {prisma} from './lib/prisma'; console.log(typeof prisma.announcement.findMany)"`
Expected: prints `function`.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add Announcement model and announcementsSeenAt for mass updates"
```

---

### Task 2: `force` flag on `dispatchToUser`

**Files:**
- Modify: `lib/notify-dispatch.ts`
- Test: `lib/notify-dispatch.test.ts`

**Interfaces:**
- Consumes: existing `dispatchToUser(userId, payload, deps)`.
- Produces: `deps.force?: boolean` — when true, skips the `notificationsEnabled` and quiet-hours gates. Default/absent = unchanged behavior.

- [ ] **Step 1: Write the failing tests**

Append to `lib/notify-dispatch.test.ts`:

```ts
test("force overrides notifications-off (falls back to email)", async () => {
  const { db } = fakeDb({ email: "a@b.c", notificationsEnabled: false }, []);
  const emails: any[] = [];
  const res = await dispatchToUser("u1", payload, {
    db,
    push: async () => ({ delivered: 0, invalidTokens: [] }),
    email: async (...a) => void emails.push(a),
    force: true,
  });
  assert.equal(res.channel, "email");
  assert.equal(emails.length, 1);
});

test("force overrides quiet hours", async () => {
  const now = new Date("2026-07-13T23:00:00");
  const { db } = fakeDb(
    { email: "a@b.c", notificationsEnabled: true, quietHoursStart: 22, quietHoursEnd: 7 },
    []
  );
  const emails: any[] = [];
  const res = await dispatchToUser("u1", payload, {
    db,
    push: async () => ({ delivered: 0, invalidTokens: [] }),
    email: async (...a) => void emails.push(a),
    now,
    force: true,
  });
  assert.equal(res.channel, "email");
  assert.equal(emails.length, 1);
});

test("without force, quiet hours suppresses", async () => {
  const now = new Date("2026-07-13T23:00:00");
  const { db } = fakeDb(
    { email: "a@b.c", notificationsEnabled: true, quietHoursStart: 22, quietHoursEnd: 7 },
    ["tok"]
  );
  const res = await dispatchToUser("u1", payload, {
    db,
    push: async () => ({ delivered: 1, invalidTokens: [] }),
    now,
  });
  assert.equal(res.channel, "quiet");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --require ./lib/stub-server-only.cjs --import tsx --test lib/notify-dispatch.test.ts`
Expected: the two `force` tests FAIL (force is ignored, so notifications-off returns `none` and quiet returns `quiet`).

- [ ] **Step 3: Implement `force`**

In `lib/notify-dispatch.ts`, extend the deps type and the two gates. Change the deps object type to add `force?: boolean;`, then near the top of the body add `const force = deps.force ?? false;`. Replace the gate block:

```ts
  if (!user || !user.notificationsEnabled) return { channel: "none" };
  // Respect quiet hours: hold all channels during the volunteer's set window.
  if (quietHoursActive(user.quietHoursStart, user.quietHoursEnd, now)) {
    return { channel: "quiet" };
  }
```

with:

```ts
  if (!user) return { channel: "none" };
  // Announcements pass force:true to reach volunteers as chapter comms; all
  // other callers respect the opt-out toggle and the quiet-hours window.
  if (!force && !user.notificationsEnabled) return { channel: "none" };
  if (!force && quietHoursActive(user.quietHoursStart, user.quietHoursEnd, now)) {
    return { channel: "quiet" };
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --require ./lib/stub-server-only.cjs --import tsx --test lib/notify-dispatch.test.ts`
Expected: all tests PASS (new and pre-existing).

- [ ] **Step 5: Commit**

```bash
git add lib/notify-dispatch.ts lib/notify-dispatch.test.ts
git commit -m "feat: add force flag to dispatchToUser for announcement comms"
```

---

### Task 3: `lib/announcements.ts` core module

**Files:**
- Create: `lib/announcements.ts`
- Test: `lib/announcements.test.ts`

**Interfaces:**
- Consumes: `dispatchToUser` (`force` flag from Task 2), `NotifyPayload`, `absoluteUrl`, `escapeHtml`.
- Produces:
  - `type World = "real" | "demo"`
  - `buildAnnouncementPayload({ title, body }): NotifyPayload`
  - `sendAnnouncement({ authorId, title, body, world }, deps?): Promise<{ announcementId: string; recipientCount: number }>`
  - `listAnnouncements(world, deps?): Promise<{ id; title; body; createdAt; recipientCount }[]>`
  - `unseenCount(userId, world, deps?): Promise<number>`
  - `markSeen(userId, deps?): Promise<void>`

- [ ] **Step 1: Write the failing tests**

Create `lib/announcements.test.ts`:

```ts
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

test("sendAnnouncement targets active in-world volunteers and force-dispatches", async () => {
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
        return [{ id: "v1" }, { id: "v2" }];
      },
    },
  };
  const dispatch = (async (id: string, _p: any, opts: any) => {
    dispatched.push({ id, opts });
    return { channel: "push" as const };
  }) as any;

  const res = await sendAnnouncement(
    { authorId: "admin1", title: "T", body: "B", world: "real" },
    { db, dispatch }
  );

  assert.equal(res.recipientCount, 2);
  assert.deepEqual(created[0], { authorId: "admin1", title: "T", body: "B", demo: false });
  assert.deepEqual(findWhere[0], { role: "volunteer", status: "active", dataMode: "real" });
  assert.equal(dispatched.length, 2);
  assert.equal(dispatched[0].opts.force, true);
  assert.deepEqual(updated[0], { where: { id: "ann1" }, data: { recipientCount: 2 } });
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --require ./lib/stub-server-only.cjs --import tsx --test lib/announcements.test.ts`
Expected: FAIL — `Cannot find module './announcements'`.

- [ ] **Step 3: Implement the module**

Create `lib/announcements.ts`:

```ts
import type { PrismaClient } from "@prisma/client";
import { prisma } from "./prisma";
import { dispatchToUser, type NotifyPayload } from "./notify-dispatch";
import { absoluteUrl, escapeHtml } from "./email";

export type World = "real" | "demo";

// FCM push bodies get truncated by the OS anyway; keep it short and add an
// ellipsis so the full text is clearly waiting in the inbox.
const PUSH_BODY_MAX = 140;

export function buildAnnouncementPayload(a: {
  title: string;
  body: string;
}): NotifyPayload {
  const pushBody =
    a.body.length > PUSH_BODY_MAX
      ? a.body.slice(0, PUSH_BODY_MAX - 1).trimEnd() + "…"
      : a.body;
  const html =
    escapeHtml(a.body)
      .split(/\n{2,}/)
      .map((para) => `<p>${para.replace(/\n/g, "<br/>")}</p>`)
      .join("") +
    `<p><a href="${absoluteUrl("/updates")}">See it in Meal Move</a></p>`;
  return {
    title: a.title,
    body: pushBody,
    url: "/updates",
    email: { subject: a.title, html },
  };
}

type SendDb = Pick<PrismaClient, "announcement" | "user">;

export async function sendAnnouncement(
  input: { authorId: string; title: string; body: string; world: World },
  deps: { db?: SendDb; dispatch?: typeof dispatchToUser } = {}
): Promise<{ announcementId: string; recipientCount: number }> {
  const db = deps.db ?? prisma;
  const dispatch = deps.dispatch ?? dispatchToUser;
  const demo = input.world === "demo";

  const announcement = await db.announcement.create({
    data: { authorId: input.authorId, title: input.title, body: input.body, demo },
    select: { id: true },
  });

  const volunteers = await db.user.findMany({
    where: { role: "volunteer", status: "active", dataMode: input.world },
    select: { id: true },
  });

  const payload = buildAnnouncementPayload(input);
  await Promise.all(volunteers.map((v) => dispatch(v.id, payload, { force: true })));

  await db.announcement.update({
    where: { id: announcement.id },
    data: { recipientCount: volunteers.length },
  });

  return { announcementId: announcement.id, recipientCount: volunteers.length };
}

export async function listAnnouncements(
  world: World,
  deps: { db?: Pick<PrismaClient, "announcement"> } = {}
) {
  const db = deps.db ?? prisma;
  return db.announcement.findMany({
    where: { demo: world === "demo" },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, body: true, createdAt: true, recipientCount: true },
  });
}

export async function unseenCount(
  userId: string,
  world: World,
  deps: { db?: Pick<PrismaClient, "announcement" | "user"> } = {}
): Promise<number> {
  const db = deps.db ?? prisma;
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { announcementsSeenAt: true },
  });
  const seenAt = user?.announcementsSeenAt ?? null;
  return db.announcement.count({
    where: {
      demo: world === "demo",
      ...(seenAt ? { createdAt: { gt: seenAt } } : {}),
    },
  });
}

export async function markSeen(
  userId: string,
  deps: { db?: Pick<PrismaClient, "user">; now?: Date } = {}
): Promise<void> {
  const db = deps.db ?? prisma;
  const now = deps.now ?? new Date();
  await db.user.update({
    where: { id: userId },
    data: { announcementsSeenAt: now },
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --require ./lib/stub-server-only.cjs --import tsx --test lib/announcements.test.ts`
Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/announcements.ts lib/announcements.test.ts
git commit -m "feat: add announcements module (send, inbox, unseen count)"
```

---

### Task 4: Server actions — send + mark-seen

**Files:**
- Modify: `app/actions.ts`

**Interfaces:**
- Consumes: `sendAnnouncement`, `markSeen` (Task 3), `getDataMode` (`lib/mode`), existing `auth`, `revalidatePath`.
- Produces:
  - `sendAnnouncementAction(title: string, body: string): Promise<{ ok: true; recipientCount: number } | { ok: false; error: string }>`
  - `markUpdatesSeen(): Promise<void>`

- [ ] **Step 1: Add imports**

At the top of `app/actions.ts`, add to the import block:

```ts
import { sendAnnouncement, markSeen } from "@/lib/announcements";
import { getDataMode } from "@/lib/mode";
```

(If `getDataMode` is already imported, don't duplicate it.)

- [ ] **Step 2: Add the two actions**

Append to `app/actions.ts`:

```ts
const ANN_TITLE_MAX = 120;
const ANN_BODY_MAX = 2000;

// Org-admin only: fan a chapter-wide update out to every active volunteer in
// the admin's current world. /admin is org-admin-gated at the route level, but
// server actions aren't route-scoped, so the role is checked here too.
export async function sendAnnouncementAction(
  title: string,
  body: string
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

  const world = await getDataMode();
  const { recipientCount } = await sendAnnouncement({
    authorId: session.user.id,
    title: t,
    body: b,
    world,
  });
  revalidatePath("/admin/updates");
  return { ok: true, recipientCount };
}

// Clears a volunteer's "new updates" badge once they open the inbox.
export async function markUpdatesSeen(): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) return;
  await markSeen(session.user.id);
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/actions.ts
git commit -m "feat: add sendAnnouncementAction and markUpdatesSeen server actions"
```

---

### Task 5: Admin composer + sent log at `/admin/updates`

**Files:**
- Create: `components/AnnouncementComposer.tsx`
- Create: `app/admin/updates/page.tsx`
- Modify: `components/NavBar.tsx` (add admin "Updates" item + megaphone icon)

**Interfaces:**
- Consumes: `sendAnnouncementAction` (Task 4), `listAnnouncements` + `getDataMode`, `Button`, `Toast`/`useToast`.
- Produces: the `/admin/updates` route; a `megaphone` icon in `NavBar`'s `ICONS`.

- [ ] **Step 1: Create the composer component**

Create `components/AnnouncementComposer.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { Button } from "./Button";
import { Toast, useToast } from "./Toast";
import { sendAnnouncementAction } from "@/app/actions";

const TITLE_MAX = 120;
const BODY_MAX = 2000;

// Compose card for org admins. Sending is gated behind an in-place confirm
// (no modal — matches the app's cancel-pickup pattern) because it blasts push +
// email to every volunteer at once.
export function AnnouncementComposer() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { message, show } = useToast();

  const canSend = title.trim().length > 0 && body.trim().length > 0;

  function send() {
    startTransition(async () => {
      const res = await sendAnnouncementAction(title, body);
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
      <label className="block">
        <span className="mb-1 block font-mono text-[11px] text-neutral-700">title</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value.slice(0, TITLE_MAX))}
          placeholder="Winter drive this Saturday"
          className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400"
        />
      </label>

      <label className="mt-3 block">
        <span className="mb-1 block font-mono text-[11px] text-neutral-700">message</span>
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

      {confirming ? (
        <div className="mt-3 rounded-xl bg-neutral-100 p-3">
          <p className="text-sm text-neutral-800">
            Send this to every active volunteer? Push and email go out right away.
          </p>
          <div className="mt-3 flex gap-2">
            <Button variant="primary" onClick={send} disabled={isPending}>
              {isPending ? "Sending…" : "Yes, send it"}
            </Button>
            <Button variant="secondary" onClick={() => setConfirming(false)} disabled={isPending}>
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

- [ ] **Step 2: Create the admin page**

Create `app/admin/updates/page.tsx`:

```tsx
import { auth } from "@/auth";
import { getDataMode } from "@/lib/mode";
import { listAnnouncements } from "@/lib/announcements";
import { AnnouncementComposer } from "@/components/AnnouncementComposer";

// /admin is org-admin-gated at the route level (auth.config), so this page is
// org-admin only. Compact console scale.
export const dynamic = "force-dynamic";

export default async function AdminUpdatesPage() {
  await auth();
  const world = await getDataMode();
  const sent = await listAnnouncements(world);

  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-[40px] font-semibold leading-[1.1] tracking-tight text-balance">
          Updates
        </h1>
        <p className="mt-1 text-sm text-neutral-700">
          Send a note to every volunteer — a heads-up, a thank-you, a change of plan.
        </p>
      </header>

      <AnnouncementComposer />

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-medium">Sent</h2>
        {sent.length === 0 ? (
          <p className="text-sm text-neutral-700">No updates sent yet.</p>
        ) : (
          <ul className="space-y-3">
            {sent.map((a) => (
              <li
                key={a.id}
                className="rounded-2xl border border-neutral-900/5 bg-card p-5 shadow-card"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="font-display text-lg font-semibold text-neutral-900">
                    {a.title}
                  </h3>
                  <span className="shrink-0 font-mono text-[11px] text-neutral-700">
                    {new Date(a.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <p className="mt-1 whitespace-pre-line text-sm text-neutral-700">{a.body}</p>
                <p className="mt-2 font-mono text-[11px] text-neutral-700">
                  reached {a.recipientCount}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
```

- [ ] **Step 3: Add the megaphone icon and admin nav item**

In `components/NavBar.tsx`:

Add to the `ICONS` record (alongside the other icons):

```tsx
  megaphone: (
    <>
      <path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1Z" />
      <path d="M15 8a4 4 0 0 1 0 8" />
    </>
  ),
```

Add the item constant next to the other `const ...: Item` declarations:

```tsx
const ADMIN_UPDATES: Item = { href: "/admin/updates", label: "Updates", icon: "megaphone" };
```

Update the `org_admin` entry in `NAV_BY_ROLE` to include it (second position, a primary action):

```tsx
  org_admin: [MEMBERS, ADMIN_UPDATES, IMPACT, ANALYTICS, RELIABILITY, PARTNERS],
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Manual verification**

With the dev server running, sign in as the demo org admin, open `/admin/updates`, send a test update, and confirm the toast shows a recipient count and the "Sent" log lists it. Confirm the "Updates" nav pill appears for the org admin.

- [ ] **Step 6: Commit**

```bash
git add components/AnnouncementComposer.tsx app/admin/updates/page.tsx components/NavBar.tsx
git commit -m "feat: org-admin /admin/updates composer and sent log"
```

---

### Task 6: Volunteer inbox, feed banner, and nav badge

**Files:**
- Create: `components/UpdatesBanner.tsx`
- Create: `components/MarkSeenOnView.tsx`
- Create: `app/updates/page.tsx`
- Modify: `app/(feed)/page.tsx` (compute unseen + render banner)
- Modify: `components/Header.tsx` (compute unseen, pass to NavBar)
- Modify: `components/NavBar.tsx` (volunteer "Updates" item + unseen badge)

**Interfaces:**
- Consumes: `unseenCount`, `listAnnouncements` (Task 3), `markUpdatesSeen` (Task 4), `getDataMode`.
- Produces: `/updates` route; `<UpdatesBanner unseen={number} />`; `NavBar` gains an `unseen?: number` prop.

- [ ] **Step 1: Create the feed banner**

Create `components/UpdatesBanner.tsx`:

```tsx
import Link from "next/link";

// Calm neutral+clay cue at the top of the feed when the chapter posted updates
// the volunteer hasn't opened. Never a status hue (honey/tomato stay for real
// urgency); clay is the secondary attention accent. Hidden at zero.
export function UpdatesBanner({ unseen }: { unseen: number }) {
  if (unseen <= 0) return null;
  return (
    <Link
      href="/updates"
      className="mb-6 flex items-center gap-3 rounded-2xl border border-clay-200 bg-clay-50 px-4 py-3 transition-colors hover:bg-clay-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400 lg:max-w-2xl"
    >
      <span aria-hidden className="text-[18px]">📣</span>
      <span className="text-[16px] font-semibold text-neutral-900">
        {unseen} new update{unseen === 1 ? "" : "s"}
      </span>
      <span aria-hidden className="ml-auto font-mono text-[13px] text-clay-800">
        view →
      </span>
    </Link>
  );
}
```

- [ ] **Step 2: Create the mark-seen effect component**

Create `components/MarkSeenOnView.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { markUpdatesSeen } from "@/app/actions";

// Marks the inbox seen on mount, then refreshes server components so the nav
// badge and feed banner (rendered in the layout header) clear. Fire-and-forget.
export function MarkSeenOnView() {
  const router = useRouter();
  useEffect(() => {
    void markUpdatesSeen().then(() => router.refresh());
  }, [router]);
  return null;
}
```

- [ ] **Step 3: Create the volunteer inbox page**

Create `app/updates/page.tsx`:

```tsx
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getDataMode } from "@/lib/mode";
import { listAnnouncements } from "@/lib/announcements";
import { MarkSeenOnView } from "@/components/MarkSeenOnView";

export const dynamic = "force-dynamic";

// The volunteer's durable record of chapter updates. Comfortable scale.
export default async function UpdatesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const world = await getDataMode();
  const updates = await listAnnouncements(world);

  return (
    <main className="mx-auto max-w-[720px] px-6 py-8">
      <MarkSeenOnView />
      <header className="mb-6">
        <h1 className="text-[40px] font-semibold leading-[1.1] tracking-tight text-balance">
          Updates
        </h1>
        <p className="mt-1 text-[16px] text-neutral-700">
          Notes from your chapter&apos;s organizers.
        </p>
      </header>

      {updates.length === 0 ? (
        <p className="text-[16px] text-neutral-700">
          No updates yet — you&apos;re all caught up.
        </p>
      ) : (
        <ul className="space-y-[18px]">
          {updates.map((a) => (
            <li key={a.id} className="rounded-3xl bg-card p-6 shadow-card">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="font-display text-[24px] font-medium leading-[1.18] tracking-tight text-neutral-900">
                  {a.title}
                </h2>
                <span className="shrink-0 font-mono text-[13px] text-neutral-700">
                  {new Date(a.createdAt).toLocaleDateString()}
                </span>
              </div>
              <p className="mt-2 whitespace-pre-line text-[16px] leading-relaxed text-neutral-800">
                {a.body}
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
```

- [ ] **Step 4: Render the banner on the feed**

In `app/(feed)/page.tsx`:

Add imports:

```tsx
import { UpdatesBanner } from "@/components/UpdatesBanner";
import { unseenCount } from "@/lib/announcements";
import { getDataMode } from "@/lib/mode";
```

After `const listings = await getListings(viewerId);`, add:

```tsx
  const world = await getDataMode();
  const updatesUnseen = viewerId ? await unseenCount(viewerId, world) : 0;
```

In the returned JSX, immediately after the closing `</header>` (before the `{current && (` section), add:

```tsx
      <UpdatesBanner unseen={updatesUnseen} />
```

- [ ] **Step 5: Add the volunteer nav item + unseen badge**

In `components/NavBar.tsx`:

Add the volunteer item constant next to the others:

```tsx
const UPDATES: Item = { href: "/updates", label: "Updates", icon: "megaphone" };
```

Update the `volunteer` entry in `NAV_BY_ROLE`:

```tsx
  volunteer: [FEED, MAP, IMPACT, UPDATES],
```

Add an `unseen` prop to the component signature:

```tsx
export function NavBar({
  role,
  name,
  image = null,
  unseen = 0,
}: {
  role: Role;
  name: string;
  image?: string | null;
  unseen?: number;
}) {
```

In the **desktop** inline nav map, replace `{item.label}` inside the `<Link>` with:

```tsx
            {item.label}
            {item.href === "/updates" && unseen > 0 && (
              <span className="ml-1.5 inline-flex min-w-[18px] items-center justify-center rounded-full bg-clay-600 px-1 font-mono text-[10px] text-neutral-50">
                {unseen}
              </span>
            )}
```

In the **mobile** bottom-bar map, change the icon wrapper `<span>` to be `relative` and add the badge. Replace:

```tsx
              <span
                className={cn(
                  "grid h-9 w-9 place-items-center rounded-full transition-colors",
                  active ? "bg-neutral-900 text-neutral-50" : "text-neutral-700"
                )}
              >
                <TabIcon icon={item.icon} />
              </span>
```

with:

```tsx
              <span
                className={cn(
                  "relative grid h-9 w-9 place-items-center rounded-full transition-colors",
                  active ? "bg-neutral-900 text-neutral-50" : "text-neutral-700"
                )}
              >
                <TabIcon icon={item.icon} />
                {item.href === "/updates" && unseen > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-clay-600 px-0.5 font-mono text-[9px] text-neutral-50">
                    {unseen}
                  </span>
                )}
              </span>
```

- [ ] **Step 6: Compute unseen in the header and pass it down**

In `components/Header.tsx`:

Add imports:

```tsx
import { unseenCount } from "@/lib/announcements";
```

Replace the `const demo = ...` line:

```tsx
  const demo = user ? (await getDataMode()) === "demo" : false;
```

with:

```tsx
  const dataMode = user ? await getDataMode() : "real";
  const demo = dataMode === "demo";
  const updatesUnseen =
    user?.role === "volunteer" ? await unseenCount(user.id, dataMode) : 0;
```

Update the `<NavBar ... />` call to pass the count:

```tsx
            <NavBar role={user.role} name={user.name ?? "?"} image={image} unseen={updatesUnseen} />
```

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 8: Manual verification**

With the dev server running: as the demo org admin, send an update. Sign in as a demo volunteer — confirm the feed shows the "📣 N new updates" banner and the "Updates" nav pill carries the count. Open `/updates`, confirm the update renders and the badge/banner clear (after the `router.refresh()`). Confirm a volunteer with notifications off still sees the inbox entry (override semantics).

- [ ] **Step 9: Commit**

```bash
git add components/UpdatesBanner.tsx components/MarkSeenOnView.tsx app/updates/page.tsx "app/(feed)/page.tsx" components/NavBar.tsx components/Header.tsx
git commit -m "feat: volunteer updates inbox, feed banner, and nav badge"
```

---

## Final verification

- [ ] Run the full lib test suite: `npm test` — all pass.
- [ ] `npm run typecheck` — clean.
- [ ] End-to-end in the running app (demo world): admin sends → volunteer receives (inbox + banner + badge) → opening clears the badge → admin sent log shows reach.
- [ ] Push/email fanned out (check dev server logs for dispatch) and a notifications-off volunteer still got the inbox entry.
