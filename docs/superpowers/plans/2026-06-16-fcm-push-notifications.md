# Push Notifications (FCM + Email Fallback) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver Meal Move's three notification seams to real recipients via Firebase Cloud Messaging web push, falling back to email when the user has no live push token.

**Architecture:** The three existing `lib/notify.ts` seams become thin wrappers over a shared `dispatchToUser(userId, payload)` that loads the user's device tokens, sends via `firebase-admin`, prunes dead tokens, and emails when no token delivers. A single per-user `notificationsEnabled` flag gates everything. Opt-in happens through a settings toggle and a one-time first-claim prime; both register an FCM token through `/api/notifications/register`.

**Tech Stack:** Next.js 14 (App Router), Prisma/PostgreSQL, `firebase` (web SDK) + `firebase-admin` (server), nodemailer (existing), Node test runner (`node --test` + `tsx`).

**Reference:** Design spec at `docs/superpowers/specs/2026-06-16-fcm-push-notifications-design.md`.

---

## File Structure

**Create:**
- `lib/firebaseAdmin.ts` — server-side `firebase-admin` singleton + `sendMulticast` push sender (the one place FCM admin is touched).
- `lib/notify-dispatch.ts` — `dispatchToUser`, the push-vs-email decision + token pruning.
- `lib/notify-dispatch.test.ts` — unit tests for the dispatch decision.
- `lib/notify-content.test.ts` — unit tests for the three wrappers' payload/recipient building.
- `lib/firebaseClient.ts` — browser Firebase init + `requestPushToken()`.
- `components/NotificationsToggle.tsx` — client opt-in toggle for settings.
- `components/FirstClaimPrime.tsx` — one-time soft prime after first claim.
- `app/api/notifications/register/route.ts` — store a token, enable the flag.
- `app/api/notifications/unregister/route.ts` — remove a token, disable when none remain.
- `public/firebase-messaging-sw.js` — background push service worker.
- `public/manifest.json` — minimal PWA manifest (unlocks iOS install/push).
- `prisma/migrations/<ts>_push_notifications/migration.sql` — generated.

**Modify:**
- `prisma/schema.prisma` — `DeviceToken` model + `User.notificationsEnabled` / `User.notifyPrimedAt`.
- `lib/notify.ts` — real wrappers calling `dispatchToUser`.
- `lib/email.ts` — `sendNudgeEmail` + `absoluteUrl` + `escapeHtml` helpers.
- `app/actions.ts` — `setNotifyPrimed` server action; expose opt-in helpers if needed.
- `app/settings/page.tsx` — mount `NotificationsToggle`.
- `app/layout.tsx` — link the manifest via `metadata`.
- `.env.example` — Firebase public + admin vars.

---

## Task 1: Data model — DeviceToken + User flags

**Files:**
- Modify: `prisma/schema.prisma`
- Create (generated): `prisma/migrations/<ts>_push_notifications/migration.sql`

- [ ] **Step 1: Add the model and fields**

In `prisma/schema.prisma`, add inside the `User` model (alongside its other scalar fields):

```prisma
  notificationsEnabled Boolean       @default(false)
  notifyPrimedAt       DateTime?
  deviceTokens         DeviceToken[]
```

Add a new model at the end of the file:

```prisma
model DeviceToken {
  id         String   @id @default(cuid())
  userId     String
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  token      String   @unique
  userAgent  String?
  createdAt  DateTime @default(now())
  lastSeenAt DateTime @default(now())

  @@index([userId])
}
```

- [ ] **Step 2: Create and apply the migration**

Run: `npm run db:migrate -- --name push_notifications`
Expected: a new migration directory under `prisma/migrations/`, and "Your database is now in sync with your schema."

- [ ] **Step 3: Regenerate the client and restart dev**

Run: `npm run db:generate`
Then restart `next dev` (per project memory: new models are undefined at runtime until the dev server restarts).

- [ ] **Step 4: Verify the type exists**

Run: `npx tsc --noEmit`
Expected: clean (no errors). The `prisma.deviceToken` delegate and `User.notificationsEnabled` now typecheck.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "Add DeviceToken model and User notification flags"
```

---

## Task 2: Email helpers — absoluteUrl, escapeHtml, sendNudgeEmail

**Files:**
- Modify: `lib/email.ts`
- Test: `lib/email-nudge.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `lib/email-nudge.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { absoluteUrl, escapeHtml } from "./email";

test("escapeHtml neutralizes angle brackets and ampersands", () => {
  assert.equal(escapeHtml(`<b>a & b</b>`), "&lt;b&gt;a &amp; b&lt;/b&gt;");
});

test("absoluteUrl joins APP_URL with a path", () => {
  process.env.APP_URL = "https://meal.example";
  assert.equal(absoluteUrl("/listings/abc"), "https://meal.example/listings/abc");
});

test("absoluteUrl tolerates a trailing slash on APP_URL", () => {
  process.env.APP_URL = "https://meal.example/";
  assert.equal(absoluteUrl("/listings/abc"), "https://meal.example/listings/abc");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --import tsx --test lib/email-nudge.test.ts`
