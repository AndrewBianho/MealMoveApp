# Master admin (`super_admin` role) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a first-class `super_admin` role that gives one identity (`duoduobianpc@gmail.com`) global, cross-org powers — monitor everything, change `volunteer ↔ org_admin` (and grant/revoke `super_admin`) for any account by email, delete any account, and view per-org stats — reusing the existing org-admin machinery.

**Architecture:** A new `Role` enum value `super_admin`, plus a thin `lib/roles.ts` (`isAdmin`/`isSuperAdmin`/`roleAllowed`) that lets one override in `requireRole` and the middleware grant the role global access without editing all 72 existing `org_admin` references. Cross-org account actions move their guard logic into pure, unit-tested helpers (`lib/accountAdmin.ts`) that `setRole`/`deleteAccount` call; the `/admin/users` roster and `/admin/analytics` pages gain a global mode + org switcher for super admins.

**Tech Stack:** Next.js 14 App Router (server components + server actions), NextAuth v5 (edge `auth.config.ts` + `auth.ts`), Prisma/PostgreSQL (Supabase), `node:test` + `tsx` for tests, Tailwind for UI.

## Global Constraints

- **Sentence case everywhere** — UI copy, labels, status words. Never Title Case / ALLCAPS.
- **Tailwind only** for styling (no inline style objects, no CSS modules). Build against `tailwind.config.ts` tokens; never introduce a new color/font/hex.
- **Text ink tiers:** primary `neutral-800/900`, secondary `neutral-700`. Never `neutral-400/500/600` for text.
- **Semantic color only:** `rescued`=success/open, `urgent`=claimed/urgent, `failed`=fail, `transit`=in-transit, `clay`=links/arrows (not status).
- **Test runner:** `npm test` runs `node --require ./lib/stub-server-only.cjs --import tsx --test lib/*.test.ts lib/analytics/*.test.ts`. Test files must live at `lib/*.test.ts`. Single file: `node --require ./lib/stub-server-only.cjs --import tsx --test lib/<name>.test.ts`.
- **Typecheck:** `npx tsc --noEmit` must stay clean. **Lint:** `npx next lint`.
- **Master admin is not self-registerable** — `registerUser` only accepts `volunteer | restaurant | drop_off`; do not change that.
- **Every admin mutation** stays demo-blocked (`blockIfDemo`) and writes to `AdminEvent`.
- **Target account for promotion:** `duoduobianpc@gmail.com`.

---

### Task 1: Introduce the `super_admin` role (enum, migration, `Record<Role>` maps)

Mechanical role introduction that keeps the build green. Grants no behavior yet — later tasks wire capability. This must come first because regenerating the Prisma client makes the `Role` type include `super_admin`, which makes every `Record<Role, …>` map a TS error until a key is added.

**Files:**
- Modify: `prisma/schema.prisma` (the `enum Role` block, ~line 16-25)
- Create: `prisma/migrations/20260717120000_add_super_admin_role/migration.sql`
- Modify: `components/NavBar.tsx:45` (`NAV_BY_ROLE`)
- Modify: `components/ChatPanel.tsx:17` (`ROLE_LABEL`)
- Modify: `components/SignupForm.tsx:26,33` (`ROLE_LABEL`, `NOTIF_COPY`)
- Modify: `components/welcome/slides.tsx:71` (`SLIDES_BY_ROLE`)

**Interfaces:**
- Produces: `Role` now includes the string literal `"super_admin"` (usable in all later tasks).

- [ ] **Step 1: Add the enum value to the schema**

In `prisma/schema.prisma`, add `super_admin` to the `Role` enum (after `org_admin`):

```prisma
enum Role {
  volunteer
  restaurant
  drop_off
  org_admin
  // Global, cross-org master admin. Not self-registerable (sign-up offers only
  // the three public roles); granted by role change or the promote script.
  super_admin
}
```

- [ ] **Step 2: Create the migration file**

Create `prisma/migrations/20260717120000_add_super_admin_role/migration.sql`:

```sql
-- Add the super_admin role. Standalone ADD VALUE (not used in this migration),
-- safe under Postgres 12+ (Supabase is 15).
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'super_admin';
```

- [ ] **Step 3: Regenerate the Prisma client**

Run: `npx prisma generate`
Expected: "Generated Prisma Client" — `Role` type now includes `super_admin`.

- [ ] **Step 4: Verify tsc now fails on the Record<Role> maps**

Run: `npx tsc --noEmit`
Expected: FAIL — errors like `Property 'super_admin' is missing in type` on `NAV_BY_ROLE`, `ROLE_LABEL`, `NOTIF_COPY`, `SLIDES_BY_ROLE`.

- [ ] **Step 5: Add `super_admin` to `NAV_BY_ROLE`**

In `components/NavBar.tsx`, add a `super_admin` key mirroring `org_admin`'s items:

```ts
  org_admin: [MEMBERS, ADMIN_UPDATES, IMPACT, ANALYTICS, RELIABILITY, PARTNERS],
  // Master admin uses the same augmented /admin console as org admins.
  super_admin: [MEMBERS, ADMIN_UPDATES, IMPACT, ANALYTICS, RELIABILITY, PARTNERS],
```

- [ ] **Step 6: Add `super_admin` to the other four maps**

In `components/ChatPanel.tsx` `ROLE_LABEL`, add:

```ts
  super_admin: "master admin",
```

In `components/SignupForm.tsx`, add a `super_admin` entry to **both** `ROLE_LABEL` and `NOTIF_COPY` (present for the type only — sign-up never offers it). Match the shape of the existing `org_admin` entries, e.g.:

