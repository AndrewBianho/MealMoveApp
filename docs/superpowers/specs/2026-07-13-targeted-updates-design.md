# Targeted updates — audience segmentation for org-admin updates

**Date:** 2026-07-13
**Status:** Approved design, ready for implementation planning
**Builds on:** `2026-07-13-mass-updates-design.md` (shipped — `Announcement` model,
`lib/announcements.ts`, `/admin/updates` composer, `/updates` volunteer inbox)

## Summary

Today an org admin's update goes to **every** active volunteer in their world.
This adds an **audience selector**: the admin can instead target a specific group
— volunteers below a reliability band, first-timers, lapsed volunteers, or those
near a location. Delivery (push/email with the opt-out override + the in-app
inbox) is unchanged; only *who is in the recipient list* changes.

## Goals

- An org admin can pick an audience when composing an update, see a **live
  recipient count**, and send only to that group.
- Targeting reuses data the app already has (event-log reliability, claim
  history, volunteer lat/lng) — no new tracking.
- The sent log records which audience each update went to.
- Segmentation stays **non-punitive**: no names, no individual percentages, no
  ranking surfaces anywhere in the send flow.

## Non-goals (YAGNI)

- Saved/reusable named segments (admin picks an audience per send).
- Combining segments (AND/OR).
- Arbitrary map-point radius (the `near` segment anchors to an existing
  restaurant or drop-off).
- Custom numeric reliability thresholds (named bands only).
- Per-recipient read receipts; editing/deleting/scheduling a sent update.

## Decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Segments | **All four**: reliability band, new/first-timers, lapsed, near a location |
| Threshold model | **Named bands** — reuse the app's existing meter thresholds (<50 / 50–79 / ≥80) |
| Framing | **Support-oriented labels + count only** — never names or individual %s |
| `new` vs `lapsed` | `new` = never completed a rescue (a never-claimed volunteer is `new`, not `lapsed`) |
| Zero-match send | **Disabled** — send is blocked when the audience matches nobody |
| Delivery | Unchanged — `dispatchToUser(..., { force: true })` + in-app inbox |

## The audience descriptor

A discriminated union, defined in `lib/segments.ts`:

```ts
export type Audience =
  | { kind: "everyone" }
  | { kind: "reliability"; band: "needs_support" | "finding_footing" | "star" }
  | { kind: "new" }
  | { kind: "lapsed"; days: 14 | 30 | 60 }
  | { kind: "near"; anchor: { kind: "restaurant" | "dropoff"; id: string }; radiusMi: 2 | 5 | 10 };
```

