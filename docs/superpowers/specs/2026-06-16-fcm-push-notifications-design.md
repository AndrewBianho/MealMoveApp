# Push notifications (FCM web push + email fallback) — design

**Date:** 2026-06-16
**Status:** Approved, ready for implementation planning

## Context

Meal Move's primary failure mode is volunteers flaking on claimed pickups. The
product's anti-flaking levers (check-in nudges, buddy invites, drop-off arrival
notices) depend on reaching a volunteer's phone in the moment. Today those three
notification points exist only as no-op integration seams in `lib/notify.ts` —
they log in development and do nothing in production.

This project makes them real: web push via Firebase Cloud Messaging (FCM) where
the device supports it, with email as the fallback so iPhone users (who can't get
web push unless they install the PWA) still get nudged.

## Goals

- Deliver all three existing notification seams to real recipients.
- Reach Android/desktop instantly via web push; fall back to email everywhere
  else.
- Make notifications strictly opt-in, with two on-ramps: a settings toggle and a
  one-time gentle prime after a volunteer's first claim.
- Keep the change isolated: the three seams remain the single integration point;
  call sites (`checkins.ts`, `buddies.ts`, `photos.ts`) don't change.

## Non-goals (YAGNI for v1)

- Per-notification-type preferences. A single on/off flag governs all nudges.
- Always-send-both. Email is a fallback, not a parallel channel.
- Native mobile apps. Web push + PWA install only.
- In-app notification center / history.

## Channels & the fallback rule

A single per-user opt-in (`notificationsEnabled`) governs whether *any* nudge is
sent. When enabled, for each recipient:

1. Load the user's registered device tokens.
2. If one or more live tokens exist → send via `firebase-admin`. Prune any token
   FCM reports as unregistered/invalid.
3. If no live token remains (none registered, or all pruned) → send the email
   variant via the existing SMTP/nodemailer path (`lib/email.ts`).

Transactional email (password reset) is separate and unaffected by this flag.

## Architecture

### Integration point (unchanged seams)

`lib/notify.ts` keeps its three exported functions —
`sendCheckInPush`, `sendBuddyInvitePush`, `sendDropOffPickupNotice` — with their
current signatures. They are already dependency-injected into the call sites via
a `notify =` parameter (`lib/checkins.ts:22`, `lib/buddies.ts:65`,
`lib/photos.ts:56`), so no call site changes.

Internally each becomes a thin wrapper over a shared dispatcher:

```
dispatchToUser(userId, { title, body, url, email: { subject, html } })
  → tokens = load DeviceTokens for userId
  → if tokens: firebase-admin sendEachForMulticast; prune dead tokens
  → else: sendEmail(user.email, subject, html)
```

`sendDropOffPickupNotice` and the restaurant-facing fan-out already target a
*set* of admins/members (`restaurantMemberIds`), so the dispatcher is called once
per recipient id.

### Data model (Prisma)

New model:

```prisma
model DeviceToken {
  id         String   @id @default(cuid())
  userId     String
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  token      String   @unique          // FCM registration token
  userAgent  String?
  createdAt  DateTime @default(now())
  lastSeenAt DateTime @default(now())
  @@index([userId])
}
```

New fields on `User`:

- `notificationsEnabled Boolean @default(false)` — the opt-in flag.
- `notifyPrimedAt DateTime?` — set when the first-claim prime has been shown, so
  it appears at most once.

A migration adds the table and columns. (Reminder: after `prisma migrate`,
restart `next dev` so the new model is defined at runtime.)

### Client pieces

- **Firebase web SDK init** — a small client module configured from
  `NEXT_PUBLIC_FIREBASE_*` env vars.
- **`public/firebase-messaging-sw.js`** — service worker that displays
  background push messages.
- **`public/manifest.json` + icons** — minimal PWA manifest, required so iOS
  users can "Add to Home Screen" and become push-eligible. Linked from the root
  layout `metadata`.
- **Permission/registration hook** — requests `Notification` permission, gets the
  FCM token (with the VAPID key), and POSTs it to the register endpoint; used by
  both the settings toggle and the first-claim prime.