```ts
// in ROLE_LABEL:
  super_admin: "master admin",
// in NOTIF_COPY: (copy the org_admin entry's shape verbatim)
  super_admin: { email: "<same as org_admin>", sms: "<same as org_admin>" },
```

In `components/welcome/slides.tsx` `SLIDES_BY_ROLE`, add:

```ts
  super_admin: SLIDES_BY_ROLE_ORG_ADMIN_DECK, // reuse the org_admin deck value
```

(Use whatever variable/array the `org_admin` key already points to — reuse the same value, don't duplicate the deck.)

- [ ] **Step 7: Verify the build is green again**

Run: `npx tsc --noEmit`
Expected: PASS (no output).
Run: `npx prisma validate`
Expected: "The schema is valid".

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations components/NavBar.tsx components/ChatPanel.tsx components/SignupForm.tsx components/welcome/slides.tsx
git commit -m "feat: add super_admin role enum + Record<Role> map entries"
```

---

### Task 2: `lib/roles.ts` — role predicates (TDD)

Pure helpers that centralize "who counts as an admin" so later tasks and the guard layer don't scatter string comparisons.

**Files:**
- Create: `lib/roles.ts`
- Test: `lib/roles.test.ts`

**Interfaces:**
- Produces:
  - `isSuperAdmin(role: Role | null | undefined): boolean`
  - `isAdmin(role: Role | null | undefined): boolean` (`org_admin || super_admin`)
  - `roleAllowed(role: Role | null | undefined, allowed: Role[]): boolean` (`isSuperAdmin(role) || allowed.includes(role)`)

- [ ] **Step 1: Write the failing test**

Create `lib/roles.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { isSuperAdmin, isAdmin, roleAllowed } from "./roles";

test("isSuperAdmin only true for super_admin", () => {
  assert.equal(isSuperAdmin("super_admin"), true);
  assert.equal(isSuperAdmin("org_admin"), false);
  assert.equal(isSuperAdmin("volunteer"), false);
  assert.equal(isSuperAdmin(null), false);
  assert.equal(isSuperAdmin(undefined), false);
});

test("isAdmin true for org_admin and super_admin only", () => {
  assert.equal(isAdmin("org_admin"), true);
  assert.equal(isAdmin("super_admin"), true);
  assert.equal(isAdmin("volunteer"), false);
  assert.equal(isAdmin("restaurant"), false);
  assert.equal(isAdmin(null), false);
});

test("roleAllowed lets super_admin pass any gate, others only when listed", () => {
  assert.equal(roleAllowed("super_admin", ["volunteer"]), true);
  assert.equal(roleAllowed("org_admin", ["org_admin"]), true);
  assert.equal(roleAllowed("volunteer", ["org_admin"]), false);
  assert.equal(roleAllowed(null, ["volunteer"]), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --require ./lib/stub-server-only.cjs --import tsx --test lib/roles.test.ts`
Expected: FAIL — cannot find module `./roles`.

- [ ] **Step 3: Write the implementation**

Create `lib/roles.ts`:

```ts
import type { Role } from "@prisma/client";

// Central role predicates. `super_admin` is the global master admin; `org_admin`
// is scoped to its own organization. Keeping these in one place lets the guard
// layer grant super_admin blanket access without editing every call site.

export function isSuperAdmin(role: Role | null | undefined): boolean {
  return role === "super_admin";
}

export function isAdmin(role: Role | null | undefined): boolean {
  return role === "org_admin" || role === "super_admin";
}

// True when `role` may pass a gate that lists `allowed` roles. A super admin
// passes every gate; everyone else must be explicitly listed.
export function roleAllowed(
  role: Role | null | undefined,
  allowed: Role[]
): boolean {
  if (!role) return false;
  return isSuperAdmin(role) || allowed.includes(role);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --require ./lib/stub-server-only.cjs --import tsx --test lib/roles.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/roles.ts lib/roles.test.ts
git commit -m "feat: add role predicates (isAdmin/isSuperAdmin/roleAllowed)"
```

---

### Task 3: Guard override — `requireRole`, middleware, `ROLE_HOME`

Make `super_admin` pass every page/route gate (still requires being signed in), and give it a home.

**Files:**
- Modify: `lib/authz.ts` (`requireRole`)
- Modify: `auth.config.ts` (`ROLE_HOME`, `authorized` callback)

**Interfaces:**
- Consumes: `roleAllowed`, `isSuperAdmin` from `lib/roles.ts`.
- Produces: `requireRole(...roles)` returns for a `super_admin` regardless of `roles`; middleware allows any route for `super_admin`.

- [ ] **Step 1: Update `requireRole` to use `roleAllowed`**

In `lib/authz.ts`, change the import and the role check:

```ts
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { auth } from "@/auth";
import { ROLE_HOME } from "@/auth.config";
import { roleAllowed } from "@/lib/roles";
```

```ts
export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const user = await requireUser();
  // A super admin passes every gate; everyone else must be listed.
  if (!roleAllowed(user.role, roles)) redirect(ROLE_HOME[user.role]);
  return user;
}
```

- [ ] **Step 2: Add `ROLE_HOME[super_admin]` and the middleware override**

In `auth.config.ts`, add the home entry:

```ts
export const ROLE_HOME: Record<Role, string> = {
  volunteer: "/",
  restaurant: "/restaurant",
  drop_off: "/dropoff",
  org_admin: "/",
  super_admin: "/admin/analytics",
};
```

In the `authorized` callback, after the `isAuthPage` redirect and before the `ACCESS` rule lookup, add the global bypass:

```ts
      if (isAuthPage) {
        return Response.redirect(new URL(ROLE_HOME[user.role], nextUrl));
      }

      // Master admin monitors globally — reachable on every route (still must be
      // signed in, handled above).
      if (user.role === "super_admin") return true;

      const rule = ACCESS.find((r) => matches(path, r.prefix));
```

- [ ] **Step 3: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Run the full test suite (nothing regressed)**

Run: `npm test`
Expected: PASS (existing count + 3 new from Task 2).

- [ ] **Step 5: Commit**

```bash
git add lib/authz.ts auth.config.ts
git commit -m "feat: grant super_admin blanket route/page access via guard override"
```

---

### Task 4: `rosterWhere` global mode (TDD)

Let the members roster include every org's managed roles for a super admin, while org admins stay scoped to their own org.

**Files:**
- Modify: `lib/orgRoster.ts` (`rosterWhere`)
- Modify: `lib/orgRoster.test.ts`

**Interfaces:**
- Produces: `rosterWhere(adminOrgId: string | null, demo: boolean, opts?: { global?: boolean }): Prisma.UserWhereInput` — when `opts.global` is true, managed roles are included with no org filter.

- [ ] **Step 1: Write the failing test**

Add to `lib/orgRoster.test.ts`:

```ts
test("rosterWhere global mode includes managed roles across all orgs", () => {
  const w: any = rosterWhere(null, false, { global: true });
  // Two OR branches: partners (always) + managed roles with no org filter.
  const managed = w.OR.find(
    (b: any) => Array.isArray(b.role?.in) && b.role.in.includes("org_admin")
  );
  assert.ok(managed, "managed-role branch present in global mode");
  assert.equal(managed.organizationId, undefined, "no org filter in global mode");
});

test("rosterWhere non-global still scopes managed roles to the org", () => {
  const w: any = rosterWhere("org_x", false);
  const managed = w.OR.find(
    (b: any) => Array.isArray(b.role?.in) && b.role.in.includes("org_admin")
  );
  assert.equal(managed.organizationId, "org_x");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --require ./lib/stub-server-only.cjs --import tsx --test lib/orgRoster.test.ts`
Expected: FAIL — `rosterWhere` takes 2 args / global branch missing.

- [ ] **Step 3: Implement the global mode**

In `lib/orgRoster.ts`, include `super_admin` in managed roles and add the `global` option:

```ts
const PARTNER_ROLES = ["restaurant", "drop_off"] as const;
const MANAGED_ROLES = ["volunteer", "org_admin", "super_admin"] as const;
```

```ts
export function rosterWhere(
  adminOrgId: string | null,
  demo: boolean,
  opts?: { global?: boolean }
): Prisma.UserWhereInput {
  const OR: Prisma.UserWhereInput[] = [{ role: { in: [...PARTNER_ROLES] } }];
  if (opts?.global) {
    // Master admin: every org's managed roles, no org filter.
    OR.push({ role: { in: [...MANAGED_ROLES] } });
  } else if (adminOrgId) {
    OR.push({ role: { in: [...MANAGED_ROLES] }, organizationId: adminOrgId });
  }
  return { status: "active", demo, OR };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --require ./lib/stub-server-only.cjs --import tsx --test lib/orgRoster.test.ts`
Expected: PASS (existing + 2 new).

- [ ] **Step 5: Commit**

```bash
git add lib/orgRoster.ts lib/orgRoster.test.ts
git commit -m "feat: rosterWhere global mode for super_admin roster"
```

---

### Task 5: Account-admin guard helpers (TDD) — `roleChangeError` + `deleteAccountError`

Move the branching authorization logic for role changes and deletions into pure, fully-tested functions. `setRole`/`deleteAccount` will call these in the next task.

**Files:**
- Create: `lib/accountAdmin.ts`
- Test: `lib/accountAdmin.test.ts`

**Interfaces:**
- Consumes: `isAdmin`, `isSuperAdmin` (roles), `assertSameOrg` (orgRoster).
- Produces:
  - `roleChangeError(i: RoleChangeInput): string | null`
  - `deleteAccountError(i: DeleteAccountInput): string | null`
  - types `RoleChangeInput`, `DeleteAccountInput` (see Step 3).

- [ ] **Step 1: Write the failing test**

Create `lib/accountAdmin.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { roleChangeError, deleteAccountError } from "./accountAdmin";

const base = {
  actorId: "actor",
  actorOrgId: "orgA",
  orgAdminCount: 3,
  superAdminCount: 2,
};

test("org admin cannot change roles across orgs", () => {
  const err = roleChangeError({
    ...base,
    actorRole: "org_admin",
    target: { id: "t", role: "volunteer", organizationId: "orgB" },
    newRole: "org_admin",
  });
  assert.match(err ?? "", /your own organization/);
});

test("super admin may promote a volunteer in another org", () => {
  const err = roleChangeError({
    ...base,
    actorRole: "super_admin",
    target: { id: "t", role: "volunteer", organizationId: "orgB" },
    newRole: "org_admin",
  });
  assert.equal(err, null);
});

test("org admin cannot grant super_admin", () => {
  const err = roleChangeError({
    ...base,
    actorRole: "org_admin",
    target: { id: "t", role: "volunteer", organizationId: "orgA" },
    newRole: "super_admin",
  });
  assert.match(err ?? "", /Invalid role/);
});

test("super admin may grant super_admin", () => {
  const err = roleChangeError({
    ...base,
    actorRole: "super_admin",
    target: { id: "t", role: "org_admin", organizationId: "orgB" },
    newRole: "super_admin",
  });
  assert.equal(err, null);
});

test("org admin cannot modify a super_admin target", () => {
  const err = roleChangeError({
    ...base,
    actorRole: "org_admin",
    target: { id: "t", role: "super_admin", organizationId: "orgA" },
    newRole: "org_admin",
  });
  assert.match(err ?? "", /master admin/);
});

test("cannot demote the last super admin", () => {
  const err = roleChangeError({
    ...base,
    superAdminCount: 1,
    actorRole: "super_admin",
    target: { id: "t", role: "super_admin", organizationId: "orgA" },
    newRole: "org_admin",
  });
  assert.match(err ?? "", /last master admin/);
});

test("super admin cannot strip their own master-admin access", () => {
  const err = roleChangeError({
    ...base,
    actorRole: "super_admin",
    target: { id: "actor", role: "super_admin", organizationId: "orgA" },
    newRole: "org_admin",
  });
  assert.match(err ?? "", /your own master-admin/);
});

test("partner roles are not changeable here", () => {
  const err = roleChangeError({
    ...base,
    actorRole: "super_admin",
    target: { id: "t", role: "restaurant", organizationId: null },
    newRole: "volunteer",
  });
  assert.match(err ?? "", /managed at sign-up/);
});

test("last org admin cannot be demoted", () => {
  const err = roleChangeError({
    ...base,
    orgAdminCount: 1,
    actorRole: "org_admin",
    target: { id: "t", role: "org_admin", organizationId: "orgA" },
    newRole: "volunteer",
  });
  assert.match(err ?? "", /last org admin/);
});

test("deleteAccountError: super admin deletes across orgs, org admin cannot", () => {
  assert.equal(
    deleteAccountError({
      ...base,
      actorRole: "super_admin",
      target: { id: "t", role: "volunteer", status: "active", organizationId: "orgB" },
    }),
    null
  );
  assert.match(
    deleteAccountError({
      ...base,
      actorRole: "org_admin",
      target: { id: "t", role: "volunteer", status: "active", organizationId: "orgB" },
    }) ?? "",
    /your own organization/
  );
});

test("deleteAccountError: cannot delete self, last super admin, or a super admin as org admin", () => {
  assert.match(
    deleteAccountError({
      ...base,
      actorRole: "super_admin",
      target: { id: "actor", role: "super_admin", status: "active", organizationId: "orgA" },
    }) ?? "",
    /your own account/
  );
  assert.match(
    deleteAccountError({
      ...base,
      superAdminCount: 1,
      actorRole: "super_admin",
      target: { id: "t", role: "super_admin", status: "active", organizationId: "orgA" },
    }) ?? "",
    /last master admin/
  );
  assert.match(
    deleteAccountError({
      ...base,
      actorRole: "org_admin",
      target: { id: "t", role: "super_admin", status: "active", organizationId: "orgA" },
    }) ?? "",
    /master admin/
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --require ./lib/stub-server-only.cjs --import tsx --test lib/accountAdmin.test.ts`
Expected: FAIL — cannot find module `./accountAdmin`.

- [ ] **Step 3: Implement the guards**

Create `lib/accountAdmin.ts`:

```ts
import type { Role } from "@prisma/client";
import { isAdmin, isSuperAdmin } from "./roles";
import { assertSameOrg } from "./orgRoster";

type TargetLite = {
  id: string;
  role: Role;
  organizationId: string | null;
};

export type RoleChangeInput = {
  actorRole: Role;
  actorId: string;
  actorOrgId: string | null;
  target: TargetLite;
  newRole: Role;
  orgAdminCount: number; // active org_admins in the target's org
  superAdminCount: number; // total super_admins system-wide
};

export type DeleteAccountInput = {
  actorRole: Role;
  actorId: string;
  actorOrgId: string | null;
  target: TargetLite & { status: string };
  orgAdminCount: number;
  superAdminCount: number;
};

const MANAGED: Role[] = ["volunteer", "org_admin", "super_admin"];

// Returns an error string if the role change is disallowed, else null.
export function roleChangeError(i: RoleChangeInput): string | null {
  if (!isAdmin(i.actorRole)) return "Only org admins can change roles.";

  // Allowed target roles: org admins may set volunteer/org_admin; only a super
  // admin may set super_admin.
  const allowedTargets: Role[] = isSuperAdmin(i.actorRole)
    ? ["volunteer", "org_admin", "super_admin"]
    : ["volunteer", "org_admin"];
  if (!allowedTargets.includes(i.newRole)) return "Invalid role.";

  if (i.target.role === "restaurant" || i.target.role === "drop_off") {
    return "Partner accounts are managed at sign-up.";
  }

  // Only a super admin may touch a super_admin target.
  if (i.target.role === "super_admin" && !isSuperAdmin(i.actorRole)) {
    return "Only a master admin can change a master admin.";
  }

  // Cross-org: non-super actors act only within their own org.
  if (
    !isSuperAdmin(i.actorRole) &&
    !assertSameOrg(i.actorOrgId, i.target.organizationId)
  ) {
    return "You can only manage members in your own organization.";
  }

  if (i.target.role === i.newRole) return null; // no-op

  // Self lockout: don't let a super admin strip their own master-admin access.
  if (
    i.target.id === i.actorId &&
    isSuperAdmin(i.target.role) &&
    i.newRole !== "super_admin"
  ) {
    return "You can't remove your own master-admin access.";
  }

  // Last-admin guards.
  if (
    i.target.role === "org_admin" &&
    i.newRole !== "org_admin" &&
    i.orgAdminCount <= 1
  ) {
    return "Can't remove the last org admin.";
  }
  if (
    i.target.role === "super_admin" &&
    i.newRole !== "super_admin" &&
    i.superAdminCount <= 1
  ) {
    return "Can't remove the last master admin.";
  }

  return null;
}

// Returns an error string if the deletion is disallowed, else null. A "deleted"
// target returns null (idempotent no-op).
export function deleteAccountError(i: DeleteAccountInput): string | null {
  if (!isAdmin(i.actorRole)) return "Only org admins can delete accounts.";
  if (i.target.id === i.actorId) return "You can't delete your own account.";
  if (i.target.status === "deleted") return null;
  if (i.target.status === "pending") {
    return "Pending accounts are handled with Decline.";
  }

  // Only a super admin may delete a super_admin.
  if (i.target.role === "super_admin" && !isSuperAdmin(i.actorRole)) {
    return "Only a master admin can remove a master admin.";
  }

  // Cross-org guard for managed roles (partners are global).
  if (
    MANAGED.includes(i.target.role) &&
    !isSuperAdmin(i.actorRole) &&
    !assertSameOrg(i.actorOrgId, i.target.organizationId)
  ) {
    return "You can only manage members in your own organization.";
  }

  if (i.target.role === "org_admin" && i.orgAdminCount <= 1) {
    return "Can't remove the last org admin.";
  }
  if (i.target.role === "super_admin" && i.superAdminCount <= 1) {
    return "Can't remove the last master admin.";
  }

  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --require ./lib/stub-server-only.cjs --import tsx --test lib/accountAdmin.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add lib/accountAdmin.ts lib/accountAdmin.test.ts
git commit -m "feat: pure account-admin guard helpers for cross-org role change + delete"
```

---

### Task 6: Wire `setRole`, `deleteAccount`, `approveAccount`, `declineAccount` to the guards

Replace the inline org-admin-only checks in the server actions with the new helpers, so super admins act globally and the new guards apply.

**Files:**
- Modify: `app/actions.ts` (`setRole` ~1536, `deleteAccount` ~1717, `approveAccount` ~1616, `declineAccount` ~1691)

**Interfaces:**
- Consumes: `roleChangeError`, `deleteAccountError` (accountAdmin); `isAdmin` (roles).

- [ ] **Step 1: Import the helpers**

Near the top of `app/actions.ts`, add:

```ts
import { isAdmin } from "@/lib/roles";
import { roleChangeError, deleteAccountError } from "@/lib/accountAdmin";
```

- [ ] **Step 2: Rewrite `setRole`**

Replace the body of `setRole` (from the auth check through the DB update) with:

```ts
export async function setRole(
  userId: string,
  role: ManagedRole | "super_admin"
): Promise<SignUpResult> {
  const session = await auth();
  const actorRole = session?.user?.role;
  if (!isAdmin(actorRole)) {
    return { ok: false, error: "Only org admins can change roles." };
  }
  const demoRole = await blockIfDemo();
  if (demoRole) return demoRole;

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return { ok: false, error: "User not found." };

  const actor = await prisma.user.findUnique({
    where: { id: session!.user!.id },
    select: { organizationId: true },
  });

  // Counts for the last-admin guards.
  const [orgAdminCount, superAdminCount] = await Promise.all([
    prisma.user.count({
      where: { role: "org_admin", organizationId: target.organizationId },
    }),
    prisma.user.count({ where: { role: "super_admin" } }),
  ]);

  const error = roleChangeError({
    actorRole: actorRole!,
    actorId: session!.user!.id,
    actorOrgId: actor?.organizationId ?? null,
    target: {
      id: target.id,
      role: target.role,
      organizationId: target.organizationId,
    },
    newRole: role,
    orgAdminCount,
    superAdminCount,
  });
  if (error) return { ok: false, error };
  if (target.role === role) return { ok: true };

  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { role } }),
    prisma.adminEvent.create({
      data: {
        type: "role_changed",
        actorId: session!.user!.id,
        targetId: userId,
        meta: { from: target.role, to: role },
      },
    }),
  ]);
  revalidatePath("/admin/users");
  return { ok: true };
}
```

- [ ] **Step 3: Rewrite `deleteAccount`'s guard section**

In `deleteAccount`, replace the auth check + self-delete check + cross-org guard + last-admin guard with a single call. Keep the existing soft-delete transaction and revalidation below it:

```ts
export async function deleteAccount(userId: string): Promise<SignUpResult> {
  const session = await auth();
  const actorRole = session?.user?.role;
  if (!isAdmin(actorRole)) {
    return { ok: false, error: "Only org admins can delete accounts." };
  }
  const demoDelete = await blockIfDemo();
  if (demoDelete) return demoDelete;

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return { ok: false, error: "Account not found." };

  const actor = await prisma.user.findUnique({
    where: { id: session!.user!.id },
    select: { organizationId: true },
  });
  const [orgAdminCount, superAdminCount] = await Promise.all([
    prisma.user.count({
      where: { role: "org_admin", organizationId: target.organizationId },
    }),
    prisma.user.count({ where: { role: "super_admin" } }),
  ]);

  const error = deleteAccountError({
    actorRole: actorRole!,
    actorId: session!.user!.id,
    actorOrgId: actor?.organizationId ?? null,
    target: {
      id: target.id,
      role: target.role,
      status: target.status,
      organizationId: target.organizationId,
    },
    orgAdminCount,
    superAdminCount,
  });
  if (error) return { ok: false, error };
  if (target.status === "deleted") return { ok: true };

  // ...keep the existing soft-delete transaction + revalidatePath calls...
}
```

Preserve the remaining body of the original `deleteAccount` (the `$transaction` that sets `status: "deleted"` and writes the `AdminEvent`, plus `revalidatePath`) exactly as-is.

- [ ] **Step 4: Widen `approveAccount` and `declineAccount` role checks**

In `approveAccount`, replace:

```ts
  if (session?.user?.role !== "org_admin") {
    return { ok: false, error: "Only org admins can approve accounts." };
  }
```

with:

```ts
  if (!isAdmin(session?.user?.role)) {
    return { ok: false, error: "Only org admins can approve accounts." };
  }
```

Do the same in `declineAccount` (message: "Only org admins can decline accounts.").

- [ ] **Step 5: Verify typecheck + full suite**

Run: `npx tsc --noEmit`
Expected: PASS.
Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/actions.ts
git commit -m "feat: super_admin can change roles + delete accounts across orgs"
```

---

### Task 7: Widen page-level oversight checks to `isAdmin`

So a super admin behaves like an admin (not a claiming/posting role) on the shared pages, and gets the chapter-wide drop-off view.

**Files:**
- Modify: `lib/dropoffConsole.ts`
- Modify: `app/(feed)/page.tsx`
- Modify: `app/restaurant/page.tsx`
- Modify: `app/restaurant/listings/page.tsx`
- Modify: `app/map/page.tsx`
- Modify: `app/listings/[id]/page.tsx`

**Interfaces:**
- Consumes: `isAdmin` from `lib/roles.ts`.

- [ ] **Step 1: `lib/dropoffConsole.ts` — treat super admin as admin**

Add `import { isAdmin } from "@/lib/roles";` and change:

```ts
  const isOrgAdmin = isAdmin(role);
```

(The variable name stays `isOrgAdmin` to avoid churn; it now means "admin-level viewer". The tab pages already redirect `isOrgAdmin` to `/admin/analytics`, so a super admin visiting `/dropoff` lands on analytics like an org admin.)

- [ ] **Step 2: Feed + restaurant pages — redirect admins to analytics**

In `app/(feed)/page.tsx`, add `import { isAdmin } from "@/lib/roles";` and change:

```ts
  if (isAdmin(session?.user?.role)) redirect("/admin/analytics");
```

Do the same replacement (`session?.user?.role === "org_admin"` → `isAdmin(session?.user?.role)`) in `app/restaurant/page.tsx` and `app/restaurant/listings/page.tsx`, each adding the `isAdmin` import.

- [ ] **Step 3: `canClaim` spots — a super admin can't claim either**

In `app/map/page.tsx` and `app/listings/[id]/page.tsx`, add `import { isAdmin } from "@/lib/roles";` and change the `canClaim` computation from `role !== "org_admin"` to:

```ts
  const canClaim = !isAdmin(session?.user?.role); // map/page.tsx
```

```ts
  const canClaim = !isAdmin(viewer.role); // listings/[id]/page.tsx (viewer from requireUser)
```

- [ ] **Step 4: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/dropoffConsole.ts "app/(feed)/page.tsx" app/restaurant/page.tsx app/restaurant/listings/page.tsx app/map/page.tsx "app/listings/[id]/page.tsx"
git commit -m "feat: treat super_admin as admin on shared oversight pages"
```

---

### Task 8: Global roster UI on `/admin/users`

For a super admin, show every org (+ partners), an org filter, an email search, and an org column.

**Files:**
- Modify: `app/admin/users/page.tsx`
- Create: `components/GlobalRosterControls.tsx`

**Interfaces:**
- Consumes: `isSuperAdmin` (roles), `rosterWhere(..., { global })` (orgRoster).
- Produces: page reads `?org=<id>` and `?q=<email>` search params for super admins.

- [ ] **Step 1: Create the controls component**

Create `components/GlobalRosterControls.tsx`:

```tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";

// Master-admin-only roster controls: filter the global roster by organization
// and search by email. Both push URL search params so the server re-queries.
export function GlobalRosterControls({
  orgs,
}: {
  orgs: { id: string; name: string }[];
}) {
  const router = useRouter();
  const params = useSearchParams();

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(`/admin/users?${next.toString()}`);
  }

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 text-sm text-neutral-700">
        <span className="font-mono text-[13px]">org</span>
        <select
          value={params.get("org") ?? ""}
          onChange={(e) => setParam("org", e.target.value)}
          className="rounded-full border-2 border-neutral-200 bg-card px-4 py-1.5 text-sm text-neutral-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400"
        >
          <option value="">All orgs</option>
          {orgs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </label>
      <input
        type="search"
        defaultValue={params.get("q") ?? ""}
        onChange={(e) => setParam("q", e.target.value.trim())}
        placeholder="Search by email"
        aria-label="Search members by email"
        className="min-w-[220px] flex-1 rounded-full border-2 border-neutral-200 bg-card px-4 py-1.5 text-sm text-neutral-900 placeholder:text-neutral-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400"
      />
    </div>
  );
}
```

- [ ] **Step 2: Make the page global for a super admin**

In `app/admin/users/page.tsx`:

1. Add imports:

```ts
import { isSuperAdmin } from "@/lib/roles";
import { GlobalRosterControls } from "@/components/GlobalRosterControls";
```

2. Accept search params and detect super admin. Change the function signature to read them:

```ts
export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; q?: string }>;
}) {
  const actorUser = await requireRole("org_admin", "super_admin");
  const session = await auth();
  const demo = await isDemo();
  const superAdmin = isSuperAdmin(actorUser.role);
  const { org: orgFilter, q } = await searchParams;
```

3. Build the roster `where`. For a super admin use global mode plus optional org/email filters; otherwise keep the org-scoped path:

```ts
  const actor = session?.user?.id
    ? await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { organizationId: true },
      })
    : null;
  const adminOrgId = actor?.organizationId ?? null;

  const rosterBase = superAdmin
    ? rosterWhere(null, demo, { global: true })
    : rosterWhere(adminOrgId, demo);

  // Super-admin-only filters, ANDed onto the base roster.
  const filters: Prisma.UserWhereInput[] = [];
  if (superAdmin && orgFilter) filters.push({ organizationId: orgFilter });
  if (superAdmin && q) {
    filters.push({ email: { contains: q, mode: "insensitive" } });
  }
  const rosterFilter: Prisma.UserWhereInput =
    filters.length > 0 ? { AND: [rosterBase, ...filters] } : rosterBase;
```

Then use `rosterFilter` as the `where` for the active-members `findMany`, and add `organization: { select: { name: true } }` to its `select` so the org column can render.

4. Fetch the org list for the filter dropdown (super admin only):

```ts
  const orgs = superAdmin
    ? await prisma.organization.findMany({
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : [];
```

- [ ] **Step 3: Render the controls + org column**

Below the page `<header>`, render the controls for a super admin:

```tsx
      {superAdmin && <GlobalRosterControls orgs={orgs} />}
```

In the members table, when `superAdmin` is true, show each managed member's org name (from the `organization` relation you added to the select) as a `font-mono text-[13px] text-neutral-700` cell/label. Match the existing row markup; add one column/line, e.g.:

```tsx
      {superAdmin && (
        <span className="font-mono text-[13px] text-neutral-700">
          {u.organization?.name ?? "—"}
        </span>
      )}
```

Update the `RosterUser` type (used for the `users` cast) to include `organization: { name: string } | null`.

- [ ] **Step 4: Verify typecheck + lint**

Run: `npx tsc --noEmit`
Expected: PASS.
Run: `npx next lint --file app/admin/users/page.tsx --file components/GlobalRosterControls.tsx`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app/admin/users/page.tsx components/GlobalRosterControls.tsx
git commit -m "feat: global roster with org filter + email search for super_admin"
```

---

### Task 9: Analytics org switcher + org-scoped reliability

Let a super admin pick an org and see that org's volunteer-centric stats; global food metrics stay global.

**Files:**
- Modify: `lib/stats.ts` (`getVolunteerReliability` gains optional `organizationId`)
- Modify: `lib/stats.test.ts` (if reliability is covered there; otherwise add a focused test)
- Modify: `app/admin/analytics/page.tsx`
- Create: `components/OrgStatsSwitcher.tsx`

**Interfaces:**
- Consumes: `isSuperAdmin` (roles).
- Produces: `getVolunteerReliability(demo: boolean, organizationId?: string): Promise<Volunteer[]>`.

- [ ] **Step 1: Write the failing test for org-scoped reliability**

Add to `lib/stats.test.ts` a test that asserts the `user.findMany` filter includes the org when provided. If `getVolunteerReliability` uses the module `prisma` directly (not injectable), instead add a small pure helper `reliabilityUserWhere(ids: string[], organizationId?: string)` and test that:

```ts
import { reliabilityUserWhere } from "./stats";

test("reliabilityUserWhere scopes to org when provided", () => {
  assert.deepEqual(reliabilityUserWhere(["a", "b"], "org_x"), {
    id: { in: ["a", "b"] },
    organizationId: "org_x",
  });
  assert.deepEqual(reliabilityUserWhere(["a"]), { id: { in: ["a"] } });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --require ./lib/stub-server-only.cjs --import tsx --test lib/stats.test.ts`
Expected: FAIL — `reliabilityUserWhere` not exported.

- [ ] **Step 3: Implement the helper and thread `organizationId`**

In `lib/stats.ts`, add the helper and use it:

```ts
export function reliabilityUserWhere(
  ids: string[],
  organizationId?: string
): Prisma.UserWhereInput {
  return organizationId
    ? { id: { in: ids }, organizationId }
    : { id: { in: ids } };
}
```

Change the signature and the `findMany`:

```ts
export async function getVolunteerReliability(
  demo: boolean,
  organizationId?: string
): Promise<Volunteer[]> {
  // ...unchanged groupBy + tally...
  const users = await prisma.user.findMany({
    where: reliabilityUserWhere(ids, organizationId),
    select: { id: true, name: true },
  });
  // ...unchanged mapping...
}
```

(Import `Prisma` from `@prisma/client` at the top of `lib/stats.ts` if not already imported.)

- [ ] **Step 4: Run test to verify it passes**

Run: `node --require ./lib/stub-server-only.cjs --import tsx --test lib/stats.test.ts`
Expected: PASS.

- [ ] **Step 5: Create the org switcher**

Create `components/OrgStatsSwitcher.tsx`:

```tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";

// Master-admin-only: scope the org-partitioned analytics sections to one org.
// Global food metrics are unaffected. Carries `?org=` alongside `?days=`.
export function OrgStatsSwitcher({
  orgs,
}: {
  orgs: { id: string; name: string }[];
}) {
  const router = useRouter();
  const params = useSearchParams();

  function setOrg(value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set("org", value);
    else next.delete("org");
    router.push(`/admin/analytics?${next.toString()}`);
  }

  return (
    <label className="mb-6 flex items-center gap-2 text-sm text-neutral-700">
      <span className="font-mono text-[13px]">org</span>
      <select
        value={params.get("org") ?? ""}
        onChange={(e) => setOrg(e.target.value)}
        className="rounded-full border-2 border-neutral-200 bg-card px-4 py-1.5 text-sm text-neutral-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400"
      >
        <option value="">All orgs</option>
        {orgs.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
}
```

- [ ] **Step 6: Wire the switcher into analytics**

In `app/admin/analytics/page.tsx`:

1. Add imports: `import { isSuperAdmin } from "@/lib/roles";` and `import { OrgStatsSwitcher } from "@/components/OrgStatsSwitcher";`.
2. Read `org` from `searchParams` (the page already awaits `searchParams` for `days`): destructure `const { days, org } = await searchParams;` and update the type to `{ days?: string; org?: string }`.
3. Compute the effective org for the org-scoped sections. For a super admin, use the selected `org` (or none = all orgs); otherwise keep `actor.organization`:

```ts
  const superAdmin = isSuperAdmin(session?.user?.role);
  const orgs = superAdmin
    ? await prisma.organization.findMany({
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : [];
  const selectedOrgId = superAdmin
    ? org ?? null
    : (actor?.organization?.id ?? null);
```

4. Use `selectedOrgId` for the org-scoped section (`getOrgVolunteerImpact(selectedOrgId, …)` only when non-null), and pass it to reliability if/where that page renders it (`getVolunteerReliability(demo, selectedOrgId ?? undefined)`).
5. Render the switcher for a super admin, near the time-window nav:

```tsx
      {superAdmin && <OrgStatsSwitcher orgs={orgs} />}
```

6. When a super admin has an org selected, label the org sections with that org's name; under "All orgs" keep the global copy.

- [ ] **Step 7: Verify typecheck + lint + full suite**

Run: `npx tsc --noEmit` → PASS.
Run: `npx next lint --file app/admin/analytics/page.tsx --file components/OrgStatsSwitcher.tsx` → no errors.
Run: `npm test` → PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/stats.ts lib/stats.test.ts app/admin/analytics/page.tsx components/OrgStatsSwitcher.tsx
git commit -m "feat: analytics org switcher + org-scoped volunteer reliability for super_admin"
```

---

### Task 10: Bootstrap — promote script + dev seed

Give `duoduobianpc@gmail.com` the role, and seed a super admin for local dev.

**Files:**
- Create: `scripts/promote-super-admin.ts`
- Modify: `prisma/seed.ts` (add a super-admin promotion/upsert for local)

**Interfaces:**
- Consumes: nothing new.

- [ ] **Step 1: Write the promote script**

Create `scripts/promote-super-admin.ts`:

```ts
// Idempotently promote an account to super_admin (master admin). Usage:
//   node --env-file=.env --import tsx scripts/promote-super-admin.ts [email]
// Defaults to duoduobianpc@gmail.com. No-op if the account doesn't exist or is
// already super_admin.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2] ?? "duoduobianpc@gmail.com";
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.log(`No account for ${email} — nothing to promote.`);
    return;
  }
  if (user.role === "super_admin") {
    console.log(`${email} is already a master admin.`);
    return;
  }
  await prisma.user.update({
    where: { email },
    data: { role: "super_admin" },
  });
  console.log(`Promoted ${email} to master admin (super_admin).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Add an npm script**

In `package.json` `scripts`, add:

```json
    "db:promote-super-admin": "node --env-file=.env --import tsx scripts/promote-super-admin.ts",
```

- [ ] **Step 3: Seed a local super admin**

In `prisma/seed.ts`, after users are created, upsert a dev master admin (real world, not demo) so local login can exercise the role:

```ts
  await prisma.user.upsert({
    where: { email: "duoduobianpc@gmail.com" },
    update: { role: "super_admin" },
    create: {
      name: "Master admin",
      email: "duoduobianpc@gmail.com",
      role: "super_admin",
      passwordHash, // reuse the seed's existing hash variable
    },
  });
```

(Use the seed file's existing `passwordHash`/organization variables; match the surrounding upsert style.)

- [ ] **Step 4: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/promote-super-admin.ts package.json prisma/seed.ts
git commit -m "feat: promote-super-admin script + dev seed for master admin"
```

---

### Task 11: End-to-end verification

Prove the role works against the running app (guards, roster, delete, stats).

**Files:** none (verification only).

- [ ] **Step 1: Apply the migration + promote**

Run: `npx prisma migrate dev` (applies `add_super_admin_role`).
Run: `npm run db:promote-super-admin` (or re-seed with `npm run db:seed`).
Expected: "Promoted duoduobianpc@gmail.com…" or "already a master admin".

- [ ] **Step 2: Full suite + typecheck + lint**

Run: `npm test` → PASS.
Run: `npx tsc --noEmit` → PASS.
Run: `npx next lint` → no errors.

- [ ] **Step 3: Drive the app (dev server)**

Start the app, sign in as `duoduobianpc@gmail.com`, and confirm:
- Lands on `/admin/analytics`; the **org switcher** appears and scopes the org sections; "All orgs" shows global metrics.
- `/admin/users` shows **all orgs + partners**, with the org filter + email search working and an org column.
- Can promote a volunteer in another org to `org_admin` and back; can grant/revoke `super_admin`; cannot demote the last super admin or strip own access (error surfaces).
- Can soft-delete an account in another org; cannot delete self.
- Signed in as a normal `org_admin`, none of the above cross-org actions are possible (still scoped to own org), confirming the guards.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "chore: master-admin end-to-end verification fixes"
```

---

## Notes for the implementer

- **Blast radius reminder:** there are ~72 `org_admin` references. Tasks 3 and 7 cover the ones that gate capability/oversight. If `npx tsc` or a manual check surfaces another `role === "org_admin"` that should include super admins (e.g. an oversight-only read), switch it to `isAdmin(role)`; leave persona-specific ones alone.
- **Demo blocking** stays on all mutations — a super admin manages the real world.
- **Never** add `super_admin` to sign-up role options.
