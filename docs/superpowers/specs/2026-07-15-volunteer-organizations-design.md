# Volunteer organizations (Malvern) — design spec

**Date:** 2026-07-15
**Status:** Approved, ready for implementation planning

## Summary

Introduce multi-organization support for **volunteers only**. Add a first-class
`Organization` entity; every volunteer (and org admin) belongs to one
organization. New volunteers are auto-assigned to an organization by their email
domain — a sign-up with an `@malvernprep.org` email joins the seeded **Malvern**
organization; everyone else joins the default **Campus Food Rescue**
organization.

Organizations group and scope **volunteer-facing** surfaces only. Restaurants,
drop-offs, food listings, pickups, and the partner-approval queue stay **global
and shared** across the whole app — the claim → pickup → drop-off food path is
untouched.

## Motivation

The app is single-tenant today: "organization" is a fixed constant
(`CHAPTER_NAME = "Campus Food Rescue"` in `lib/org.ts`), one campus in Malvern,
PA. We want to onboard distinct volunteer communities (starting with Malvern
Prep) so each has its own roster, its own admin oversight, its own impact
numbers, and its own announcements — without splitting the shared pool of
restaurants, drop-offs, and live food.

## Scope

### In scope (org-scoped)

1. **Roster + admin scope.** Each org admin sees and manages only their own
   organization's volunteers (roster list, volunteer-detail page, remove/soft-
   delete, role changes on volunteers).
2. **Volunteer impact stats.** Org-scoped volunteer totals ("Malvern volunteers
   rescued X meals"), alongside the existing global chapter totals.
3. **Announcements / comms.** An org admin broadcasts only to their own
   organization's volunteers.
4. **Profile label.** A volunteer's `/profile` "organization" line shows their
   actual organization name instead of the fixed `CHAPTER_NAME` constant.

### Explicitly out of scope (stays global / shared)

- Restaurants, drop-offs, and the accounts that speak for them.
- Food listings, claims, pickups, buddy invites, messages, broadcasts.
- The **pending-partner approval queue**: any org admin may approve/manage any
  restaurant or drop-off. Partners are not org-scoped, so their approval is a
  shared global responsibility (confirmed decision).
- Restaurant / drop-off impact stats (already location-scoped, unchanged).
- No org-creation UI in this iteration — new organizations are added by seeding.
  The model is general (an `Organization` table with a domain rule) so a
  creation UI can be layered on later.

## Approach

Org membership is a plain FK on `User`, resolved at request time from the acting
user's own record. We do **not** thread `organizationId` through the NextAuth
JWT/session — that would change the session shape and invalidate existing
tokens. A single cheap lookup of the current user's `organizationId` scopes each
admin surface instead.

## Data model changes

`Code/prisma/schema.prisma`:

```prisma
model Organization {
  id          String   @id @default(cuid())
  name        String
  // Bare email domain that auto-joins volunteers signing up with it
  // (e.g. "malvernprep.org"). Null for the fallback/default org. Unique so a
  // domain maps to exactly one org.
  emailDomain String?  @unique
  // Exactly one Organization is the fallback for volunteers whose email domain
  // matches no org. Enforced by seed/convention (Postgres can't express a
  // partial-unique in Prisma schema directly — see migration note).
  isDefault   Boolean  @default(false)
  createdAt   DateTime @default(now())

  users       User[]
  announcements Announcement[]
}
```

`User`:

```prisma
model User {
  // ...existing fields...
  // The volunteer/org-admin's organization. Null for restaurant/drop_off
  // accounts (partners are global, not org-scoped) and for legacy rows until
  // backfilled.
  organization   Organization? @relation(fields: [organizationId], references: [id])
  organizationId String?

  @@index([organizationId])
}
```

`Announcement`:

```prisma
model Announcement {
  // ...existing fields...
  // The org whose volunteers this announcement was sent to. Null only for
  // legacy pre-migration rows.
  organization   Organization? @relation(fields: [organizationId], references: [id])
  organizationId String?

  @@index([organizationId, createdAt])
}
```

### Migration

New migration under `Code/prisma/migrations/`:

1. Create the `Organization` table and the new columns/indexes.
2. Seed two rows:
   - **Campus Food Rescue** — `isDefault: true`, `emailDomain: null`.
   - **Malvern** — `emailDomain: "malvernprep.org"`, `isDefault: false`.
3. Backfill: every existing `User` whose role is `volunteer` or `org_admin` gets
   `organizationId` set. Assign by email domain (matching the same rule as
   sign-up); anyone whose domain doesn't match a seeded org falls back to the
   default org. Restaurant/drop-off users are left `null`.
4. Backfill existing `Announcement` rows: set `organizationId` to the default
   org (they were chapter-wide) so the `/updates` inbox stays coherent.

Enforce the "exactly one default" invariant in the seed/migration (there is only
ever one `isDefault: true` row); document it in a schema comment. The seed
scripts (`prisma/seed.ts`, `prisma/seedDemo.ts`, `prisma/reset-demo.ts`) must
create these orgs and assign seeded volunteers/admins accordingly, for both the
`real` and `demo` worlds.

## Org resolution helper

`Code/lib/org.ts` gains the resolution logic (keeping the file as the single
home for "which org?" questions):

- `orgForEmail(email: string): Promise<Organization>` — lowercase the email,
  extract the domain after `@`, look up `Organization` by `emailDomain`; return
  the match, else the `isDefault` org. Never returns null (the default always
  exists).
- `defaultOrg(): Promise<Organization>` — fetch the `isDefault` org.

`CHAPTER_NAME` stays as the app-wide brand/fallback string, but the volunteer
profile no longer uses it as the user's org identity (see Profile).

## Sign-up routing

`registerUser` in `Code/app/actions.ts`:

- **Volunteer** sign-up: after email validation, call `orgForEmail(email)` and
  set `organizationId` on the created user.
- **Team-invite** sign-ups (restaurant/drop-off via `TeamInvite`): leave
  `organizationId = null` — partners are global.
- **Self-serve restaurant/drop-off**: leave `organizationId = null`.
- Any path that creates or promotes an **org_admin** assigns
  `organizationId` via `orgForEmail(email)` as well, so admins are scoped to the
  org their email domain implies (Malvern admin ↔ `@malvernprep.org`).

## Admin roster + scope

`Code/app/admin/users/page.tsx` and `Code/app/admin/users/[id]/page.tsx`:

- Resolve the acting admin's `organizationId` from their user record.
- The **volunteer** roster query filters `where: { role: "volunteer",
  organizationId: <adminOrgId> }`. The **org_admin** roster likewise filters to
  the same org.
- The **restaurant / drop-off** roster and the **pending-approval** queue are
  unchanged (global) — every org admin sees the shared partner pool.
- The volunteer-detail page (`[id]`) rejects (404/redirect) a volunteer who
  belongs to a different org than the acting admin, so admins can't deep-link
  into another org's volunteer. Partner detail pages stay global.
- Server actions that mutate a volunteer (soft-delete, role change) re-check that
  the target volunteer shares the actor's org — defense in depth, since actions
  aren't route-scoped.

## Volunteer impact stats

`Code/lib/stats.ts`:

- Add an **org-scoped** variant of the volunteer impact / reliability queries
  (`getVolunteerImpact` / `getVolunteerReliability` / the impact totals) that
  filters the underlying pickups by the volunteer's `organizationId`.
- Surface org-scoped totals on the admin analytics view as "‹Org name›
  volunteers rescued X meals". The existing global `getImpactStats` (chapter-
  wide, all volunteers) is unchanged and can still be shown.