Expected: FAIL ("absoluteUrl is not a function" / no export).

- [ ] **Step 3: Implement the helpers**

In `lib/email.ts`, add (export them so tests can import; keep `"server-only"` at top of file):

```ts
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function absoluteUrl(path: string): string {
  const base = (process.env.APP_URL ?? "").replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

// Send one opt-in nudge email. Mirrors sendPasswordResetEmail: lazy nodemailer,
// never throws, logs in dev when SMTP is unconfigured.
export async function sendNudgeEmail(
  to: string,
  subject: string,
  html: string
): Promise<void> {
  if (!smtpConfigured()) {
    console.log(`[nudge] would email ${to}: ${subject}`);
    return;
  }
  try {
    const nodemailer = await import("nodemailer");
    const port = Number(SMTP_PORT);
    const transport = nodemailer.createTransport({
      host: SMTP_HOST,
      port,
      secure: port === 465,
      auth: SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
    });
    await transport.sendMail({ from: SMTP_FROM, to, subject, html });
  } catch (e) {
    console.error("[nudge] email send failed:", e);
  }
}
```

> Note: `"server-only"` makes this module server-only, but pure helpers like `escapeHtml`/`absoluteUrl` are still importable by server-side tests run through `tsx`. The test file is under `lib/**` and runs in Node, so this is fine.

- [ ] **Step 4: Run to verify it passes**

Run: `node --import tsx --test lib/email-nudge.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/email.ts lib/email-nudge.test.ts
git commit -m "Add nudge email + absoluteUrl/escapeHtml helpers"
```

---

## Task 3: Server push sender — firebase-admin singleton

**Files:**
- Create: `lib/firebaseAdmin.ts`

This is infrastructure (network/SDK), exercised through the dispatcher's injected fake in Task 4, so it has no standalone unit test. Keep the public surface tiny: a typed `PushSender` and the default `sendMulticast`.

- [ ] **Step 1: Install the dependency**

Run: `npm install firebase-admin`
Expected: added to `dependencies`.

- [ ] **Step 2: Implement the module**

Create `lib/firebaseAdmin.ts`:

```ts
import "server-only";

export interface PushMessage {
  title: string;
  body: string;
  url: string; // relative path to open on tap, e.g. /listings/abc
}

// A sender returns how many messages delivered and which tokens FCM rejected as
// permanently invalid (so the caller can prune them). Transient failures return
// delivered: 0 with no invalid tokens, so the caller falls back to email without
// deleting good tokens.
export type PushSender = (
  tokens: string[],
  message: PushMessage
) => Promise<{ delivered: number; invalidTokens: string[] }>;

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID;
const CLIENT_EMAIL = process.env.FIREBASE_CLIENT_EMAIL;
const PRIVATE_KEY = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

function configured(): boolean {
  return Boolean(PROJECT_ID && CLIENT_EMAIL && PRIVATE_KEY);
}

// Lazy, singleton admin app — only loaded/initialized when actually sending.
let messagingPromise: Promise<import("firebase-admin").messaging.Messaging> | null = null;

async function getMessaging() {
  if (!messagingPromise) {
    messagingPromise = (async () => {
      const admin = await import("firebase-admin");
      const app = admin.apps.length
        ? admin.app()
        : admin.initializeApp({
            credential: admin.credential.cert({
              projectId: PROJECT_ID,
              clientEmail: CLIENT_EMAIL,
              privateKey: PRIVATE_KEY,
            }),
          });
      return admin.messaging(app);
    })();
  }
  return messagingPromise;
}

const INVALID_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
  "messaging/invalid-argument",
]);

export const sendMulticast: PushSender = async (tokens, message) => {
  if (tokens.length === 0) return { delivered: 0, invalidTokens: [] };
  if (!configured()) {
    console.log(`[push] would send "${message.title}" to ${tokens.length} token(s)`);
    return { delivered: 0, invalidTokens: [] };
  }
  try {
    const messaging = await getMessaging();
    const res = await messaging.sendEachForMulticast({
      tokens,
      notification: { title: message.title, body: message.body },
      webpush: { fcmOptions: { link: absoluteForSw(message.url) } },
      data: { url: message.url },
    });
    const invalidTokens: string[] = [];
    res.responses.forEach((r, i) => {
      if (!r.success && r.error && INVALID_CODES.has(r.error.code)) {
        invalidTokens.push(tokens[i]);
      }
    });
    return { delivered: res.successCount, invalidTokens };
  } catch (e) {
    console.error("[push] send failed:", e);
    return { delivered: 0, invalidTokens: [] };
  }
};

// The webpush link must be absolute. Reuse APP_URL when present; otherwise leave
// the relative path (the service worker resolves it against its own origin).
function absoluteForSw(path: string): string {
  const base = (process.env.APP_URL ?? "").replace(/\/$/, "");
  return base ? `${base}${path}` : path;
}
```

