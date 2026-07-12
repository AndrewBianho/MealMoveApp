# Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a privacy-first, full-stack analytics setup (operational, product, web/perf, observability) behind one vendor-agnostic `lib/analytics` layer.

**Architecture:** Approach A — Consolidated. A typed event taxonomy with a PII firewall is the single import surface; **PostHog** sits behind it for product + errors + replay **and** web/perf (pageviews + Core Web Vitals); operational mission metrics are computed from our own Supabase DB and rendered in the org-admin console. Client events cover intent/navigation; server events (fired inside `app/actions.ts` server actions) carry DB-state truth. No Vercel Analytics — web/perf routes through PostHog to keep incremental cost at zero on the Pro plan.

**Tech Stack:** Next.js 14 App Router, TypeScript, Prisma/Postgres (Supabase), `posthog-js`, `posthog-node`, and Next's built-in `useReportWebVitals` (no `@vercel/*` analytics packages). Tests use Node's built-in runner (`node:test` + `node:assert/strict`) per the existing `lib/*.test.ts` convention.

## Global Constraints

- **Never** send name, phone, email, address, or exact lat/lng to any vendor. Identify by `sha256(userId)` + role only. Enforced in `lib/analytics/identify.ts`.
- Analytics must be **env-gated and non-blocking**: with no keys set, every `track`/`identify` is a silent no-op; a vendor failure never throws into product code.
- Styling (dashboard task) uses only DESIGN.md tokens — `MetricCard`, semantic ramps, non-punitive bars. No new colors/fonts/hex. Sentence case; mono for metadata.
- Tests: `npm test` runs `node --require ./lib/stub-server-only.cjs --import tsx --test lib/*.test.ts`. New unit tests live at `lib/analytics/*.test.ts` and use `import { test } from "node:test"; import assert from "node:assert/strict";`.
- Reliability/behavior data is presented non-punitively — bars/percentages, never grades or per-person shaming.
- Commit only the `Code/` folder; commit directly to `main`.

---

### Task 1: Event taxonomy + PII firewall (pure, TDD)

The privacy backbone. Pure functions, no vendor imports, fully unit-tested.

**Files:**
- Create: `lib/analytics/events.ts`
- Create: `lib/analytics/identify.ts`
- Test: `lib/analytics/identify.test.ts`

**Interfaces:**
- Produces:
  - `type AnalyticsEvent` — discriminated union (`{ name: "claim_completed"; props: {...} } | ...`) covering every event in the spec taxonomy.
  - `type EventName = AnalyticsEvent["name"]`
  - `hashUserId(userId: string): string` — `sha256` hex.
  - `sanitizeProps(props: Record<string, unknown>): Record<string, unknown>` — drops PII-denylist keys, passes the rest through.
  - `const PII_DENYLIST: readonly string[]`

- [ ] **Step 1: Write the failing test**

```ts
// lib/analytics/identify.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { hashUserId, sanitizeProps, PII_DENYLIST } from "./identify";

test("hashUserId is deterministic sha256 hex, not the raw id", () => {
  const h = hashUserId("user_123");
  assert.equal(h, hashUserId("user_123"));
  assert.match(h, /^[a-f0-9]{64}$/);
  assert.notEqual(h, "user_123");
});

test("sanitizeProps strips every PII denylist key", () => {
  const out = sanitizeProps({
    name: "Ada", phone: "5551234567", email: "a@b.co",
    address: "1 Main", lat: 40.1, lng: -75.5, coordinates: [40, -75],
    listingId: "l1", servings: 12,
  });
  for (const k of PII_DENYLIST) assert.equal(k in out, false);
  assert.deepEqual(out, { listingId: "l1", servings: 12 });
});

test("sanitizeProps leaves non-PII props untouched", () => {
  const out = sanitizeProps({ role: "volunteer", step: 3, wasNearest: true });
  assert.deepEqual(out, { role: "volunteer", step: 3, wasNearest: true });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test 2>&1 | grep -A2 identify`
Expected: FAIL — cannot find module `./identify`.

- [ ] **Step 3: Write `events.ts`**

