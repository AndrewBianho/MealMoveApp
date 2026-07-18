# Org-admin invite link — design

**Date:** 2026-07-18
**Status:** approved (brainstorm)

## Problem

Org-admin accounts are the only role with no creation path: volunteers,
restaurants, and drop-offs self-register, but `registerUser` explicitly excludes
`org_admin` ("provisioned by an existing org admin"). Today that means seeding
or a manual DB write. A `super_admin` (master admin) needs a first-class way to
bootstrap an org admin for a chapter — including a brand-new chapter — without
touching the database.

## Solution

A super-admin generates a **one-time, no-expiry, revocable bearer link** tied to
a target organization. The recipient opens it, fills in their details (email
prefilled but editable), and the link mints an **active** `org_admin` for that
org and signs them in.

### Decisions (from brainstorm)

- **Link binding:** email-bound but **editable** — the super-admin sets a
  suggested email that prefills; the recipient may change it. The token is the
  real credential, not the email.
- **Target org:** super-admin **picks an existing org or creates a new one**
  (name + optional email domain) at generation time.
- **Lifetime:** **no expiry, single use, revocable.**
- **Generate/manage UI:** super-admin-only panel on `/admin/users`.
- **Accept UX:** a **dedicated page** on the shared `AuthShell` card (like the
  password-reset flow), not the 6-step signup wizard.

## Data model

New `OrgAdminInvite`, mirroring `PasswordResetToken` (store only the hash):

```prisma
model OrgAdminInvite {
  id             String       @id @default(cuid())
  tokenHash      String       @unique          // sha256 of the raw token
  email          String                        // suggested invitee email, lowercased
  organization   Organization @relation(fields: [organizationId], references: [id])
  organizationId String
  createdById    String                        // super_admin user id (scalar, like TeamInvite.invitedById)
  status         String       @default("pending") // pending | accepted | revoked
  acceptedUserId String?                       // the org_admin created (scalar)
  createdAt      DateTime     @default(now())
  acceptedAt     DateTime?

  @@index([status])
}
```

`Organization` gains `orgAdminInvites OrgAdminInvite[]` for the relation. No
`expiresAt` (no-expiry decision). Migration hand-authored to match the existing
migration SQL style; provider is PostgreSQL.

## Token minting

Reuse the reset-token pattern in `app/actions.ts`: raw =
`randomBytes(32).toString("hex")`, stored as `sha256(raw)`. The raw token only
ever lives in the returned URL — **because we store only the hash, the link
cannot be re-displayed later**; it is shown once at creation. A lost link is
handled by revoke + regenerate.

Pure logic (hashing + org resolution) lives in `lib/orgAdminInvite.ts` so it is
unit-testable with an injected db (like `lib/org.ts` / `org.test.ts`).

## Server actions (`app/actions.ts`)

- `createOrgAdminInvite({ email, orgId?, newOrgName?, newOrgDomain? })`
  - Guards `super_admin`; blocks in demo (`blockIfDemo`, like `inviteTeammate`).
  - Rate-limited per IP.
  - Resolves the org: existing `orgId`, or creates a non-default `Organization`
    from `newOrgName` (+ optional lowercased `newOrgDomain`, handling the unique
    domain conflict with a friendly error).
  - Mints token, stores hash, returns `{ ok: true, url }` (absolute link).
- `revokeOrgAdminInvite(id)` — super-admin only; sets `status = "revoked"` while
  `pending` (no-op/error otherwise).
- `acceptOrgAdminInvite({ token, name, email, phone, password })`
  - Looks up by `sha256(token)`; must be `pending`.
  - Validates name / 10-digit phone / password (`passwordValid`) — same rules as
    `registerUser`.
  - Rejects if the chosen email already belongs to a user.
  - In a transaction: create `org_admin` (status `active`) in the invite's org;
    set invite `accepted` + `acceptedUserId` + `acceptedAt`.
  - Returns `{ ok: true }`; the client then signs in via NextAuth credentials
    (mirroring `LoginForm`).

## UI

**Generate (`/admin/users`, super-admin only):** `OrgAdminInvitePanel` client
component rendered where `GlobalRosterControls` already is (both super-admin
gated). Small form: suggested email + a segmented "existing org / new org"
choice (select, or name + optional domain). On success, reveal the link once in
a copyable field. Below, a list of invites (email · org · status) with a
**Revoke** action on pending ones. Server component supplies the org list and
existing invites.

**Accept (`app/admin-invite/[token]/page.tsx`):** server looks up by token hash.
Invalid / accepted / revoked → a calm `AuthShell` panel ("This invite link is no
longer valid"). Valid → `AcceptOrgAdminForm` on `AuthShell`: shows the org name,
prefilled editable email, name, phone, password (live rules from
`lib/password.ts`, reusing `authStyles.ts` recipes and the sage focus ring). On
success, sign in and redirect.

## Security

- Bearer token, single-use, revocable; only the hash is stored.
- Generation is super-admin-only, demo-blocked, and rate-limited.
- Accept re-checks `pending` inside the write and enforces email uniqueness.
- No account enumeration concern on accept beyond the standard "email in use".

## Testing

`node:test` with an injected db (like `org.test.ts`):

- token hash round-trip / lookup;
- accept rejects a `revoked` or `accepted` token;
- accept rejects a duplicate email;
- org resolution: existing `orgId` vs newly created org (with/without domain);
- guards: non-super-admin and demo are blocked from generation.

## Deploy dependency

Requires **two** migrations applied to the live DB together on the next deploy:
the pending `super_admin` role migration (`20260717120000_add_super_admin_role`,
not yet applied per prior decision) **and** the new `OrgAdminInvite` migration.
The feature is non-functional in production until both are applied. Code changes
here do not apply them.

## Out of scope (YAGNI)

- No expiry timestamps or scheduled cleanup.
- No re-display of a used/lost link (revoke + regenerate instead).
- No editing an org's name/domain from this flow (org rename lives elsewhere).
- No bulk invite generation.
```