- [ ] **Step 3: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json lib/firebaseAdmin.ts
git commit -m "Add firebase-admin push sender (sendMulticast)"
```

---

## Task 4: Dispatcher — dispatchToUser (push vs email, pruning)

**Files:**
- Create: `lib/notify-dispatch.ts`
- Test: `lib/notify-dispatch.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/notify-dispatch.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { dispatchToUser, type NotifyPayload } from "./notify-dispatch";

const payload: NotifyPayload = {
  title: "t",
  body: "b",
  url: "/listings/x",
  email: { subject: "s", html: "<p>h</p>" },
};

function fakeDb(user: any, tokens: string[]) {
  const deleted: string[] = [];
  return {
    deleted,
    db: {
      user: { findUnique: async () => user },
      deviceToken: {
        findMany: async () => tokens.map((token) => ({ token })),
        deleteMany: async ({ where }: any) => {
          deleted.push(...where.token.in);
          return { count: where.token.in.length };
        },
      },
    } as any,
  };
}

test("sends nothing when notifications are disabled", async () => {
  const { db } = fakeDb({ email: "a@b.c", notificationsEnabled: false }, ["tok"]);
  const emails: any[] = [];
  const res = await dispatchToUser("u1", payload, {
    db,
    push: async () => ({ delivered: 1, invalidTokens: [] }),
    email: async (...a) => void emails.push(a),
  });
  assert.equal(res.channel, "none");
  assert.equal(emails.length, 0);
});

test("pushes when a token delivers, and prunes invalid tokens", async () => {
  const { db, deleted } = fakeDb(
    { email: "a@b.c", notificationsEnabled: true },
    ["good", "dead"]
  );
  const emails: any[] = [];
  const res = await dispatchToUser("u1", payload, {
    db,
    push: async () => ({ delivered: 1, invalidTokens: ["dead"] }),
    email: async (...a) => void emails.push(a),
  });
  assert.equal(res.channel, "push");
  assert.deepEqual(deleted, ["dead"]);
  assert.equal(emails.length, 0);
});

test("falls back to email when no token delivers", async () => {
  const { db, deleted } = fakeDb(
    { email: "a@b.c", notificationsEnabled: true },
    ["dead"]
  );
  const emails: any[] = [];
  const res = await dispatchToUser("u1", payload, {
    db,
    push: async () => ({ delivered: 0, invalidTokens: ["dead"] }),
    email: async (...a) => void emails.push(a),
  });
  assert.equal(res.channel, "email");
  assert.deepEqual(deleted, ["dead"]);
  assert.deepEqual(emails[0], ["a@b.c", "s", "<p>h</p>"]);
});

