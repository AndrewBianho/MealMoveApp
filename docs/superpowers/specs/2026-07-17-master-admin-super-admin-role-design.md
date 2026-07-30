# Master admin (`super_admin` role) — design

_Date: 2026-07-17. Status: approved (design). Scope: the `Code/` Next.js app._

## Goal

Give one privileged identity (`admin@example.com`) global, cross-org
powers on top of the existing per-org admin model:

1. **Monitor globally** — reach and view every console / every org's data.
2. **Change account type by email** — promote/demote `volunteer ↔ org_admin`
   for any account in any org, and grant/revoke `super_admin` itself.
3. **Delete accounts** — soft-delete any active account in any org.
4. **See stats of specific orgs** — an org switcher on analytics.

Represented as a first-class **`super_admin`** role (a 5th `Role`). The existing
org-admin machinery (roster, `setRole`/`deleteAccount`, `AdminEvent` audit,
`getOrgVolunteerImpact`) is reused; the work is mostly *lifting the org boundary*
for this one role, contained behind a single helper so the 72 existing
`org_admin` references don't each need editing.

## Background — how scoping works today

- `Role` = `volunteer | restaurant | drop_off | org_admin`. **Organizations**
  group `volunteer`/`org_admin` by email domain; `restaurant`/`drop_off` are
  global (no org).
- An `org_admin` is scoped to **their own org**: `rosterWhere(adminOrgId, demo)`
  keeps partners global but managed roles org-scoped; `setRole` and
  `deleteAccount` guard with `assertSameOrg`. `setRole` only toggles
  `volunteer ↔ org_admin` (`ManagedRole`); partner roles are "managed at
  sign-up". All admin mutations are demo-blocked (`blockIfDemo`) and logged to
  `AdminEvent`.
- Food-movement stats (`getImpactStats`, `getVolunteerReliability`) are **global**
  (demo-scoped only) because listings belong to restaurants, which are global.
  The only org-partitioned stat today is `getOrgVolunteerImpact(orgId)`.

## Decisions (locked)

- **Representation:** new `super_admin` role (not an env allowlist / DB flag).
- **Role changes:** `volunteer ↔ org_admin` across any org, plus grant/revoke
  `super_admin`. Partner roles stay managed at sign-up.
- **UI:** augment the existing `/admin` console (global roster + org filter +
  email search; analytics org switcher). No separate super console.

## Architecture

### 1. Identity & bootstrap
- Prisma migration adds the enum value: `ALTER TYPE "Role" ADD VALUE 'super_admin'`
  (Postgres enum additions run outside a transaction; Prisma handles this).
- `scripts/promote-super-admin.ts` — idempotent: sets `role = super_admin`
  where `email = admin@example.com` (configurable via arg/env), no-op if
  already set or the account doesn't exist. Add the same promotion to the dev
  seed so local has one.
- Not self-registerable: `registerUser` already restricts sign-up to
  `volunteer | restaurant | drop_off`, so `super_admin` can never be chosen.

### 2. Guard layer — one override, not 72 edits
- New `lib/roles.ts`:
  - `isSuperAdmin(role): boolean`
  - `isAdmin(role): boolean` = `org_admin || super_admin`
- `lib/authz.ts` → `requireRole(...)`: after `requireUser()`, add
  `if (user.role === "super_admin") return user;` so it passes **every** role
  gate.
- `auth.config.ts` → `authorized`: after the signed-out and auth-page branches,
  add `if (user.role === "super_admin") return true;` — reaches every route
  (still requires being signed in). Keep the existing `isAuthPage` redirect so a
  signed-in super admin visiting `/login` still bounces to their home.
- `ROLE_HOME[super_admin] = "/admin/analytics"`.
- Audit the ~28 `role === "org_admin"` comparisons. Those gating **admin
  capability / chapter oversight** switch to `isAdmin(role)`:
  - `lib/dropoffConsole.ts`: `isOrgAdmin` → `isAdmin(role)` (super admin gets the
    chapter-wide view, then the tabs redirect it to analytics like an org admin).
  - `app/(feed)/page.tsx`, `app/restaurant/page.tsx`,
    `app/restaurant/listings/page.tsx`: the `if (role === "org_admin")
    redirect("/admin/analytics")` lines → `if (isAdmin(role))` (super admin isn't
    a claiming/posting role either).
  - Server-action role checks in `app/actions.ts` (below).
  - The `canClaim = role !== "org_admin"` spots (feed/map/listing) → treat super
    admin as non-claiming too: `canClaim = !isAdmin(role)`.
  Comparisons that mean *specifically the org-admin persona* (e.g. showing the
  reliability section only to org admins on `/impact`) stay as-is, unless we want
  super admin to see them too — default: **widen oversight reads to `isAdmin`**.
