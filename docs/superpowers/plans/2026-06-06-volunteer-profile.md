# Volunteer Personal Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/profile` page where a signed-in volunteer sees their identity, lifetime impact (meals, lbs, pickups, restaurants), and real completion rate — all computed live from existing data and crediting both the primary and buddy seats.

**Architecture:** A new pure data function `getVolunteerImpact(userId, db)` in `lib/stats.ts` derives one volunteer's numbers from the `ListingEvent` log (delivered events, per-seat) and the delivered listings. A server-component page `app/profile/page.tsx` renders it with the existing `MetricCard` and `ReliabilityMeter` components. The nav `Avatar` becomes a link to `/profile`.

**Tech Stack:** Next.js 14 App Router (server components), TypeScript, Prisma/PostgreSQL, Tailwind, NextAuth (`auth()`), `node:test` for unit tests.

---

## File Structure

- `lib/types.ts` — **Modify.** Add the `VolunteerImpact` interface.
- `lib/stats.ts` — **Modify.** Add `getVolunteerImpact(userId, db)`. Reuses the existing `LBS_PER_SERVING` constant.
- `lib/stats.test.ts` — **Create.** Unit tests for `getVolunteerImpact` with an injected fake db.
- `components/Avatar.tsx` — **Modify.** Add an optional `size?: "sm" | "lg"` prop (defaults to `sm`, current behavior) so the profile header can show a larger disc without a className size collision.
- `app/profile/page.tsx` — **Create.** The profile page (server component).
- `components/NavBar.tsx` — **Modify.** Wrap the desktop avatar in a link to `/profile`; add a Profile link to the mobile dropdown.

UI files (`app/profile/page.tsx`, `components/NavBar.tsx`, `components/Avatar.tsx`) have no unit-test harness in this repo (the test glob is `lib/**/*.test.ts`), so they are verified by typecheck (`npx tsc --noEmit`) and a manual browser check, per the codebase's existing convention.

> **Note (dev server):** Do not run `npm run build` while `next dev` is running — it clobbers `.next` and causes 404s on CSS/JS. Use `npx tsc --noEmit` to typecheck during development.

---

### Task 1: `getVolunteerImpact` data function

**Files:**
- Modify: `lib/types.ts` (append the interface)
- Modify: `lib/stats.ts`
- Test: `lib/stats.test.ts` (create)

- [ ] **Step 1: Add the `VolunteerImpact` type**

Append to `lib/types.ts`:

```ts
// One volunteer's lifetime numbers for their profile. Counts (no status hue);
// completionRate is 0–100. Both seats are credited because delivered events are
// written per-seat (primary and buddy).
export interface VolunteerImpact {
  mealsRescued: number;
  lbsSaved: number;
  pickupsCompleted: number;
  restaurantsHelped: number;
  completionRate: number; // 0–100, integer
  attempts: number; // delivered + released + failed
}
```

- [ ] **Step 2: Write the failing test**

Create `lib/stats.test.ts`:

```ts
// Test doubles below stand in for the Prisma client; `any` keeps the fakes
// lightweight (we only implement the handful of methods under test).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { test } from "node:test";
import assert from "node:assert/strict";
import { getVolunteerImpact } from "./stats";

type Ev = { actorId: string; type: string; listingId: string };
type Lst = {
  id: string;
  servings: number;
  weightLbs: number | null;
  restaurantId: string;
};

// Minimal fake Prisma slice: canned event + listing tables, filtered in-memory
// to mirror the `where` clauses the function uses.
function makeDb(events: Ev[], listings: Lst[]) {
  return {
    listingEvent: {
      findMany: async ({ where }: any) => {
        const types: string[] = where.type.in;
        return events.filter(
          (e) => e.actorId === where.actorId && types.includes(e.type)
        );
      },
    },
    foodListing: {
      findMany: async ({ where }: any) => {
        const ids: string[] = where.id.in;
        return listings.filter((l) => ids.includes(l.id));
      },
    },
  } as any;
}

test("aggregates impact, credits a buddy seat, and uses the weight fallback", async () => {
  // u1 delivered L1 (as primary) and L2 (as buddy — same actorId on its own
  // delivered event), and flaked once (released L3). L2 has no weightLbs.
  const events: Ev[] = [
    { actorId: "u1", type: "delivered", listingId: "L1" },
    { actorId: "u1", type: "delivered", listingId: "L2" },
    { actorId: "u1", type: "released", listingId: "L3" },
  ];
  const listings: Lst[] = [
    { id: "L1", servings: 10, weightLbs: 8, restaurantId: "r1" },
    { id: "L2", servings: 5, weightLbs: null, restaurantId: "r1" },
  ];
  const impact = await getVolunteerImpact("u1", makeDb(events, listings));

  assert.equal(impact.mealsRescued, 15);
  assert.equal(impact.lbsSaved, 12); // 8 + round(5 * 0.8 = 4)
  assert.equal(impact.pickupsCompleted, 2);
  assert.equal(impact.restaurantsHelped, 1); // both from r1
  assert.equal(impact.attempts, 3); // 2 delivered + 1 released
  assert.equal(impact.completionRate, 67); // round(2/3 * 100)
});

test("counts distinct restaurants once", async () => {
  const events: Ev[] = [
    { actorId: "u1", type: "delivered", listingId: "L1" },
    { actorId: "u1", type: "delivered", listingId: "L2" },
  ];
  const listings: Lst[] = [
    { id: "L1", servings: 3, weightLbs: null, restaurantId: "r1" },
    { id: "L2", servings: 3, weightLbs: null, restaurantId: "r2" },
  ];
  const impact = await getVolunteerImpact("u1", makeDb(events, listings));
  assert.equal(impact.restaurantsHelped, 2);
  assert.equal(impact.completionRate, 100);
});

test("returns all zeros with no divide-by-zero for a new volunteer", async () => {
  const impact = await getVolunteerImpact("nobody", makeDb([], []));
  assert.deepEqual(impact, {
    mealsRescued: 0,
    lbsSaved: 0,
    pickupsCompleted: 0,
    restaurantsHelped: 0,
    completionRate: 0,
    attempts: 0,
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `getVolunteerImpact` is not exported from `./stats` (import/type error or "not a function").

- [ ] **Step 4: Implement `getVolunteerImpact`**

In `lib/stats.ts`, update the imports at the top:

```ts
import { prisma } from "./prisma";
import type { ImpactStat, Volunteer, VolunteerImpact } from "./types";
```

Then append this function to the end of `lib/stats.ts`:

```ts
// A structural slice of the Prisma client — just the delegates this function
// touches. Lets tests inject a fake db without standing up a database.
type ImpactDb = Pick<typeof prisma, "listingEvent" | "foodListing">;