test("emails directly when the user has no tokens", async () => {
  const { db } = fakeDb({ email: "a@b.c", notificationsEnabled: true }, []);
  const emails: any[] = [];
  const res = await dispatchToUser("u1", payload, {
    db,
    push: async () => ({ delivered: 0, invalidTokens: [] }),
    email: async (...a) => void emails.push(a),
  });
  assert.equal(res.channel, "email");
  assert.equal(emails[0][0], "a@b.c");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --import tsx --test lib/notify-dispatch.test.ts`
Expected: FAIL (module not found / `dispatchToUser` undefined).

- [ ] **Step 3: Implement the dispatcher**

Create `lib/notify-dispatch.ts`:

```ts
import { prisma } from "./prisma";
import { sendNudgeEmail } from "./email";
import { sendMulticast, type PushSender } from "./firebaseAdmin";

export interface NotifyPayload {
  title: string;
  body: string;
  url: string;
  email: { subject: string; html: string };
}

type Db = Pick<typeof prisma, "user" | "deviceToken">;

export async function dispatchToUser(
  userId: string,
  payload: NotifyPayload,
  deps: { db?: Db; push?: PushSender; email?: typeof sendNudgeEmail } = {}
): Promise<{ channel: "push" | "email" | "none" }> {
  const db = deps.db ?? prisma;
  const push = deps.push ?? sendMulticast;
  const email = deps.email ?? sendNudgeEmail;

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { email: true, notificationsEnabled: true },
  });
  if (!user || !user.notificationsEnabled) return { channel: "none" };

  const tokens = (
    await db.deviceToken.findMany({ where: { userId }, select: { token: true } })
  ).map((t) => t.token);

  if (tokens.length > 0) {
    const { delivered, invalidTokens } = await push(tokens, {
      title: payload.title,
      body: payload.body,
      url: payload.url,
    });
    if (invalidTokens.length > 0) {
      await db.deviceToken.deleteMany({ where: { token: { in: invalidTokens } } });
    }
    if (delivered > 0) return { channel: "push" };
  }

  await email(user.email, payload.email.subject, payload.email.html);
  return { channel: "email" };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --import tsx --test lib/notify-dispatch.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/notify-dispatch.ts lib/notify-dispatch.test.ts
git commit -m "Add dispatchToUser: push-with-email-fallback and token pruning"
```

---

## Task 5: Real notify.ts wrappers

**Files:**
- Modify: `lib/notify.ts`
- Test: `lib/notify-content.test.ts` (create)

The three wrappers keep their exact signatures (call sites in `checkins.ts`/`buddies.ts`/`photos.ts` are unchanged). They build a payload and dispatch. `sendDropOffPickupNotice` fans out to every drop-off admin; allow injecting the recipient-id lookup and the dispatcher for testing.

- [ ] **Step 1: Write the failing test**

Create `lib/notify-content.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCheckInPayload, buildBuddyInvitePayload, buildDropOffPayload } from "./notify";

test("check-in payload targets the listing and reads as a nudge", () => {
  const p = buildCheckInPayload({
    pickupId: "p", listingId: "L1", volunteerId: "v", listingTitle: "Bagels", markIndex: 1,
  });
  assert.equal(p.url, "/listings/L1");
  assert.match(p.email.subject, /Meal Move/);
  assert.match(p.email.html, /Bagels/);
});

test("buddy invite payload names the inviter and listing", () => {
  const p = buildBuddyInvitePayload({
    inviteId: "i", listingId: "L2", inviteeId: "u", listingTitle: "Soup", inviterName: "Mia",
  });
  assert.equal(p.url, "/listings/L2");
  assert.match(p.email.html, /Mia/);
  assert.match(p.email.html, /Soup/);
});