- The 5 `Record<Role, …>` maps need a `super_admin` key (TS fails otherwise):
  - `components/NavBar.tsx` `NAV_BY_ROLE` → same items as `org_admin`.
  - `components/ChatPanel.tsx` `ROLE_LABEL` → `"master admin"`.
  - `components/SignupForm.tsx` `ROLE_LABEL` + `NOTIF_COPY` → present but unused
    (sign-up never offers it).
  - `components/welcome/slides.tsx` `SLIDES_BY_ROLE` → reuse the `org_admin` deck.
- Role label rendering (`role.replace(/_/g, " ")` → "super admin"): acceptable;
  optionally special-case to "master admin" where a friendly label matters.

### 3. Global roster + role management (`/admin/users`)
- `lib/orgRoster.ts` → `rosterWhere` gains a global mode. Simplest: an optional
  flag (e.g. `rosterWhere(adminOrgId, demo, { global })`) — when `global` (super
  admin), managed roles are included with **no** `organizationId` filter, so the
  roster is every org's volunteers/admins + the global partner pool.
- `app/admin/users/page.tsx`: when the viewer is `super_admin`, pass `global`,
  add an **org filter** and an **email-search** box, and surface an **org
  column** on managed rows. Reuse the existing roster grouping/components.
- `app/actions.ts` → `setRole(userId, role)`:
  - Role check widens to `isAdmin(session.user.role)`.
  - When actor is `super_admin`: **bypass `assertSameOrg`**, and allow the target
    `role` to be `super_admin` (extend the accepted set for super-admin actors
    only — org admins remain limited to `volunteer | org_admin`).
  - Guards retained/added: last-org-admin (existing), **last-super-admin** (can't
    demote the final super admin), **no self-demotion** that would strip your own
    super_admin and lock global control. Partner roles still rejected.
  - `AdminEvent` `role_changed` unchanged (from/to meta).

### 4. Delete accounts (global)
- `app/actions.ts` → `deleteAccount(userId)`: role check → `isAdmin`; when actor
  is `super_admin`, **bypass `assertSameOrg`**. Keep all existing rails: no
  self-delete, no last-org-admin (and last-super-admin), pending→Decline,
  soft-delete (`status = deleted`) preserving pickups/messages/audit. Venue rows
  untouched.
- `approveAccount` / `declineAccount`: role check → `isAdmin` (partners are
  global, so these already work cross-org).

### 5. Per-org stats (`/admin/analytics`)
- Add an **org switcher** (default "All orgs") rendered only for `super_admin`;
  selection carried in a search param (like the existing `?days=` window).
- **Global stays global:** food-movement metrics (`getImpactStats`,
  health/dashboard funnel) are not org-partitionable — shown as-is under "All
  orgs" and unaffected by the switcher.
- **Org-partitioned = volunteer-centric:** when an org is selected, scope the
  org sections to it:
  - `getOrgVolunteerImpact(selectedOrgId, …)` (already org-scoped) uses the
    selected org instead of `actor.organizationId`.
  - Add an optional `organizationId` to `getVolunteerReliability` so reliability
    can be scoped to the selected org's volunteers.
  - Member counts from the (global-capable) roster query, filtered to the org.

### 6. Audit & safety
- Every super-admin mutation writes to `AdminEvent` (actor/target/meta), same as
  org-admin actions — a full god-mode trail.
- Destructive/role mutations keep `blockIfDemo` (management is a real-world
  action).

## Testing
- `lib/roles.test.ts`: `isAdmin`/`isSuperAdmin` truth table.
- `lib/orgRoster.test.ts`: global mode returns managed roles across orgs +
  partners; non-global unchanged.
- `lib/authz` / guard: `requireRole` returns for `super_admin` regardless of the
  allowed set.
- `app/actions` (or extracted pure helpers): `setRole`/`deleteAccount` allow a
  super-admin actor across orgs; last-super-admin and self-demotion guards fire;
  org admins still can't grant `super_admin` or cross orgs.

## Blast radius (files)
- `prisma/schema.prisma` + a migration.
- `lib/roles.ts` (new), `lib/authz.ts`, `auth.config.ts`, `lib/orgRoster.ts`,
  `lib/dropoffConsole.ts`, `lib/stats.ts` (reliability orgId).
- `app/actions.ts` (setRole / deleteAccount / approve / decline).
- `app/(feed)/page.tsx`, `app/restaurant/page.tsx`,
  `app/restaurant/listings/page.tsx`, `app/admin/users/page.tsx`,
  `app/admin/analytics/page.tsx`, plus feed/map/listing `canClaim` spots.
- `components/NavBar.tsx`, `components/ChatPanel.tsx`,
  `components/SignupForm.tsx`, `components/welcome/slides.tsx`, roster
  controls/filter/search components.
- `scripts/promote-super-admin.ts` (new) + seed promotion.
- Tests as above.

## Out of scope / YAGNI
- No UI to *create* super admins from scratch (promotion is by role change of an
  existing account, or the bootstrap script).
- No changing accounts **to** partner roles (needs venue creation) — deferred.
- No org-partitioning of food/restaurant/drop-off stats (they aren't org-owned).