Every audience is **world-scoped** (demo/real, from the admin's `dataMode`) and
always intersected with `role: "volunteer", status: "active"`. `everyone` is the
default and preserves today's behavior exactly.

### Segment rules

| Segment | Rule |
|---|---|
| `everyone` | All active volunteers in the world. |
| `reliability` | From the event log, **world-scoped**: per volunteer, `delivered` counts for them; `released` / `failed` count against. `pct = delivered / (delivered + flaked) * 100`. Bands: `needs_support` < 50, `finding_footing` 50–79, `star` ≥ 80. Volunteers with **no** terminal event history (no `delivered`/`released`/`failed`) are in no band (they are `new`). |
| `new` | Active volunteers with **no terminal event history** (`delivered`/`released`/`failed`) in the world — true first-timers. A volunteer who claimed and flaked (only `released`/`failed`, no `delivered`) has history, so they belong to a reliability band, not `new`. This makes `new` and the reliability bands **disjoint**: `new` is exactly the complement of "has terminal history." |
| `lapsed` | Active volunteers who **have** claimed before but whose most recent `Pickup.claimedAt` is older than `days`. Never-claimed volunteers are excluded (they're `new`). |
| `near` | Active volunteers with a known `lat`/`lng` within `radiusMi` of the anchor location's coordinates (`milesBetween` from `lib/geo`). Volunteers without a position are excluded — same rule the escalating broadcast already uses. |

**Reliability is computed world-scoped here**, by joining `ListingEvent` → its
listing's `demo` flag. Note the existing `getVolunteerReliability()` in
`lib/stats.ts` is *global* (not world-scoped); we do **not** reuse it, and we do
not change it (out of scope).

## Non-punitive framing (a hard requirement)

The product forbids grading, ranking, or flagging people. This feature must not
become a back door to that.

- Segment labels are **intent-named**, not deficit-named:
  - `needs_support` → "Volunteers who could use encouragement"
  - `finding_footing` → "Volunteers finding their footing"
  - `star` → "Volunteers who've been rock solid"
  - `new` → "New volunteers"
  - `lapsed` → "Haven't been around lately"
  - `near` → "Volunteers near <location>"
- The compose flow shows **only a recipient count** — never names, never
  individual percentages, never a list of who's in the segment.
- Bands reuse the reliability meter's existing thresholds; no new scoring is
  invented.
- The composer carries a quiet copy hint reminding the admin to write warmly
  (these are people doing a favor, not workers being policed).

## Modules

### `lib/segments.ts` (new — the reusable unit)

- `export type Audience` (above), plus the band/day/radius option constants the
  UI renders from.
- `resolveAudience(audience, world, deps?): Promise<string[]>` — returns the
  matching active volunteer IDs, world-scoped. One function, one switch, each
  branch a focused query.
- `audienceLabel(audience, anchorName?): string` — the human label persisted on
  the announcement and shown in the sent log (e.g. `"Haven't been around lately · 30+ days"`,
  `"Volunteers near Maple St Cafe · 5 mi"`).
- `countAudience(audience, world, deps?): Promise<number>` — `resolveAudience(...).length`,
  for the live preview.

### `lib/announcements.ts` (modified)

`sendAnnouncement` gains one field — its input becomes
`{ authorId, title, body, world, audience }` (world still tags the row and scopes
the query; `audience` selects who inside that world). It resolves the recipient
IDs via `resolveAudience(audience, world)` instead of its current inline
"all active volunteers" query, dispatches to exactly those, and stamps
`recipientCount` + `audienceLabel`. Everything else (payload, force dispatch, the
row) is unchanged. An `audience` of `{ kind: "everyone" }` reproduces today's
behavior byte-for-byte. `listAnnouncements` also selects `audienceLabel`.

### Server actions (`app/actions.ts`)

- `sendAnnouncementAction(title, body, audience)` — org-admin-guarded as today;
  validates the audience descriptor server-side (never trust the client), then
  sends. Rejects a zero-match audience with a clear error.
- `countAudienceAction(audience)` — org-admin-guarded; returns the recipient
  count for the live preview.

## Data model

Add one field to the existing `Announcement` model:

```prisma
audienceLabel String @default("Everyone") // human label of who this went to
```

The label captures the segment *and* its parameters, so no separate params
column is needed for the log. One additive migration (**restart `next dev`
after**). No other schema change; `recipientCount` already exists.

## UI

### Admin composer (`components/AnnouncementComposer.tsx`) — compact console scale

Above the title/message fields, a new **audience** block:

- An audience selector (segmented control or select) listing the five options by
  their intent-named labels.
- A **conditional parameter control**, shown only for the segments that take one:
  reliability → band choice; lapsed → 14/30/60 days; near → location dropdown
  (the world's restaurants + drop-offs) + 2/5/10 mi radius.
- A live mono count line: `this will reach ~N volunteers` — debounced call to
  `countAudienceAction` on any audience/param change.
- **Send is disabled when the count is 0**, with a quiet hint ("no volunteers
  match this group right now").
- The existing confirm panel echoes the audience: "Send to *Haven't been around
  lately* (4 volunteers)? Push and email go out right away."

Tokens: neutral + `clay` only — the audience block is **not** a status surface,
so no honey/tomato even for the low-reliability band (the point is support, not
alarm). Sentence case; mono for the count.

### Admin sent log (`app/admin/updates/page.tsx`)

Each row gains the audience: title · mono `audienceLabel` · mono `reached N`.

### Volunteer side

**No change.** A targeted update lands in the recipient's inbox exactly like a
broadcast one; a volunteer never sees that they were in a segment, or which one.

## Edge cases

- Audience matches nobody → send blocked (action rejects; button disabled).
- `near` anchor location has no coordinates → treated as zero matches, with the
  same hint.
- Volunteers without lat/lng are excluded from `near` (never distance-targeted).
- A volunteer with no event history is `new`, never in a reliability band, and
  never `lapsed`.
- Client-supplied audience is re-validated server-side (band/days/radius must be
  in the allowed sets; anchor must exist in the admin's world).
- Demo/real separation holds for every segment.

## Testing

`lib/segments.test.ts` (node:test, injected fake db like the existing lib tests):
- `resolveAudience` per segment: correct where-clauses, world scoping, active-only.
- Reliability banding: boundaries at 50 and 80; no-history volunteers excluded
  from every band.
- `lapsed`: never-claimed volunteers excluded; the `days` cutoff boundary.
- `near`: radius boundary; volunteers without lat/lng excluded.
- `audienceLabel` strings for each kind.

`lib/announcements.test.ts` (extended): `sendAnnouncement` dispatches to exactly
the resolved IDs and stamps `audienceLabel` + `recipientCount`.

Manual: compose in the demo world, switch audiences, watch the count change,
send to a segment, confirm only those volunteers' inboxes show it.

## Rollout

- Prisma migrate → **restart `next dev`**.
- Only `Code/` is committed; commit directly to `main`.
- Backward compatible: existing announcements default to `audienceLabel = "Everyone"`.
