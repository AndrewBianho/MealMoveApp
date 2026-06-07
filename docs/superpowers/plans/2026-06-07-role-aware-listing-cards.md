# Role-aware Listing Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the redesigned `ListingCard` adapt what it emphasizes to who's viewing it — volunteer (default, unchanged), restaurant, or drop-off admin — via one optional `audience` prop, with no new components.

**Architecture:** Add an `audience` prop to `ListingCard` that toggles three regions (Tier-2 distance fact, source line, `→ dropOff` route line) through three derived booleans. Pass the right audience from the restaurant console and the two drop-off surfaces; showcase the variants on `/styleguide`. Presentation only — no new server actions.

**Tech Stack:** Next.js 14 (server + client components), TypeScript, Tailwind.

---

## File Structure

- `components/ListingCard.tsx` — **Modify.** Add `ListingCardAudience` type + `audience` prop; gate distance/source/route regions.
- `components/RestaurantConsole.tsx` — **Modify.** Pass `audience="restaurant"`.
- `app/dropoff/page.tsx` — **Modify.** Pass `audience="dropoff"`.
- `app/dropoffs/[id]/page.tsx` — **Modify.** Pass `audience="dropoff"`.
- `app/styleguide/page.tsx` — **Modify.** Add a section showing the three audience variants of one card.

`ListingCard` is a pure presentational component and the repo has no component-test harness (test glob `lib/**/*.test.ts`), so verification is `npx tsc --noEmit`, the `/styleguide` page, and an authenticated per-role smoke. No call site is forced to change (the prop is optional), so the feed and `/pickups` keep the default volunteer view untouched.

> **Note (dev server):** Do not run `npm run build` while `next dev` is running — it clobbers `.next`. Use `npx tsc --noEmit` to typecheck.

---

### Task 1: Add the `audience` prop to `ListingCard`

**Files:**
- Modify: `components/ListingCard.tsx`

- [ ] **Step 1: Add the audience type and prop**

In `components/ListingCard.tsx`, replace the props interface:

```tsx
interface ListingCardProps {
  listing: Listing;
  /** When provided and the listing is open, the footer shows a claim button. */
  onClaim?: (id: string) => void;
}
```

with:

```tsx
export type ListingCardAudience = "volunteer" | "restaurant" | "dropoff";

interface ListingCardProps {
  listing: Listing;
  /** When provided and the listing is open, the footer shows a claim button. */
  onClaim?: (id: string) => void;
  /** Who's viewing — tunes which facts/lines show. Defaults to the volunteer view. */
  audience?: ListingCardAudience;
}
```

- [ ] **Step 2: Accept the prop and derive the region flags**

Change the function signature line:

```tsx
export function ListingCard({ listing, onClaim }: ListingCardProps) {
```

to:

```tsx
export function ListingCard({
  listing,
  onClaim,
  audience = "volunteer",
}: ListingCardProps) {
```

Then, immediately after the existing `const isPlaceholder = !imageUrl;` line, add:

```tsx
  // Audience tuning: distance is only meaningful to a volunteer; the source line
  // is redundant for a restaurant (it's them); the → drop-off line is redundant
  // for a drop-off admin (it's them).
  const showDistance = audience === "volunteer";
  const showSource = audience !== "restaurant";
  const showRoute = audience !== "dropoff";
```

- [ ] **Step 3: Gate the Tier-2 distance fact**

Replace the Tier-2 facts block:

```tsx
          <div className="mt-3 flex items-baseline gap-3 font-mono">
            <span className="text-neutral-900">
              <span className="text-lg font-semibold">{servings}</span>
              <span className="ml-1 text-[11px] text-neutral-500">servings</span>
            </span>
            <span className="text-neutral-300">·</span>
            <span className="text-neutral-900">
              <span className="text-base font-semibold">{distance}</span>
              <span className="ml-1 text-[11px] text-neutral-500">away</span>
            </span>
          </div>
```

with:

```tsx
          <div className="mt-3 flex items-baseline gap-3 font-mono">
            <span className="text-neutral-900">
              <span className="text-lg font-semibold">{servings}</span>
              <span className="ml-1 text-[11px] text-neutral-500">servings</span>
            </span>
            {showDistance && (
              <>
                <span className="text-neutral-300">·</span>
                <span className="text-neutral-900">
                  <span className="text-base font-semibold">{distance}</span>
                  <span className="ml-1 text-[11px] text-neutral-500">away</span>
                </span>
              </>
            )}
          </div>
```

- [ ] **Step 4: Gate and re-frame the source line**

Replace the Tier-3 source span block:

```tsx
          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 font-sans text-[13px] text-neutral-600">
            {category && (
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-neutral-600">
                {category}
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <MapPin className="text-neutral-400" />
              {source}
            </span>
          </div>
```

with:

```tsx
          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 font-sans text-[13px] text-neutral-600">
            {category && (
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-neutral-600">
                {category}
              </span>
            )}
            {showSource && (
              <span className="flex items-center gap-1.5">
                <MapPin className="text-neutral-400" />
                {audience === "dropoff" ? `from ${source}` : source}
              </span>
            )}
          </div>
```

- [ ] **Step 5: Gate the route line**

Replace the drop-off route line:

```tsx
          {dropOff && (
            <p className="mt-1.5 flex items-center gap-1.5 font-sans text-[13px] text-clay-600">
              <ArrowRight className="text-clay-400" />
              {dropOff}
            </p>
          )}
```

with:

```tsx
          {dropOff && showRoute && (
            <p className="mt-1.5 flex items-center gap-1.5 font-sans text-[13px] text-clay-600">
              <ArrowRight className="text-clay-400" />
              {dropOff}
            </p>
          )}
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS — the prop is optional, so all existing call sites still compile.

- [ ] **Step 7: Commit**

```bash
git add components/ListingCard.tsx
git commit -m "Add audience prop to ListingCard for role-aware presentation"
```

---

### Task 2: Pass `audience` from the role surfaces

**Files:**
- Modify: `components/RestaurantConsole.tsx`
- Modify: `app/dropoff/page.tsx`
- Modify: `app/dropoffs/[id]/page.tsx`

- [ ] **Step 1: Restaurant console**

In `components/RestaurantConsole.tsx`, both `ListingCard` usages read:

```tsx
                <ListingCard key={l.id} listing={l} />
```

Replace both occurrences with:

```tsx
                <ListingCard key={l.id} listing={l} audience="restaurant" />
```

(There are two identical occurrences — update both.)

- [ ] **Step 2: Drop-off console**

In `app/dropoff/page.tsx`, both `ListingCard` usages read:

```tsx
              <ListingCard key={l.id} listing={l} />
```

Replace both occurrences with:

```tsx
              <ListingCard key={l.id} listing={l} audience="dropoff" />
```

- [ ] **Step 3: Drop-off detail page**

In `app/dropoffs/[id]/page.tsx`, both `ListingCard` usages read:

```tsx
              <ListingCard key={l.id} listing={l} />
```

Replace both occurrences with:

```tsx
              <ListingCard key={l.id} listing={l} audience="dropoff" />
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/RestaurantConsole.tsx app/dropoff/page.tsx "app/dropoffs/[id]/page.tsx"
git commit -m "Pass audience to listing cards on restaurant and drop-off surfaces"
```

---

### Task 3: Showcase the variants on `/styleguide`

**Files:**
- Modify: `app/styleguide/page.tsx`

- [ ] **Step 1: Add a demo listing constant**

In `app/styleguide/page.tsx`, after the existing `UNCLAIMABLE` constant:

```tsx
const UNCLAIMABLE = LISTINGS.filter((l) => l.status !== "open");
```

add:

```tsx
// A claimed listing (has source, drop-off, and a claimant) to show how the card
// reframes itself per audience.
const AUDIENCE_DEMO = LISTINGS.find((l) => l.status === "claimed") ?? LISTINGS[0];
```

- [ ] **Step 2: Add the audience showcase section**

In `app/styleguide/page.tsx`, immediately after the closing `</Section>` of the existing "Listing cards" section (the one whose hint starts "Volunteer view."), insert:

```tsx
      <Section
        title="Listing cards by audience"
        hint="One claimed listing seen by each account type. Volunteers get servings · distance and the claim affordance. Restaurants drop the meaningless distance and their own (redundant) source line, keeping the → drop-off destination. Drop-off admins drop the distance and the self-referential → drop-off line, and surface 'from {restaurant}' instead."
      >
        <div className="grid gap-6 md:grid-cols-3">
          <div>
            <p className="mb-2 font-mono text-[10px] uppercase tracking-wide text-neutral-500">
              volunteer
            </p>
            <ListingCard listing={AUDIENCE_DEMO} audience="volunteer" />
          </div>
          <div>
            <p className="mb-2 font-mono text-[10px] uppercase tracking-wide text-neutral-500">
              restaurant
            </p>
            <ListingCard listing={AUDIENCE_DEMO} audience="restaurant" />
          </div>
          <div>
            <p className="mb-2 font-mono text-[10px] uppercase tracking-wide text-neutral-500">
              drop-off
            </p>
            <ListingCard listing={AUDIENCE_DEMO} audience="dropoff" />
          </div>
        </div>
      </Section>
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Manual verification**

`/styleguide` is public (no auth). With `npm run dev` running, open `http://localhost:3000/styleguide` and find "Listing cards by audience":
- **volunteer** card shows `servings · {distance} away`, `from {source}`, and `→ {dropOff}`.
- **restaurant** card shows `servings` only (no distance), no source line, and keeps `→ {dropOff}`.
- **drop-off** card shows `servings` only, `from {source}`, and no `→ {dropOff}` line.

- [ ] **Step 5: Commit**

```bash
git add app/styleguide/page.tsx
git commit -m "Showcase role-aware listing card variants on styleguide"
```

---

## Final verification

- [ ] `npm test` — existing suite still passes (no card tests, but nothing should break).
- [ ] `npx tsc --noEmit` — clean.
- [ ] `/styleguide` shows the three variants as described.
- [ ] Authenticated per-role smoke: restaurant (`saxbys@campus.edu`) console cards show no distance/source; drop-off admin (`dropoff@campus.edu`) console cards show `from {restaurant}` and no `→ dropOff`; volunteer feed unchanged. (All passwords `password`.)

## Post-implementation (per project conventions)

- [ ] Open a PR for `feature/role-aware-listing-cards` (base: `feature/listings-redesign`, since this extends that card; it rides along with PR #4 to `integration/all-features`).
- [ ] Run the Obsidian wiki ingest (standing "commit → ingest" rule): update `subsystems/listings.md` to document the `audience` prop and the per-role card differences; append a dated entry to `log.md`.
- [ ] Note the deferred follow-up: real listing-management actions (restaurant cancel/edit/repost) as a separate feature.
