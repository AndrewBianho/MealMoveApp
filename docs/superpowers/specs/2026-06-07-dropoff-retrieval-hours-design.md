# Drop-off retrieval hours — design

**Date:** 2026-06-07
**Status:** Approved, ready for planning

## Problem

A drop-off location can only receive food during the hours it is staffed/open,
but the app has nowhere to record this. Today the only place to mention hours is
the free-text `DropOff.notes` field (its editor placeholder even suggests *"before
7pm"*). That is unstructured, easy to enter inconsistently, invisible to the
matching logic, and gives a volunteer no clear, scannable answer to "can I drop
this off right now?"

This feature lets a drop-off admin set **structured open hours for food
retrieval** — multiple time windows per weekday — and surfaces them, with a live
**"open now / closed"** indicator, to both admins and the volunteers delivering
food.

## Scope

In scope:

- A structured `retrievalHours` field on `DropOff` (multiple windows per day).
- A pure, unit-tested `lib/hours.ts` module: validation, "open now" computation,
  and display formatting.
- A `RetrievalHoursEditor` (drop-off admin) and a reusable `RetrievalHoursDisplay`
  (+ open-now badge).
- A `updateRetrievalHours` server action.
- Surfacing hours on three places: the `/dropoff` console (editable), the
  `/dropoffs/[id]` detail page (read-only), and the volunteer's listing detail
  (read-only, with the open-now badge).
- Seed/mock data so demos show populated hours.

Out of scope (deferred):

- Using hours in claim/eligibility logic (e.g. blocking a claim outside hours).
  Hours are informational for now.
- Per-admin ownership of a specific drop-off. Editing stays role-scoped (any
  `drop_off_admin` can edit any location), exactly matching the existing
  `updateDropOffNotes` behavior — there is no `User`→`DropOff` link today.
- Holiday/one-off exceptions, multi-timezone support, or "opens in 30 min"
  countdowns.
- A drop-off self-signup onboarding flow. Drop-off admins are provisioned by an
  org admin; "after signing up" is satisfied by the always-available console
  editor plus a "set your retrieval hours" empty state.

## Data model

Add to `DropOff`:

```prisma
retrievalHours Json? // RetrievalHours: per-weekday food-retrieval windows
```

Logical shape (TypeScript, stored as JSON):

```ts
type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
interface HourWindow { open: string; close: string } // "HH:MM", 24-hour
type RetrievalHours = Record<DayKey, HourWindow[]>;     // missing/empty day = closed
```

JSON rather than a side table: hours are always read and rendered as a unit and
are never queried in SQL ("open now" is computed in app code), so a relational
`RetrievalWindow` table would add joins and migration weight for no query benefit.
A Prisma migration adds the nullable column; existing rows default to `null`
(treated as "hours not set").

## `lib/hours.ts` — single source of truth (pure, tested)

- `DAY_KEYS: DayKey[]` — canonical Mon→Sun order.
- `APP_TIMEZONE = process.env.APP_TIMEZONE ?? "America/New_York"` — the one
  timezone all hours are interpreted in.
- `validateRetrievalHours(raw: unknown): { ok: true; hours: RetrievalHours } | { ok: false; error: string }`
  - Every key is a valid `DayKey`; each value is an array.
  - Each window: `open`/`close` match `^([01]\d|2[0-3]):[0-5]\d$` and `open < close`
    (string compare works for zero-padded `HH:MM`).
  - Within a day, windows do not overlap (sort by `open`, ensure each `close` ≤
    next `open`).
  - At most 4 windows per day (bounds the editor UI).
  - Normalizes to a full 7-key object with `[]` for absent days.
- `isOpenNow(hours: RetrievalHours | null, now: number = Date.now(), tz: string = APP_TIMEZONE): boolean`
  - Uses `Intl.DateTimeFormat(en-US, { timeZone: tz, weekday, hour, minute, hourCycle:'h23' })`
    to get the current `DayKey` and `HH:MM` in `tz`, then checks window membership
    (`open <= nowHM < close`). `null`/no-window day → false.
- Display helpers: `formatWindow({open, close})` → `"11:00–14:00"`; `formatDay(windows)`
  → `"11:00–14:00, 17:00–20:00"` or `"closed"`.

`now` and `tz` are injectable so the logic is deterministic under test.

## Components

- **`RetrievalHoursEditor`** (`"use client"`) — mirrors `DropOffNotesEditor`
  (`useState` + `useTransition` + `Toast`). Renders 7 day rows; each row holds its
  windows as pairs of `<input type="time">` (open/close), a **×** to remove a
  window, and a **+ add window** control (hidden once a day has 4 windows). A day
  with zero windows displays "closed." Save calls `updateRetrievalHours`; on
  success shows a toast and collapses to display mode. When no hours are set yet,
  the collapsed state shows a "Set your retrieval hours" nudge instead of an empty
  table.
- **`RetrievalHoursDisplay`** (pure server component) — 7 rows (mon→sun) using
  `formatDay`, plus an **`OpenNowBadge`**. The badge pairs its color with text and
  a dot — sage `● open now` / neutral `○ closed` — never hue alone (WCAG AA,
  color-blind-safe per DESIGN.md). Reused on all three surfaces. Accepts
  `hours: RetrievalHours | null`; renders a calm "hours not set yet" line when null.

## Server action

`updateRetrievalHours(dropOffId: string, hours: unknown)` in `app/actions.ts`,
returning the existing `SignUpResult` (`{ ok } | { ok:false; error }`):

1. `auth()`; reject unless role is `drop_off_admin` or `org_admin` (same guard as
   `updateDropOffNotes`).
2. `validateRetrievalHours(hours)`; on failure return its error.
3. `prisma.dropOff.update({ where:{id}, data:{ retrievalHours } })`.
4. `revalidatePath` for `/dropoff`, `/dropoffs/${dropOffId}`, `/`, `/map`.

## Surfaces & plumbing

- **`/dropoff` console card** (`app/dropoff/page.tsx`) — add `RetrievalHoursDisplay`
  and the `RetrievalHoursEditor` to each location card, beside the existing notes
  editor.
- **`/dropoffs/[id]`** (`app/dropoffs/[id]/page.tsx`) — add `RetrievalHoursDisplay`
  (read-only). `getDropOffDetail` already returns the full `DropOff` row, so it
  carries `retrievalHours` after the migration.
- **Listing detail** (`components/ListingDetail.tsx`) — near the existing drop-off
  `MetaRow` (`→ drop at {dropOff}`), show the open-now badge and the day's window.
  Plumbing:
  - `lib/listings.ts` `serializeListing`: change the `dropOff` select from `true`
    to `{ select: { name: true, retrievalHours: true } }`, and map a new
    `dropOffHours` onto the listing.
  - `lib/types.ts` `Listing`: add `dropOffHours?: RetrievalHours`.
- **`DropOffLocation`** (`lib/types.ts`) gains `retrievalHours?: RetrievalHours`;
  `getDropOffs` and `getMapData` in `lib/map.ts` map it through.
- **Seed/mock** — give two or three drop-offs sample `retrievalHours` (including
  one with a midday-gap, multi-window day) so the console, detail page, and a
  listing's drop-off badge all render populated.

## Testing

`lib/hours.test.ts` (`node:test`):

- `validateRetrievalHours`: accepts a valid multi-window week; rejects bad time
  format, `open >= close`, overlapping windows, unknown day key, and > 4 windows
  per day; normalizes missing days to `[]`.
- `isOpenNow`: inside a window → true; before/after → false; exact `open`
  boundary → true and exact `close` boundary → false; closed day → false; second
  of two windows on a day → true. All with an injected `now` and a fixed `tz`.

The editor, display, action, and pages are verified by `npx tsc --noEmit` and a
manual check, per the repo convention (only `lib/**` has a unit-test harness); the
validation and open-now logic they depend on are fully covered in `lib/hours.test.ts`.

## Design-system notes

- New status surface = the open-now badge. It follows the color-blind-safe rule:
  label + dot, sage for open / neutral for closed; `open now`/`closed` is the
  scannable text. No new tokens, colors, or fonts.
- Mono for the times and day labels (metadata), sentence case for prose, per
  DESIGN.md. The editor reuses `Button`/`Toast` and the input styling already used
  by `DropOffNotesEditor`.
- Tailwind only; the editor is standard form controls, no inline styles.

## Migration / rollout

- `npx prisma migrate dev --name dropoff_retrieval_hours` adds the nullable
  column; `npx prisma generate` refreshes the client types.
- Re-seed (`prisma/seed.ts`) to populate demo hours. (Do not run `npm run build`
  while `next dev` is live — project rule.)