- **Settings toggle** — "Notify me about pickups" in `app/settings`. On →
  permission + register + flag true. Off → unregister + flag false.
- **First-claim prime** — a soft, dismissible card shown after a volunteer's
  first successful claim (gated by `notifyPrimedAt`), one button into the same
  registration flow. Never blocks the claim flow.

### Server pieces

- **`firebase-admin` init** — singleton initialized from a service-account
  credential (env), mirroring the `lib/prisma.ts` singleton pattern.
- **`POST /api/notifications/register`** (auth required) — upserts a
  `DeviceToken` for the current user, sets `notificationsEnabled = true`,
  refreshes `lastSeenAt`. Rate-limited per user (reuse the existing limiter).
- **`POST /api/notifications/unregister`** (auth required) — deletes the token(s)
  for the current user / device; if none remain, sets
  `notificationsEnabled = false`.
- **`lib/notify.ts` real dispatch** — as above, including dead-token pruning.
- **Email variants** — three templates in `lib/email.ts` for the check-in nudge,
  buddy invite, and drop-off arrival notice.

### Environment variables

Public (browser): `NEXT_PUBLIC_FIREBASE_API_KEY`,
`NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`,
`NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`,
`NEXT_PUBLIC_FIREBASE_VAPID_KEY`.

Server: a Firebase service-account credential —
`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`.

All documented in `.env.example`. The system degrades gracefully: with Firebase
unset, `dispatchToUser` skips push and uses email; with SMTP also unset, it
logs (current dev behavior). Nothing throws.

## Data flow (check-in nudge example)

1. Cron sweep (`/api/cron/sweep`) reaches a check-in mark and calls
   `sendCheckInPush(push)` (already wired).
2. `sendCheckInPush` builds the payload and calls `dispatchToUser(volunteerId, …)`.
3. Dispatcher loads the volunteer's `DeviceToken`s.
   - Tokens present → FCM multicast; on `registration-token-not-registered`,
     delete that token row.
   - No tokens → email the volunteer the nudge.
4. The volunteer taps the push (or email link) and lands on the pickup
   (`url` / link → `/listings/[id]`).

## Error handling

- **No opt-in** → dispatcher returns early, sends nothing.
- **Dead/expired token** → pruned on the failed send; remaining tokens still get
  the message; email is *not* additionally sent if at least one token succeeded.
- **Firebase misconfigured/unreachable** → caught; fall back to email.
- **Email also unavailable** → logged, never throws (matches current behavior).
- **Permission denied in browser** → registration hook surfaces a calm message;
  the flag is not set; email remains the channel.

## Testing

Follow the existing `lib/**/*.test.ts` + dependency-injection pattern:

- `dispatchToUser` decision logic with an injected fake admin sender and fake
  mailer: push when tokens exist, email when none, email when push throws, and
  dead-token pruning on the unregistered-token error.
- The three `notify.ts` wrappers build the correct payload/recipient set
  (especially the restaurant/drop-off fan-out).
- Register/unregister endpoint behavior: upsert, flag flip, and the
  "last token removed → flag false" transition.

Manual end-to-end (documented for the deploy runbook): opt in on desktop Chrome,
trigger a check-in mark via the sweep, confirm the push arrives; opt out;
confirm an iPhone user (not installed) receives the email variant instead.

## Privacy

Device tokens and the opt-in are already described in the privacy policy
(`app/privacy/page.tsx`): "Notification tokens" under data collected, the
opt-in/opt-out under "Notifications", and Firebase under "Who we share it with".
No policy change needed beyond keeping the effective date current.

## Rollout / sequencing

The work decomposes into independently shippable layers, build bottom-up:

1. Data model + migration (`DeviceToken`, `User` fields).
2. Server: `firebase-admin` init, dispatcher, token pruning, email variants,
   register/unregister endpoints. (Push can be exercised server-side before any
   UI by inserting a token manually.)
3. Client: Firebase init, service worker, manifest, registration hook.
4. Opt-in UI: settings toggle, then the first-claim prime.
5. Env docs + deploy runbook entry + manual verification.