test("drop-off payload escapes the title", () => {
  const p = buildDropOffPayload({
    listingId: "L3", dropOffId: "d", dropOffName: "Hall", listingTitle: "<x>",
  });
  assert.equal(p.url, "/dropoff");
  assert.match(p.email.html, /&lt;x&gt;/);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --import tsx --test lib/notify-content.test.ts`
Expected: FAIL (no `buildCheckInPayload` export).

- [ ] **Step 3: Rewrite lib/notify.ts**

Replace the three no-op functions with payload builders + dispatching wrappers. Keep `restaurantMemberIds` and the interfaces. Full new body for the lower half of the file:

```ts
import { CHECK_IN_MARKS } from "./checkin-marks";
import { prisma } from "./prisma";
import { dispatchToUser, type NotifyPayload } from "./notify-dispatch";
import { absoluteUrl, escapeHtml } from "./email";
import type { PrismaClient } from "@prisma/client";

// ... restaurantMemberIds and the three Push interfaces stay unchanged ...

function emailButton(label: string, path: string): string {
  return `<p><a href="${absoluteUrl(path)}">${label}</a></p>`;
}

export function buildCheckInPayload(push: CheckInPush): NotifyPayload {
  const minutes = CHECK_IN_MARKS[push.markIndex - 1];
  const title = escapeHtml(push.listingTitle);
  return {
    title: "Still on for your pickup?",
    body: `Tap to check in on "${push.listingTitle}".`,
    url: `/listings/${push.listingId}`,
    email: {
      subject: "Checking in on your Meal Move pickup",
      html:
        `<p>You're ${minutes} minutes into your hold on "${title}". ` +
        `Tap below to confirm you're still on for it.</p>` +
        emailButton("Open the pickup", `/listings/${push.listingId}`),
    },
  };
}

export async function sendCheckInPush(push: CheckInPush): Promise<void> {
  await dispatchToUser(push.volunteerId, buildCheckInPayload(push));
}

export function buildBuddyInvitePayload(push: BuddyInvitePush): NotifyPayload {
  const title = escapeHtml(push.listingTitle);
  const inviter = escapeHtml(push.inviterName);
  return {
    title: "You've been invited to buddy a rescue",
    body: `${push.inviterName} invited you to "${push.listingTitle}".`,
    url: `/listings/${push.listingId}`,
    email: {
      subject: "A buddy invite on Meal Move",
      html:
        `<p>${inviter} invited you to buddy the pickup "${title}".</p>` +
        emailButton("See the invite", `/listings/${push.listingId}`),
    },
  };
}

export async function sendBuddyInvitePush(push: BuddyInvitePush): Promise<void> {
  await dispatchToUser(push.inviteeId, buildBuddyInvitePayload(push));
}

export function buildDropOffPayload(notice: DropOffPickupNotice): NotifyPayload {
  const title = escapeHtml(notice.listingTitle);
  return {
    title: "A delivery is on its way",
    body: `"${notice.listingTitle}" was just picked up.`,
    url: `/dropoff`,
    email: {
      subject: "An inbound delivery on Meal Move",
      html:
        `<p>"${title}" was just picked up and is on its way to ${escapeHtml(notice.dropOffName)}.</p>` +
        emailButton("View inbound deliveries", `/dropoff`),
    },
  };
}

// Reaches every drop-off admin (the schema doesn't tie an admin to one DropOff,
// mirroring the /dropoff page). Recipient lookup is injectable for tests.
export async function sendDropOffPickupNotice(
  notice: DropOffPickupNotice,
  deps: {
    recipientIds?: (db: Pick<PrismaClient, "user">) => Promise<string[]>;
    dispatch?: typeof dispatchToUser;
  } = {}
): Promise<void> {
  const dispatch = deps.dispatch ?? dispatchToUser;
  const recipientIds =
    deps.recipientIds ??
    (async (db) =>
      (
        await db.user.findMany({
          where: { role: "drop_off_admin" },
          select: { id: true },
        })
      ).map((u) => u.id));
  const ids = await recipientIds(prisma);
  const payload = buildDropOffPayload(notice);
  await Promise.all(ids.map((id) => dispatch(id, payload)));
}
```

> Keep the existing `import { CHECK_IN_MARKS }` and interface declarations; only the function bodies and new imports change. Remove the old dev-only `console.log` stubs.

- [ ] **Step 4: Run to verify it passes**

Run: `node --import tsx --test lib/notify-content.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Run the full suite + typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: all tests pass (existing 82 + new), typecheck clean. The injected `notify =` defaults in `checkins.ts`/`buddies.ts`/`photos.ts` still resolve to these functions.

- [ ] **Step 6: Commit**

```bash
git add lib/notify.ts lib/notify-content.test.ts
git commit -m "Wire notify.ts seams to real dispatch (push + email)"
```

---

## Task 6: Register / unregister API routes

**Files:**
- Create: `app/api/notifications/register/route.ts`
- Create: `app/api/notifications/unregister/route.ts`

These mirror `app/api/upload/route.ts` (auth via `auth()`, rate limit, JSON body). No unit test (thin DB glue over Prisma); verified manually in Task 10.

- [ ] **Step 1: Implement register**

Create `app/api/notifications/register/route.ts`:

```ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  let token = "";
  try {
    const body = await req.json();
    token = typeof body?.token === "string" ? body.token : "";
  } catch {
    token = "";
  }
  if (!token) return NextResponse.json({ error: "Missing token." }, { status: 400 });

  const userAgent = req.headers.get("user-agent")?.slice(0, 255) ?? null;

  await prisma.$transaction([
    prisma.deviceToken.upsert({
      where: { token },
      update: { userId, userAgent, lastSeenAt: new Date() },
      create: { userId, token, userAgent },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { notificationsEnabled: true },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Implement unregister**

Create `app/api/notifications/unregister/route.ts`:

```ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  let token = "";
  try {
    const body = await req.json();
    token = typeof body?.token === "string" ? body.token : "";
  } catch {
    token = "";
  }

  // Remove this device's token (or all of the user's, if none was supplied).
  await prisma.deviceToken.deleteMany({
    where: token ? { userId, token } : { userId },
  });

  const remaining = await prisma.deviceToken.count({ where: { userId } });
  if (remaining === 0) {
    await prisma.user.update({
      where: { id: userId },
      data: { notificationsEnabled: false },
    });
  }

  return NextResponse.json({ ok: true, remaining });
}
```

- [ ] **Step 3: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add app/api/notifications
git commit -m "Add notification register/unregister API routes"
```

---

## Task 7: Browser Firebase init + service worker + manifest

**Files:**
- Create: `lib/firebaseClient.ts`
- Create: `public/firebase-messaging-sw.js`
- Create: `public/manifest.json`
- Modify: `app/layout.tsx`

Infrastructure; verified manually in Task 10.

- [ ] **Step 1: Install the web SDK**

Run: `npm install firebase`
Expected: added to `dependencies`.

- [ ] **Step 2: Client init + token request**

Create `lib/firebaseClient.ts`:

```ts
"use client";

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getMessaging, getToken, isSupported } from "firebase/messaging";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

function app(): FirebaseApp {
  return getApps().length ? getApps()[0] : initializeApp(config);
}

// Requests permission, registers the service worker, and returns an FCM token —
// or null if unsupported / denied. Callers treat null as "stay on email".
export async function requestPushToken(): Promise<string | null> {
  if (!config.apiKey || !(await isSupported())) return null;
  if (typeof Notification === "undefined") return null;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return null;

  const registration = await navigator.serviceWorker.register(
    "/firebase-messaging-sw.js"
  );
  const messaging = getMessaging(app());
  try {
    return await getToken(messaging, {
      vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
  } catch {
    return null;
  }
}
```

- [ ] **Step 3: Background service worker**

Create `public/firebase-messaging-sw.js` (uses the compat SDK from the CDN — the conventional pattern for the FCM service worker; fill the same config values, which are public):

```js
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "REPLACE_NEXT_PUBLIC_FIREBASE_API_KEY",
  authDomain: "REPLACE_NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  projectId: "REPLACE_NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  messagingSenderId: "REPLACE_NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  appId: "REPLACE_NEXT_PUBLIC_FIREBASE_APP_ID",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification || {};
  self.registration.showNotification(title || "Meal Move", {
    body: body || "",
    icon: "/mealmovelogo.png",
    data: { url: (payload.data && payload.data.url) || "/" },
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(clients.openWindow(url));
});
```

> These config values are public (the same `NEXT_PUBLIC_*` values shipped to the browser), so hardcoding them in the static service worker is expected. Replace each `REPLACE_*` with the project's real value.

- [ ] **Step 4: Minimal PWA manifest**

Create `public/manifest.json`:

```json
{
  "name": "Meal Move",
  "short_name": "Meal Move",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#F7F3EA",
  "theme_color": "#F7F3EA",
  "icons": [
    { "src": "/mealmovelogo.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

- [ ] **Step 5: Link the manifest from the layout**

In `app/layout.tsx`, add `manifest` to the exported `metadata`:

```ts
export const metadata: Metadata = {
  title: "Meal Move",
  description: "Food-rescue for a campus volunteer org.",
  manifest: "/manifest.json",
};
```

- [ ] **Step 6: Verify it typechecks and builds the route tree**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add lib/firebaseClient.ts public/firebase-messaging-sw.js public/manifest.json app/layout.tsx package.json package-lock.json
git commit -m "Add browser Firebase init, push service worker, and PWA manifest"
```

---

## Task 8: Settings opt-in toggle

**Files:**
- Create: `components/NotificationsToggle.tsx`
- Modify: `app/settings/page.tsx`

- [ ] **Step 1: Implement the toggle**

Create `components/NotificationsToggle.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "./Button";
import { requestPushToken } from "@/lib/firebaseClient";

export function NotificationsToggle({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enable() {
    setBusy(true);
    setError(null);
    const token = await requestPushToken();
    if (!token) {
      setError(
        "We couldn't turn on push here — you may have blocked notifications, or this browser doesn't support them. You'll still get email reminders."
      );
      // Still record the opt-in so email reminders flow.
    }
    const res = await fetch("/api/notifications/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: token ?? "" }),
    });
    setBusy(false);
    if (res.ok || token === null) setEnabled(true);
  }

  async function disable() {
    setBusy(true);
    setError(null);
    await fetch("/api/notifications/unregister", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    setBusy(false);
    setEnabled(false);
  }

  return (
    <div>
      <Button
        variant={enabled ? "secondary" : "primary"}
        onClick={enabled ? disable : enable}
        disabled={busy}
      >
        {busy ? "…" : enabled ? "Turn off notifications" : "Notify me about pickups"}
      </Button>
      {error && <p className="mt-2 text-sm text-failed-600">{error}</p>}
      {enabled && !error && (
        <p className="mt-2 font-mono text-[11px] text-neutral-700">
          notifications on
        </p>
      )}
    </div>
  );
}
```

> Note: when `token` is null but the user still opts in, register is called with an empty token. Update the register route to skip the upsert when the token is empty but still set `notificationsEnabled = true` (so email-only users opt in). Adjust Task 6's register handler: if `!token`, skip the `deviceToken.upsert` and only run the `user.update`. Make this change now and re-commit the route.

- [ ] **Step 2: Adjust register route for email-only opt-in**

In `app/api/notifications/register/route.ts`, replace the `if (!token) return 400` guard and the transaction with:

```ts
  const userAgent = req.headers.get("user-agent")?.slice(0, 255) ?? null;

  if (token) {
    await prisma.deviceToken.upsert({
      where: { token },
      update: { userId, userAgent, lastSeenAt: new Date() },
      create: { userId, token, userAgent },
    });
  }
  await prisma.user.update({
    where: { id: userId },
    data: { notificationsEnabled: true },
  });

  return NextResponse.json({ ok: true });
```

- [ ] **Step 3: Mount it in settings**

In `app/settings/page.tsx`, load the flag and render a new section. At the top, import and read:

```tsx
import { NotificationsToggle } from "@/components/NotificationsToggle";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
```

Inside the component, before `return`:

```tsx
  const session = await auth();
  const me = session?.user?.id
    ? await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { notificationsEnabled: true },
      })
    : null;
```

Add a section after the Appearance section:

```tsx
      <section className="mt-6 rounded-2xl border border-neutral-900/5 bg-card p-5 shadow-card">
        <h2 className="text-lg font-medium">Notifications</h2>
        <p className="mt-1 text-sm text-neutral-700">
          Get a gentle nudge when it's time to check in on a pickup, when someone
          invites you to buddy a rescue, or when a delivery is inbound. We'll use
          push where your device supports it, and email otherwise.
        </p>
        <div className="mt-4">
          <NotificationsToggle initialEnabled={me?.notificationsEnabled ?? false} />
        </div>
      </section>
```

- [ ] **Step 4: Verify typecheck + manual toggle**

Run: `npx tsc --noEmit`
Expected: clean. Then in the running app at `/settings`, toggle on (grant permission) and confirm a `DeviceToken` row appears (`npm run db:studio`), and `notificationsEnabled` flips.

- [ ] **Step 5: Commit**

```bash
git add components/NotificationsToggle.tsx app/settings/page.tsx app/api/notifications/register/route.ts
git commit -m "Add settings notifications opt-in toggle"
```

---

## Task 9: First-claim prime

**Files:**
- Create: `components/FirstClaimPrime.tsx`
- Modify: `app/actions.ts` (add `setNotifyPrimed`)
- Modify: `components/ListingFeed.tsx` (show prime after first claim)

- [ ] **Step 1: Add the server action**

In `app/actions.ts`, add:

```ts
export async function setNotifyPrimed(): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) return;
  await prisma.user.update({
    where: { id: session.user.id },
    data: { notifyPrimedAt: new Date() },
  });
}
```

> `auth` and `prisma` are already imported in `app/actions.ts`; reuse them.

- [ ] **Step 2: Implement the prime card**

Create `components/FirstClaimPrime.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "./Button";
import { requestPushToken } from "@/lib/firebaseClient";
import { setNotifyPrimed } from "@/app/actions";

export function FirstClaimPrime({ onClose }: { onClose: () => void }) {
  const [busy, setBusy] = useState(false);

  async function dismiss() {
    await setNotifyPrimed();
    onClose();
  }

  async function enable() {
    setBusy(true);
    const token = await requestPushToken();
    await fetch("/api/notifications/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: token ?? "" }),
    });
    await setNotifyPrimed();
    setBusy(false);
    onClose();
  }

  return (
    <div className="mb-4 rounded-2xl border border-rescued-200/70 bg-gradient-to-b from-rescued-50/60 to-card p-4 shadow-card">
      <h3 className="font-display text-lg font-semibold tracking-tight">
        Want a nudge when it's time to go?
      </h3>
      <p className="mt-1 text-sm text-neutral-700">
        We'll remind you to check in on this pickup so it doesn't slip. You can
        change this anytime in settings.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={enable} disabled={busy}>
          {busy ? "…" : "Turn on reminders"}
        </Button>
        <Button variant="ghost" onClick={dismiss} disabled={busy}>
          Not now
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Trigger it after the first claim in ListingFeed**

`ListingFeed` is a client component and already handles claims in `handleClaim`. Add a `primeEligible` prop (true when the signed-in volunteer has `notifyPrimedAt == null && notificationsEnabled == false`) threaded from the server page (`app/page.tsx`), plus local state:

In `app/page.tsx`, compute and pass:

```tsx
  const me = session?.user?.id
    ? await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { notifyPrimedAt: true, notificationsEnabled: true },
      })
    : null;
  const primeEligible =
    session?.user?.role === "volunteer" &&
    !!me && me.notifyPrimedAt === null && !me.notificationsEnabled;