```ts
// lib/analytics/events.ts
// Vendor-agnostic event taxonomy. Props here are pre-sanitization shapes;
// identify.ts strips any PII before an event leaves the process.
export type Role = "volunteer" | "restaurant" | "drop_off" | "org_admin";

export type AnalyticsEvent =
  // auth & onboarding
  | { name: "signup_started"; props: { role: Role } }
  | { name: "signup_step_completed"; props: { role: Role; step: number } }
  | { name: "signup_submitted"; props: { role: Role; hadInvite: boolean } }
  | { name: "login"; props: { role: Role } }
  // browsing
  | { name: "feed_viewed"; props: { openCount: number; scheduledCount: number } }
  | { name: "filter_applied"; props: { kind: "status" | "foodType"; value: string } }
  | { name: "sort_changed"; props: { sort: "closing_soon" | "nearest" | "most_meals" } }
  | { name: "view_toggled"; props: { to: "list" | "map" } }
  | { name: "listing_opened"; props: { listingId: string; urgencyBand: "open" | "soon" | "closing_soon" } }
  // claim funnel
  | { name: "claim_flow_viewed"; props: { listingId: string } }
  | { name: "drop_off_selected"; props: { listingId: string; dropOffId: string; wasNearest: boolean } }
  | { name: "claim_completed"; props: { listingId: string; dropOffId: string; minutesToExpiry: number; servings: number } }
  // pickup lifecycle
  | { name: "pickup_photo_uploaded"; props: { pickupId: string; minutesSinceClaim: number } }
  | { name: "in_transit_started"; props: { pickupId: string } }
  | { name: "delivered"; props: { pickupId: string; servings: number; minutesClaimToDelivered: number } }
  | { name: "taken_home"; props: { pickupId: string } }
  | { name: "flaked"; props: { pickupId: string; stage: "claimed" | "photographed"; minutesHeld: number } }
  | { name: "pickup_cancelled"; props: { pickupId: string; stage: "claimed" | "photographed" } }
  // restaurant & drop-off
  | { name: "listing_posted"; props: { servings: number; foodType: string; handling: string; minutesToExpiry: number; carsRequested: number } }
  | { name: "listing_expired_unclaimed"; props: { servings: number; minutesLive: number } }
  | { name: "drop_off_need_updated"; props: { dropOffId: string; needLevel: string } }
  // coordination
  | { name: "chat_message_sent"; props: { pickupId: string; senderRole: Role } };

export type EventName = AnalyticsEvent["name"];
```

- [ ] **Step 4: Write `identify.ts`**

```ts
// lib/analytics/identify.ts
import { createHash } from "node:crypto";

export const PII_DENYLIST = [
  "name", "firstName", "lastName", "phone", "email",
  "address", "lat", "lng", "latitude", "longitude", "coordinates",
] as const;

export function hashUserId(userId: string): string {
  return createHash("sha256").update(userId).digest("hex");
}

export function sanitizeProps(
  props: Record<string, unknown>,
): Record<string, unknown> {
  const deny = new Set<string>(PII_DENYLIST);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {
    if (!deny.has(k)) out[k] = v;
  }
  return out;
}
```

> Note: `identify.ts` uses `node:crypto` so it's server-safe. The browser transport (Task 2) hashes via the already-hashed distinct id passed from the server session, or uses `crypto.subtle`; it never re-imports this Node module client-side.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test 2>&1 | grep -E "identify|pass|fail"`
Expected: identify tests PASS; existing suite still green.

- [ ] **Step 6: Commit**

```bash
git add lib/analytics/events.ts lib/analytics/identify.ts lib/analytics/identify.test.ts
git commit -m "feat(analytics): typed event taxonomy + PII firewall"
```

---

### Task 2: Transports + facade (server, client, index)

Wire PostHog behind the taxonomy. Env-gated no-ops without keys.

**Files:**
- Create: `lib/analytics/server.ts`
- Create: `lib/analytics/client.ts`
- Create: `lib/analytics/index.ts`
- Test: `lib/analytics/server.test.ts`
- Modify: `package.json` (add `posthog-js`, `posthog-node`)
- Modify: `.env.example` (add keys) — create if absent

**Interfaces:**
- Consumes: `AnalyticsEvent`, `EventName` (Task 1 `events.ts`); `hashUserId`, `sanitizeProps` (Task 1 `identify.ts`).
- Produces:
  - Server: `trackServer(event: AnalyticsEvent, userId?: string): void` (fire-and-forget), `identifyServer(userId: string, role: Role): void`.
  - Client: `trackClient<E extends AnalyticsEvent>(name: E["name"], props: E["props"]): void`, `identifyClient(hashedId: string, role: Role): void`, `initClient(): void`.
  - Index re-exports both plus the types, so features do `import { trackServer } from "@/lib/analytics"`.