// One volunteer's lifetime profile numbers, all live from the DB. Impact comes
// from the listings they delivered; completion rate reuses the same event types
// and meaning as getVolunteerReliability (delivered vs released/failed), scoped
// to this user. Both seats are credited: markDeliveredWithPhotoFor writes a
// `delivered` event per seat, so a buddy who helped gets equal credit here.
export async function getVolunteerImpact(
  userId: string,
  db: ImpactDb = prisma
): Promise<VolunteerImpact> {
  const events = await db.listingEvent.findMany({
    where: { actorId: userId, type: { in: ["delivered", "released", "failed"] } },
    select: { type: true, listingId: true },
  });

  const deliveredListingIds: string[] = [];
  let flaked = 0;
  for (const e of events) {
    if (e.type === "delivered") deliveredListingIds.push(e.listingId);
    else flaked++;
  }

  const delivered = deliveredListingIds.length;
  const attempts = delivered + flaked;
  const completionRate =
    attempts > 0 ? Math.round((delivered / attempts) * 100) : 0;

  const listings = deliveredListingIds.length
    ? await db.foodListing.findMany({
        where: { id: { in: deliveredListingIds } },
        select: { servings: true, weightLbs: true, restaurantId: true },
      })
    : [];

  const mealsRescued = listings.reduce((sum, l) => sum + l.servings, 0);
  const lbsSaved = Math.round(
    listings.reduce(
      (sum, l) => sum + (l.weightLbs ?? l.servings * LBS_PER_SERVING),
      0
    )
  );

  return {
    mealsRescued,
    lbsSaved,
    pickupsCompleted: delivered,
    restaurantsHelped: new Set(listings.map((l) => l.restaurantId)).size,
    completionRate,
    attempts,
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test`
Expected: PASS — all three `getVolunteerImpact` tests green (existing tests still pass).

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/stats.ts lib/stats.test.ts
git commit -m "Add getVolunteerImpact for per-volunteer profile stats"
```

---

### Task 2: Avatar `size` prop

**Files:**
- Modify: `components/Avatar.tsx`

- [ ] **Step 1: Add the `size` prop**

Replace the body of `components/Avatar.tsx` (keep the file's leading comment and the `initials` helper) so the component reads:

```tsx
import { cn } from "./cn";

// Brand avatar — a warm clay gradient disc with lowercase display-serif
// initials (identity, not metadata, so display over mono; sentence-case per the
// design rules). Shadowless by default; pass shadow-card where it should lift.
function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toLowerCase() ?? "")
    .join("");
}

const SIZES = {
  sm: "h-8 w-8 text-xs",
  lg: "h-14 w-14 text-base",
} as const;

export function Avatar({
  name = "?",
  size = "sm",
  className,
}: {
  name?: string;
  size?: "sm" | "lg";
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-clay-200 to-clay-400 font-display font-semibold text-clay-800",
        SIZES[size],
        className
      )}
    >
      {initials(name)}
    </span>
  );
}
```

Note: `size` defaults to `"sm"` (`h-8 w-8 text-xs`), exactly the previous fixed classes, so every existing call site (e.g. the nav) is unchanged.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS — no type errors.

- [ ] **Step 3: Commit**

```bash
git add components/Avatar.tsx
git commit -m "Add size prop to Avatar for the profile header"
```

---

### Task 3: `/profile` page

**Files:**
- Create: `app/profile/page.tsx`

- [ ] **Step 1: Create the page**

Create `app/profile/page.tsx`:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Avatar } from "@/components/Avatar";
import { MetricCard } from "@/components/MetricCard";
import { ReliabilityMeter } from "@/components/ReliabilityMeter";
import { getVolunteerImpact } from "@/lib/stats";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, role: true, createdAt: true },
  });
  if (!user) redirect("/login");

  const impact = await getVolunteerImpact(userId);
  const hasActivity = impact.pickupsCompleted > 0 || impact.attempts > 0;
  const joined = new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
  }).format(user.createdAt);

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-8 flex items-center gap-4">
        <Avatar name={user.name} size="lg" className="shadow-card" />
        <div>
          <h1 className="font-display text-[32px] font-medium leading-tight">
            {user.name}
          </h1>
          <p className="mt-0.5 font-mono text-[11px] uppercase tracking-wide text-neutral-600">
            {user.role.replace(/_/g, " ")} · joined {joined}
          </p>
        </div>
      </header>

      <section className="mb-8">
        <h2 className="mb-3 font-mono text-[10px] uppercase tracking-wide text-neutral-600">
          lifetime impact
        </h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <MetricCard
            label="meals rescued"
            value={impact.mealsRescued.toLocaleString()}
          />
          <MetricCard
            label="lbs saved"
            value={impact.lbsSaved.toLocaleString()}
          />
          <MetricCard
            label="pickups completed"
            value={impact.pickupsCompleted.toLocaleString()}
          />
          <MetricCard
            label="restaurants helped"
            value={impact.restaurantsHelped.toLocaleString()}
          />
        </div>
      </section>

      <section className="mb-8 max-w-sm rounded-2xl bg-white p-5 shadow-card">
        <p className="mb-3 font-mono text-[10px] uppercase tracking-wide text-neutral-600">
          your completion rate · lifetime
        </p>
        <ReliabilityMeter name="On-time completion" pct={impact.completionRate} />
      </section>

      {!hasActivity && (
        <p className="text-sm text-neutral-600">
          Your first rescue is waiting —{" "}
          <Link
            href="/"
            className="font-semibold text-clay-600 underline-offset-2 hover:underline"
          >
            claim a pickup
          </Link>{" "}
          and your impact shows up here.
        </p>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS — no type errors.

- [ ] **Step 3: Manual verification**

With the dev server running (`npm run dev`), sign in as a volunteer and visit `http://localhost:3000/profile`. Confirm:
- Identity header shows name + `volunteer · joined <Mon YYYY>`.
- Four metric cards show numbers (or `0`s).
- Completion-rate meter renders with a percentage.
- For a brand-new volunteer with no deliveries, all values are `0` and the "Your first rescue is waiting" line appears with a working link to the feed.

- [ ] **Step 4: Commit**

```bash
git add app/profile/page.tsx
git commit -m "Add volunteer profile page"
```

---

### Task 4: Link the nav avatar to `/profile`

**Files:**
- Modify: `components/NavBar.tsx`

- [ ] **Step 1: Add the Link import**

`components/NavBar.tsx` already imports `Link` from `next/link` (used by the nav items). No new import needed — confirm it is present at the top:

```tsx
import Link from "next/link";
```

- [ ] **Step 2: Wrap the desktop avatar in a link**

In the desktop "user + sign out" block, replace this line:

```tsx
        <Avatar name={name} className="shadow-card" />
```

with:

```tsx
        <Link
          href="/profile"
          aria-label="Your profile"
          aria-current={isActive("/profile") ? "page" : undefined}
          className="rounded-full transition duration-150 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400 focus-visible:ring-offset-2"
        >
          <Avatar name={name} className="shadow-card" />
        </Link>
```

- [ ] **Step 3: Add a Profile link to the mobile dropdown**

In the mobile dropdown panel, the footer `<div>` currently holds the name/role span and the sign-out button:

```tsx
            <div className="mt-2 flex items-center justify-between border-t border-neutral-200/40 px-3 pt-3">
              <span className="font-mono text-[11px] uppercase tracking-wide text-neutral-500">
                {name} · {roleLabel}
              </span>
```

Insert a Profile link as a list item immediately **before** that footer `<div>` (i.e. right after the `{items.map(...)}` block that renders the nav links), so it sits with the other tappable links:

```tsx
            <Link
              href="/profile"
              onClick={() => setOpen(false)}
              aria-current={isActive("/profile") ? "page" : undefined}
              className={cn(
                "rounded-xl px-3 py-2.5 text-sm transition-colors",
                isActive("/profile")
                  ? "bg-neutral-900 font-semibold text-neutral-50"
                  : "text-neutral-700 hover:bg-neutral-100"
              )}
            >
              Profile
            </Link>
```

(`cn` and `isActive` are already imported/defined in this file.)

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS — no type errors.

- [ ] **Step 5: Manual verification**

With the dev server running and signed in: on desktop, click the avatar (top right) → navigates to `/profile`, and the avatar shows a focus ring on keyboard focus. On a narrow viewport, open the hamburger menu → a "Profile" link appears and navigates to `/profile`.

- [ ] **Step 6: Commit**

```bash
git add components/NavBar.tsx
git commit -m "Link nav avatar and mobile menu to /profile"
```

---

## Final verification

- [ ] Run the full test suite: `npm test` — all tests pass.
- [ ] Typecheck the whole project: `npx tsc --noEmit` — clean.
- [ ] Manual smoke: visit `/profile` as a volunteer with deliveries (real numbers) and as a fresh account (zeros + empty-state CTA); confirm the nav avatar and mobile Profile link both route there.

## Post-implementation (per project conventions)

- [ ] Open a PR for `feature/volunteer-profile` (base: `integration/all-features`, matching the existing feature-branch workflow).
- [ ] Run the Obsidian wiki ingest for this commit set (standing "commit → ingest" rule): add/update a profile page under the wiki and append a dated entry to `log.md`.