```

Pass `primeEligible` into `<ListingFeed listings={listings} canClaim={canClaim} primeEligible={primeEligible} />` (import `prisma` in `app/page.tsx`).

In `components/ListingFeed.tsx`: accept `primeEligible?: boolean`, add `const [showPrime, setShowPrime] = useState(false);`, set `setShowPrime(true)` inside `handleClaim`'s success (only when `primeEligible`), and render `{showPrime && <FirstClaimPrime onClose={() => setShowPrime(false)} />}` above the filter row. Import `FirstClaimPrime`.

- [ ] **Step 4: Verify typecheck + manual flow**

Run: `npx tsc --noEmit`
Expected: clean. Then as a fresh volunteer who has never opted in, claim a pickup and confirm the prime appears once; reload after dismissing and confirm it does not reappear (because `notifyPrimedAt` is set).

- [ ] **Step 5: Commit**

```bash
git add components/FirstClaimPrime.tsx app/actions.ts app/page.tsx components/ListingFeed.tsx
git commit -m "Add one-time first-claim notification prime"
```

---

## Task 10: Env docs, end-to-end verification

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Document the env vars**

Append to `.env.example`:

```bash
# Push notifications (OPTIONAL). With these unset, the app sends email nudges
# only (or logs in dev). Create a Firebase project → Cloud Messaging.
# Public (browser) — from Firebase → Project settings → General → Web app:
NEXT_PUBLIC_FIREBASE_API_KEY=""
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=""
NEXT_PUBLIC_FIREBASE_PROJECT_ID=""
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=""
NEXT_PUBLIC_FIREBASE_APP_ID=""
# Web Push certificate key pair → "Key pair" under Cloud Messaging:
NEXT_PUBLIC_FIREBASE_VAPID_KEY=""
# Server (admin) — from Firebase → Project settings → Service accounts →
# "Generate new private key". Paste the private key with \n escapes preserved.
FIREBASE_PROJECT_ID=""
FIREBASE_CLIENT_EMAIL=""
FIREBASE_PRIVATE_KEY=""
```

- [ ] **Step 2: Full suite + build sanity**

Run: `npm test && npx tsc --noEmit`
Expected: all tests pass, typecheck clean. (Do not run `npm run build` while `next dev` is live — verify the build in CI / a clean checkout.)

- [ ] **Step 3: Manual end-to-end (desktop Chrome, Firebase configured)**

1. Opt in at `/settings`; confirm a `DeviceToken` row exists and `notificationsEnabled` is true.
2. Claim a pickup, wait for (or force) a check-in mark via the sweep (`curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/sweep`), and confirm the push appears and opens `/listings/[id]` on click.
3. Opt out; confirm the token row is gone and the flag is false.
4. With Firebase unset (or no token) but SMTP set, repeat the sweep and confirm the email nudge arrives instead.

- [ ] **Step 4: Commit**

```bash
git add .env.example
git commit -m "Document Firebase push env vars"
```

---

## Self-Review notes

- **Spec coverage:** channels/fallback (Task 4), three seams (Task 5), data model (Task 1), register/unregister (Task 6), client + SW + manifest (Task 7), settings toggle (Task 8), first-claim prime (Task 9), env + verification (Task 10), privacy (already shipped). All covered.
- **Email-only opt-in:** handled by the Task 8 register-route adjustment (empty token still flips the flag), so users who deny push still get email nudges — consistent with the single-flag design.
- **Token pruning safety:** transient/unconfigured push returns `delivered: 0, invalidTokens: []`, so good tokens are never deleted on an outage (Task 3 + Task 4 tests).
- **No call-site changes:** the `notify =` injection defaults in `checkins.ts`/`buddies.ts`/`photos.ts` resolve to the rewritten wrappers (Task 5).
