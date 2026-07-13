# Mass updates — org-admin announcements to volunteers

**Date:** 2026-07-13
**Status:** Approved design, ready for implementation planning

## Summary

Give org admins a way to send a chapter-wide **update** to all volunteers. Each
update fans out over the existing push/email pipeline **and** persists to an
in-app inbox volunteers can revisit, so an announcement survives the moment it
was sent (supporting the product's "institutional memory" goal). Send-once: no
editing, scheduling, or deleting a sent update.

## Goals

- An org admin can compose a titled update and send it to every active
  volunteer in their world (demo/real) in one action.
- Volunteers receive it as a push (email fallback) **and** see it in a
  persistent `/updates` inbox, with an unseen-count badge in nav and a banner on
  the feed.
- Org admins see a sent log (what was sent, when, and how many it reached).

## Non-goals (YAGNI)

- Editing, deleting, or scheduling sent updates.
- Per-recipient read receipts (a single "last seen" timestamp is enough for the
  badge).
- Segment/targeting filters (reliability, location, individual pick).
- Audiences other than volunteers (restaurants, drop-offs).

## Decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Audience | **All active volunteers** in the admin's current world |
| Delivery | **In-app inbox + push/email** (persisted `Announcement` model) |
| Opt-out / quiet hours | **Override** — updates bypass the notifications-off toggle and quiet hours as chapter comms |
| Lifecycle | **Send-once** — no edit/delete/schedule |

## Data model

### New model: `Announcement`

```prisma
model Announcement {
  id             String   @id @default(cuid())
  author         User     @relation("AnnouncementAuthor", fields: [authorId], references: [id])
  authorId       String
  title          String
  body           String   @db.Text
  demo           Boolean  // world tag: sent to volunteers whose dataMode matches
  recipientCount Int      @default(0) // denormalized reach, stamped at send time
  createdAt      DateTime @default(now())

  @@index([demo, createdAt])
}
```

- `demo` mirrors the app's demo/real separation. An admin acting in demo mode
  sends to demo-world volunteers (safe testing); real → real volunteers.
- `recipientCount` is stamped once at send so the admin log shows reach without
  recomputation.
- `author` uses a named relation to avoid colliding with any existing `User`
  back-relations.

### New field on `User`

```prisma
announcementsSeenAt DateTime? // when the volunteer last opened their /updates inbox
```

- "New" for a volunteer = `Announcement.createdAt > announcementsSeenAt` (or all,
  when the field is null), scoped to the volunteer's world.
- Chosen over an `AnnouncementRead` join table: one timestamp yields the unseen
  badge with far less machinery, and per-item read state is a non-goal.

### Migration

- One Prisma migration adds the `Announcement` table, the `User` field, and the
  named back-relation `User.announcements Announcement[] @relation("AnnouncementAuthor")`.
- **After migrate: restart `next dev`** (project rule — new models are undefined
  at runtime until the dev server restarts).

## Modules

### `lib/announcements.ts` (the core unit)

Pure/testable where possible; DB access injected via a narrow `Db` type like the
existing notify modules.

- `buildAnnouncementPayload({ title, body }): NotifyPayload`
  - push: `title` as-is; `body` truncated to a push-safe length; `url: "/updates"`.
  - email: `subject = title`; `html` = escaped body (newlines → paragraphs) + a
    link to `/updates` via the existing `emailButton`/`absoluteUrl` helpers.
- `sendAnnouncement({ authorId, title, body, world, deps })`
  - Creates the `Announcement` row (`demo = world === "demo"`).
  - Loads active volunteers in that world
    (`role: "volunteer", status: "active", dataMode: world`).
  - Dispatches to each with `dispatchToUser(id, payload, { force: true })`.
  - Updates the row's `recipientCount`; returns `{ announcementId, recipientCount }`.
- `listAnnouncements(world, deps)` — newest-first, for the inbox and admin log.
- `unseenCount(userId, deps)` — count of world-scoped announcements newer than the
  user's `announcementsSeenAt`.
- `markSeen(userId, deps)` — set `announcementsSeenAt = now`.

### `lib/notify-dispatch.ts` — add `force`

- Extend the deps object with `force?: boolean`.
- When `force` is true, skip the `notificationsEnabled` gate **and** the
  quiet-hours gate; token→email fallback logic is otherwise unchanged.
- All existing callers pass no `force` and keep current behavior. A unit test
  covers: forced dispatch reaches a notifications-off / quiet-hours user; default
  dispatch still suppresses them.

### Server actions

- `sendAnnouncementAction(formData)` — **org_admin only** (mirror the existing
  `role === "org_admin"` auth checks in `app/actions.ts`). Validates title/body
  (non-empty; title ≤ 120 chars; body ≤ 2000), resolves the admin's world via
  `getDataMode()`, calls `sendAnnouncement`, then `revalidatePath("/admin/updates")`.
  Returns a result the compose form surfaces ("sent to N volunteers").
- `markUpdatesSeenAction()` — **volunteer**; calls `markSeen` for the current
  user. Invoked when the `/updates` inbox renders.

## UI

### Admin — `/admin/updates`

Compact console scale (staff console).

- **Compose card**: `title` input, `body` textarea (with live char counts against
  the caps), a primary **Send update** button gated behind a confirm step
  (in-place confirm panel, matching the app's cancel-pickup pattern — no modal).
  On success, a calm inline "sent to N volunteers" confirmation.
- **Sent log** below: each row = serif title · mono `createdAt` · mono reach
  count. Empty state teaches the surface ("No updates sent yet…").
- Add an **Updates** item to the org-admin nav in `NavBar` (same label as the
  volunteer nav pill, for one consistent noun across roles).

### Volunteer — feed banner + `/updates` inbox

Comfortable scale (volunteer-facing, ≥16px body, ≥44px targets).

- **Feed banner** (top of `/(feed)`): when `unseenCount > 0`, a calm
  **"📣 N new updates"** strip linking to `/updates`. Neutral/`clay` treatment —
  **not** a status hue (honey/tomato stay reserved for genuine urgency). Hidden
  when zero unseen.
- **`/updates` inbox page**: newest-first announcement cards — display-serif
  title, body, mono timestamp. Rendering the page fires `markUpdatesSeenAction`,
  clearing the badge. Forgiving empty state when there are no updates.
- **Nav**: an "Updates" pill for volunteers carrying the unseen count (mono),
  following the existing nav-pill spec.

### Design-system notes

- Announcements are **not** a status; never honey/tomato. The banner and badge
  use neutral + `clay` (the secondary accent for attention/links).
- Sentence case throughout; mono for timestamps/counts; serif for card titles;
  route dynamic strings through `capitalize()` where authored lower-case.
- Respects `prefers-reduced-motion`; entrance motion decorative only.

## Delivery semantics (override)

- Push/email **bypass** `notificationsEnabled` and quiet hours (via `force`).
- The **in-app inbox always shows** every world-scoped announcement to every
  volunteer regardless of notification prefs — the inbox is the durable record.
- A volunteer with no device token still gets the email fallback.

## Edge cases

- Empty title or body → action rejects with a validation message; nothing sent.
- Zero volunteers in world → the `Announcement` row is still created with
  `recipientCount = 0` and appears in the log.
- Over-length title/body → rejected by the caps above (enforced server-side; the
  compose form also shows counts).
- Demo vs real → an announcement is only ever visible/counted for volunteers in
  its own world.

## Testing

- `lib/announcements.test.ts`: `buildAnnouncementPayload` shape; `sendAnnouncement`
  creates the row, targets only active volunteers in the right world, stamps
  `recipientCount`, and calls dispatch with `force: true`; `unseenCount` /
  `markSeen` behavior around the timestamp boundary and world scoping.
- `lib/notify-dispatch.test.ts`: add cases for `force` overriding the
  notifications-off and quiet-hours gates, and default behavior unchanged.
- Manual: compose+send in the running app (demo world), confirm the banner,
  inbox, badge-clear, and the admin sent log.

## Rollout / migration notes

- Prisma migrate → **restart `next dev`**.
- Only `Code/` is committed (project rule); commit directly to `main`.