- No change to `getRestaurantImpactStats` / `getDropOffImpactStats` — partners
  stay global.

## Announcements

`Code/app/actions.ts` (`sendAnnouncementAction`) and the announcement fan-out
(`lib/notify`/`sendAnnouncement`, `countAudience`):

- Scope recipients to the acting admin's `organizationId`: audience selection,
  `countAudience`, and the durable `recipientIds` all filter volunteers to that
  org (in addition to the existing world/`dataMode` filter).
- Persist `Announcement.organizationId` at send time.
- `audienceLabel` reflects the org (e.g. "Malvern volunteers" / "Everyone in
  Malvern") so the `/updates` inbox log reads correctly.
- The `/updates` inbox already scopes by `recipientIds`; since those are now
  org-filtered, volunteers only ever see their own org's announcements — no
  extra inbox query change needed beyond confirming this holds.

## Profile

`Code/app/profile` (and wherever `CHAPTER_NAME` is shown as the user's org):

- Show the volunteer's actual `organization.name` as the "organization" line.
- Fall back to `CHAPTER_NAME` only if `organizationId` is somehow null (legacy
  safety).

## Design-system / UI notes

Any new UI (the org label on profile, the org name on admin analytics /
announcement audience) follows the existing tokens and rules in `DESIGN.md`:
sentence case, mono for metadata, ink text tiers, no new colors. This is
primarily a data/scoping change; new visible strings are minimal (an org name
label and an announcement-audience label) and reuse existing components
(`InfoRows`, the analytics metric cards, the announcement composer).
Non-punitive presentation of reliability/impact is preserved — org-scoped stats
are still bars/percentages, never grades or leaderboards.

## Testing

- **Unit:** `orgForEmail` — `@malvernprep.org` → Malvern; other domains →
  default; case-insensitivity; malformed email falls back to default safely.
- **Sign-up:** a volunteer with an `@malvernprep.org` email lands in Malvern; a
  gmail volunteer lands in the default org; a restaurant/drop-off sign-up gets
  `organizationId = null`.
- **Admin scope:** a Malvern admin's roster excludes default-org volunteers and
  vice-versa; the partner roster/approval queue is identical for both admins;
  the volunteer-detail page blocks cross-org access; the mutate actions reject
  cross-org targets.
- **Stats:** org-scoped volunteer impact counts only that org's pickups; global
  totals unchanged.
- **Announcements:** a Malvern admin's announcement reaches only Malvern
  volunteers (recipientCount, recipientIds, and the other org's `/updates`
  inbox stays empty of it); `organizationId` and `audienceLabel` are persisted.
- **Migration/seed:** existing volunteers/admins are backfilled; exactly one
  `isDefault` org exists; demo and real worlds each get the orgs.

## Open questions / future work

- Org-creation admin UI (deferred — seed-only for now).
- Whether a "super admin" should ever see across orgs (not needed now; every org
  admin shares the global partner view, which covers cross-cutting operations).
- Restaurants/drop-offs remaining global is intentional; if a future iteration
  wants org-scoped partners, it's a separate spec.