- [ ] **Step 1: Add dependencies**

Run: `npm install posthog-js posthog-node`
Expected: both added to `package.json` dependencies.

- [ ] **Step 2: Write the failing test (server no-op safety)**

```ts
// lib/analytics/server.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { trackServer, identifyServer } from "./server";

test("trackServer is a no-op (never throws) when POSTHOG_KEY is unset", () => {
  delete process.env.POSTHOG_KEY;
  assert.doesNotThrow(() =>
    trackServer({ name: "delivered", props: { pickupId: "p1", servings: 8, minutesClaimToDelivered: 40 } }, "user_1"),
  );
});

test("identifyServer never throws when disabled", () => {
  delete process.env.POSTHOG_KEY;
  assert.doesNotThrow(() => identifyServer("user_1", "volunteer"));
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test 2>&1 | grep -A2 server`
Expected: FAIL — cannot find module `./server`.

- [ ] **Step 4: Write `server.ts`**

```ts
// lib/analytics/server.ts
import "server-only";
import { PostHog } from "posthog-node";
import type { AnalyticsEvent, Role } from "./events";
import { hashUserId, sanitizeProps } from "./identify";

let client: PostHog | null = null;
function get(): PostHog | null {
  const key = process.env.POSTHOG_KEY;
  if (!key) return null;
  if (!client) {
    client = new PostHog(key, {
      host: process.env.POSTHOG_HOST ?? "https://eu.i.posthog.com",
      flushAt: 1,
      flushInterval: 0,
    });
  }
  return client;
}

export function trackServer(event: AnalyticsEvent, userId?: string): void {
  try {
    const ph = get();
    if (!ph) return;
    ph.capture({
      distinctId: userId ? hashUserId(userId) : "anon",
      event: event.name,
      properties: sanitizeProps(event.props as Record<string, unknown>),
    });
  } catch {
    /* analytics must never break product code */
  }
}

export function identifyServer(userId: string, role: Role): void {
  try {
    const ph = get();
    if (!ph) return;
    ph.identify({ distinctId: hashUserId(userId), properties: { role } });
  } catch {
    /* no-op */
  }
}
```

- [ ] **Step 5: Write `client.ts`**

```ts
// lib/analytics/client.ts
"use client";
import posthog from "posthog-js";
import type { AnalyticsEvent, Role } from "./events";

let started = false;
export function initClient(): void {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key || started || typeof window === "undefined") return;
  started = true;
  posthog.init(key, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com",
    autocapture: false, // no autocapture of input values — PII safety
    capture_pageview: true,
    mask_all_text: false,
    mask_all_element_attributes: true,
    persistence: "memory", // cookieless
    session_recording: { maskAllInputs: true },
    disable_session_recording: true, // enabled only for gated flows (Task 8)
  });
}

export function trackClient<E extends AnalyticsEvent>(
  name: E["name"],
  props: E["props"],
): void {
  try {
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
    posthog.capture(name, props as Record<string, unknown>);
  } catch {
    /* no-op */
  }
}

export function identifyClient(hashedId: string, role: Role): void {
  try {
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
    posthog.identify(hashedId, { role });
  } catch {
    /* no-op */
  }
}
```

> The client is handed the **already-hashed** id (from the server session) so raw ids never reach the browser bundle.

- [ ] **Step 6: Write `index.ts`**

```ts
// lib/analytics/index.ts
export type { AnalyticsEvent, EventName, Role } from "./events";
export { trackServer, identifyServer } from "./server";
// client transports are imported directly from "./client" by client components
```

- [ ] **Step 7: Add env keys**

Add to `.env.example` (create if missing):

```
# Analytics (PostHog) — leave blank to disable (all tracking no-ops)
POSTHOG_KEY=
POSTHOG_HOST=https://eu.i.posthog.com
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com
```

- [ ] **Step 8: Run tests + typecheck**

Run: `npm test 2>&1 | tail -5 && npm run typecheck`
Expected: server tests PASS, typecheck clean.

- [ ] **Step 9: Commit**

```bash
git add lib/analytics/server.ts lib/analytics/client.ts lib/analytics/index.ts lib/analytics/server.test.ts package.json package-lock.json .env.example
git commit -m "feat(analytics): env-gated PostHog server + client transports"
```

---

### Task 3: Web + performance (PostHog web vitals) + client init

Mount browser analytics once, app-wide. **No Vercel Analytics** — web/perf routes
through PostHog to keep incremental cost at zero on the Pro plan. (Superseded the
original Vercel-based version on 2026-07-11; the `web_vitals` event was added to
`lib/analytics/events.ts`.)

**Files:**
- Create: `components/AnalyticsProvider.tsx` — calls `initClient()` on mount.
- Create: `components/WebVitals.tsx` — pipes Core Web Vitals into PostHog.
- Modify: `app/layout.tsx` (mount both inside `<body>`).
- Modify: `lib/analytics/events.ts` (add the `web_vitals` event to the union).

**Interfaces:**
- Consumes: `initClient`, `trackClient` (Task 2 `client.ts`).
- Produces: `<AnalyticsProvider />`, `<WebVitals />`.

- [ ] **Step 1: Add `web_vitals` to the taxonomy**

In `lib/analytics/events.ts`, add to the `AnalyticsEvent` union:

```ts
  // web performance — Core Web Vitals (RUM), reported via next/web-vitals → PostHog
  | { name: "web_vitals"; props: { metric: string; value: number; rating: string; navigationType: string } }
```

- [ ] **Step 2: Write `AnalyticsProvider.tsx`**

```tsx
// components/AnalyticsProvider.tsx
"use client";
import { useEffect } from "react";
import { initClient } from "@/lib/analytics/client";

export function AnalyticsProvider() {
  useEffect(() => { initClient(); }, []);
  return null;
}
```

- [ ] **Step 3: Write `WebVitals.tsx`** (uses Next's built-in hook — no dependency)

```tsx
// components/WebVitals.tsx
"use client";
import { useReportWebVitals } from "next/web-vitals";
import { trackClient } from "@/lib/analytics/client";

export function WebVitals() {
  useReportWebVitals((metric) => {
    trackClient("web_vitals", {
      metric: metric.name,
      value: Math.round(metric.value),
      rating: "rating" in metric ? (metric.rating ?? "") : "",
      navigationType: "navigationType" in metric ? (metric.navigationType ?? "") : "",
    });
  });
  return null;
}
```

- [ ] **Step 4: Mount in the root layout**

In `app/layout.tsx`, add imports at the top:

```tsx
import { AnalyticsProvider } from "@/components/AnalyticsProvider";
import { WebVitals } from "@/components/WebVitals";
```

Inside `<body>`, after `{children}` and before `</body>`:

```tsx
        <AnalyticsProvider />
        <WebVitals />
```

- [ ] **Step 5: Verify**

Run: `npm run typecheck` (Do NOT run `npm run build` if a dev server is live — see project memory.)
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add lib/analytics/events.ts components/AnalyticsProvider.tsx components/WebVitals.tsx app/layout.tsx
git commit -m "feat(analytics): PostHog client init + PostHog-based web vitals (no Vercel cost)"
```

---

### Task 4: Instrument server truth events (`app/actions.ts`, sweep cron)

Fire DB-truth events from the server actions that already mutate state. All non-throwing.

**Files:**
- Modify: `app/actions.ts` — inside `claimListing`, `startDelivery`, `markDelivered`, `takeHomeForTomorrow`, `releaseClaim`, `postListing`, `registerUser`, `updateNeedLevel`
- Modify: `app/api/cron/sweep/route.ts` — emit `listing_expired_unclaimed`

**Interfaces:**
- Consumes: `trackServer`, `identifyServer` (Task 2). Add `import { trackServer } from "@/lib/analytics";` to each file.

- [ ] **Step 1: Instrument `claimListing`**

After the claim is successfully persisted in `claimListing(listingId, dropOffId?)` (right before its success `return`), add — computing `minutesToExpiry` and `servings` from the loaded listing and the authenticated `userId`:

```ts
trackServer(
  { name: "claim_completed", props: {
      listingId,
      dropOffId: dropOffId ?? "",
      minutesToExpiry: Math.max(0, Math.round((listing.expiresAt.getTime() - Date.now()) / 60000)),
      servings: listing.servings ?? 0,
  } },
  userId,
);
```

- [ ] **Step 2: Instrument the remaining lifecycle actions**

Add the matching `trackServer(...)` before each action's success return, using the ids/values already in scope:
- `startDelivery` → `{ name: "pickup_photo_uploaded", props: { pickupId, minutesSinceClaim } }` and `{ name: "in_transit_started", props: { pickupId } }`
- `markDelivered` → `{ name: "delivered", props: { pickupId, servings, minutesClaimToDelivered } }`
- `takeHomeForTomorrow` → `{ name: "taken_home", props: { pickupId } }`
- `releaseClaim` → `{ name: "flaked", props: { pickupId, stage, minutesHeld } }` (stage = `photographed` if a photo exists, else `claimed`)
- `postListing` → `{ name: "listing_posted", props: { servings, foodType, handling, minutesToExpiry, carsRequested } }`
- `registerUser` → `{ name: "signup_submitted", props: { role, hadInvite } }` then `identifyServer(newUserId, role)`
- `updateNeedLevel` → `{ name: "drop_off_need_updated", props: { dropOffId, needLevel } }`

Where a `pickupId` isn't a distinct model, use the listing/claim id already returned by that action. Each call passes the authenticated `userId` as the 2nd arg where available.

- [ ] **Step 3: Instrument sweep expiry**

In `app/api/cron/sweep/route.ts`, for each listing the sweep marks expired-and-unclaimed, add:

```ts
trackServer({ name: "listing_expired_unclaimed", props: {
  servings: listing.servings ?? 0,
  minutesLive: Math.round((Date.now() - listing.createdAt.getTime()) / 60000),
} });
```

- [ ] **Step 4: Verify typecheck**

Run: `npm run typecheck`
Expected: clean — event props match the taxonomy types (the discriminated union will error on any mismatch, which is the point).

- [ ] **Step 5: Commit**

```bash
git add app/actions.ts app/api/cron/sweep/route.ts
git commit -m "feat(analytics): emit server truth events from lifecycle actions"
```

---

### Task 5: Instrument client events (browsing, claim flow, signup)

Fire intent/navigation events from the client components that own each interaction.

**Files:**
- Modify: the feed/listing-feed client component (search: `view_toggled` target — the component holding the List↔Map toggle and sort/filter state)
- Modify: the drop-off picker client component in the listing-detail claim flow
- Modify: `components/SignupForm.tsx`

**Interfaces:**
- Consumes: `trackClient` (Task 2 `client.ts`). Add `import { trackClient } from "@/lib/analytics/client";`.

- [ ] **Step 1: Locate the feed client component**

Run: `grep -rln "list.*map\|toggle\|sort" components app --include=*.tsx | grep -iv node_modules | head`
Identify the client component that manages the feed's filter pills, sort control, and List↔Map toggle.

- [ ] **Step 2: Instrument browsing events**

In that component's existing handlers (not new effects), add:
- filter pill change → `trackClient("filter_applied", { kind: "status", value })` (or `"foodType"` for the food-type chips)
- sort change → `trackClient("sort_changed", { sort })`
- view toggle → `trackClient("view_toggled", { to })`
- a listing card "More details" click → `trackClient("listing_opened", { listingId, urgencyBand })`

- [ ] **Step 3: Instrument the claim flow**

In the drop-off picker client component:
- on mount / when the picker renders → `trackClient("claim_flow_viewed", { listingId })`
- on choice-card select → `trackClient("drop_off_selected", { listingId, dropOffId, wasNearest })` (`wasNearest` = the picker already flags the first/nearest card)

- [ ] **Step 4: Instrument signup**

In `components/SignupForm.tsx`:
- when the wizard mounts on step 1 → `trackClient("signup_started", { role })` (role may be unset on step 1 — fire once role is chosen)
- on each step advance → `trackClient("signup_step_completed", { role, step })`

- [ ] **Step 5: Verify typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(analytics): instrument browsing, claim-flow, and signup client events"
```

---

### Task 6: Operational metrics from own DB (TDD)

Compute mission truth-metrics from domain tables. Pure aggregation functions over query results, unit-tested against fixtures.

**Files:**
- Create: `lib/analytics/operational.ts`
- Test: `lib/analytics/operational.test.ts`

**Interfaces:**
- Produces:
  - `type PickupRecord = { status: "claimed" | "photographed" | "in_transit" | "delivered" | "taken_home" | "flaked" | "cancelled"; servings: number }`
  - `computeFunnel(pickups: PickupRecord[]): { claimed: number; pickedUp: number; delivered: number }`
  - `computeFlakeRate(pickups: PickupRecord[]): number` — flaked / (flaked + delivered), 0 when denominator 0
  - `computeServingsRescued(pickups: PickupRecord[]): number` — sum of servings where status === "delivered"

- [ ] **Step 1: Write the failing test**

```ts
// lib/analytics/operational.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeFunnel, computeFlakeRate, computeServingsRescued, type PickupRecord } from "./operational";

const sample: PickupRecord[] = [
  { status: "delivered", servings: 10 },
  { status: "delivered", servings: 5 },
  { status: "in_transit", servings: 8 },
  { status: "flaked", servings: 6 },
  { status: "claimed", servings: 4 },
];

test("computeServingsRescued sums only delivered", () => {
  assert.equal(computeServingsRescued(sample), 15);
});

test("computeFlakeRate = flaked / (flaked + delivered)", () => {
  assert.equal(computeFlakeRate(sample), 1 / 3);
  assert.equal(computeFlakeRate([]), 0);
});

test("computeFunnel counts each stage reached", () => {
  assert.deepEqual(computeFunnel(sample), { claimed: 5, pickedUp: 3, delivered: 2 });
});
```

> `pickedUp` counts any pickup that reached photographed/in_transit/delivered/taken_home (past the claim); `delivered` counts terminal delivered. Fixture: 2 delivered + 1 in_transit = 3 pickedUp; all 5 reached claimed.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test 2>&1 | grep -A2 operational`
Expected: FAIL — cannot find module `./operational`.

- [ ] **Step 3: Write `operational.ts`**

```ts
// lib/analytics/operational.ts
export type PickupRecord = {
  status: "claimed" | "photographed" | "in_transit" | "delivered" | "taken_home" | "flaked" | "cancelled";
  servings: number;
};

const PICKED_UP = new Set(["photographed", "in_transit", "delivered", "taken_home"]);

export function computeServingsRescued(pickups: PickupRecord[]): number {
  return pickups.filter((p) => p.status === "delivered").reduce((s, p) => s + p.servings, 0);
}

export function computeFlakeRate(pickups: PickupRecord[]): number {
  const flaked = pickups.filter((p) => p.status === "flaked").length;
  const delivered = pickups.filter((p) => p.status === "delivered").length;
  const denom = flaked + delivered;
  return denom === 0 ? 0 : flaked / denom;
}

export function computeFunnel(pickups: PickupRecord[]): { claimed: number; pickedUp: number; delivered: number } {
  return {
    claimed: pickups.length,
    pickedUp: pickups.filter((p) => PICKED_UP.has(p.status)).length,
    delivered: pickups.filter((p) => p.status === "delivered").length,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test 2>&1 | grep -E "operational|# pass|# fail"`
Expected: operational tests PASS; suite green.

- [ ] **Step 5: Commit**

```bash
git add lib/analytics/operational.ts lib/analytics/operational.test.ts
git commit -m "feat(analytics): operational metric aggregations from own DB"
```

---

### Task 7: Org-admin analytics dashboard page

Render the operational metrics in the admin console, using DESIGN.md tokens.

**Files:**
- Create: `app/admin/analytics/page.tsx`
- Create: `lib/analytics/dashboardData.ts` (server: loads pickups via Prisma, maps to `PickupRecord[]`, returns the computed metrics)
- Modify: the admin nav source (search for where `app/admin/*` links are listed — add an "Analytics" nav item)

**Interfaces:**
- Consumes: `computeFunnel`, `computeFlakeRate`, `computeServingsRescued`, `PickupRecord` (Task 6); existing `MetricCard` component; `prisma` from `@/lib/prisma`.
- Produces: `getDashboardData(): Promise<{ servingsRescued: number; flakeRate: number; funnel: {...} }>` in `dashboardData.ts`.

- [ ] **Step 1: Write `dashboardData.ts`**

```ts
// lib/analytics/dashboardData.ts
import "server-only";
import { prisma } from "@/lib/prisma";
import { computeFunnel, computeFlakeRate, computeServingsRescued, type PickupRecord } from "./operational";

export async function getDashboardData() {
  // Adapt the select/mapping to the real pickup/claim model + status enum.
  const rows = await prisma.pickup.findMany({
    select: { status: true, listing: { select: { servings: true } } },
  });
  const pickups: PickupRecord[] = rows.map((r) => ({
    status: r.status as PickupRecord["status"],
    servings: r.listing?.servings ?? 0,
  }));
  return {
    servingsRescued: computeServingsRescued(pickups),
    flakeRate: computeFlakeRate(pickups),
    funnel: computeFunnel(pickups),
  };
}
```

> Verify the actual model/enum names against `prisma/schema.prisma` before running; adjust `prisma.pickup` / `status` values to match. The `operational.ts` types are the contract the mapping must satisfy.

- [ ] **Step 2: Write the page (server component)**

```tsx
// app/admin/analytics/page.tsx
import { getDashboardData } from "@/lib/analytics/dashboardData";
import { MetricCard } from "@/components/MetricCard";

export default async function AnalyticsPage() {
  const d = await getDashboardData();
  const completion = Math.round((1 - d.flakeRate) * 100);
  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="font-display text-[34px] leading-[1.1] tracking-tight text-balance">
        Analytics
      </h1>
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <MetricCard label="meals rescued" value={d.servingsRescued} />
        <MetricCard label="pickups completed" value={d.funnel.delivered} />
        <MetricCard label="completion rate" value={completion} suffix="%" />
      </div>
      {/* Funnel + flake rate render as non-punitive bars — no grades, sentence case, mono metadata. */}
    </main>
  );
}
```

> Match `MetricCard`'s real prop names (check `components/MetricCard.tsx` — it may take `value`/`label`/`suffix` differently). Use only DESIGN.md tokens; flake shows as a calm bar/percentage, never a grade.

- [ ] **Step 3: Add the admin nav link**

Add an "Analytics" entry (sentence case) pointing to `/admin/analytics` wherever the other `app/admin/*` links are defined.

- [ ] **Step 4: Verify typecheck + visual**

Run: `npm run typecheck`
Then load `/admin/analytics` in the running dev server as an org_admin and confirm the metric cards render with real numbers.

- [ ] **Step 5: Commit**

```bash
git add app/admin/analytics/page.tsx lib/analytics/dashboardData.ts
git add -A  # nav file
git commit -m "feat(analytics): org-admin operational dashboard"
```

---

### Task 8: PostHog configuration runbook + gated session replay

Non-code setup, documented so it survives founder turnover (institutional-memory goal).

**Files:**
- Create: `docs/superpowers/runbooks/analytics-posthog-setup.md`
- Modify: `lib/analytics/client.ts` — enable replay only for failed/abandoned rescue flows

- [ ] **Step 1: Enable gated session replay**

In `client.ts`, add an exported helper that turns replay on only when explicitly called from a failure/abandonment path:

```ts
export function startFailureReplay(): void {
  try {
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
    posthog.startSessionRecording();
  } catch { /* no-op */ }
}
```

Call `startFailureReplay()` from the claim-abandon / take-home / cancel client paths only.

- [ ] **Step 2: Write the runbook**

Document, with exact steps: creating the PostHog EU project, where the 4 env vars go (local `.env`, Vercel project settings), building the **claim funnel** (`claim_flow_viewed → drop_off_selected → claim_completed`) and **rescue funnel** (`claim_completed → pickup_photo_uploaded → delivered`), the **flake-rate** insight (`flaked` vs `delivered`), the **signup funnel** (`signup_step_completed` by step), and enabling error tracking. Note the privacy settings already enforced in code (autocapture off, input masking, EU host, cookieless).

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/runbooks/analytics-posthog-setup.md lib/analytics/client.ts
git commit -m "docs(analytics): PostHog setup runbook + gated failure replay"
```

---

## Self-Review

- **Spec coverage:** event layer (T1–T2) ✓; PII firewall (T1) ✓; operational own-DB layer (T6–T7) ✓; product/behavior events (T4–T5) ✓; web/perf via PostHog web vitals (T3) ✓; observability/replay (T8) ✓; every taxonomy event mapped to an emit site (T4 server, T5 client) ✓; privacy/consent (T2 init config + T1 firewall) ✓; testing (T1, T2, T6 unit tests) ✓.
- **Placeholder scan:** code shown for every code step; the two spots requiring codebase-specific adaptation (Prisma model names in T7, exact feed component in T5) are flagged with the contract the adaptation must satisfy, not left vague.
- **Type consistency:** `trackServer(event, userId?)`, `trackClient(name, props)`, `PickupRecord`, `computeFunnel/computeFlakeRate/computeServingsRescued` names are identical across T2, T4, T5, T6, T7.
