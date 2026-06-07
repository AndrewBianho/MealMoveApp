# Drop-off Retrieval Hours Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let drop-off admins set structured, multi-window-per-day food-retrieval hours, and surface them — with a live "open now / closed" badge — on the drop-off console, the drop-off detail page, and the volunteer's listing detail.

**Architecture:** A nullable `retrievalHours` JSON column on `DropOff` holds `Record<DayKey, HourWindow[]>`. A pure, unit-tested `lib/hours.ts` owns validation, the "open now" computation (fixed app timezone via `Intl`), and formatting. A `RetrievalHoursEditor` (client) writes via a role-guarded `updateRetrievalHours` server action; a reusable `RetrievalHoursDisplay` + `OpenNowBadge` renders read-only on three surfaces.

**Tech Stack:** Next.js 14 App Router (server + client components), TypeScript, Prisma/PostgreSQL (Supabase), Tailwind, NextAuth (`auth()`), `node:test`.

---

## File Structure

- `prisma/schema.prisma` — **Modify.** Add `retrievalHours Json?` to `DropOff`.
- `lib/hours.ts` — **Create.** Types (`DayKey`, `HourWindow`, `RetrievalHours`), `validateRetrievalHours`, `parseStoredHours`, `isOpenNow`, `currentDayKey`, `formatWindow`, `formatDay`, `DAY_KEYS`, `DAY_LABELS`, `APP_TIMEZONE`.
- `lib/hours.test.ts` — **Create.** Unit tests for validation + open-now.
- `lib/types.ts` — **Modify.** `Listing.dropOffHours?` and `DropOffLocation.retrievalHours?`.
- `lib/listings.ts` — **Modify.** Map `dropOffHours` in `serializeListing`.
- `lib/map.ts` — **Modify.** Map `retrievalHours` in `getDropOffs` and `getMapData`.
- `app/actions.ts` — **Modify.** Add `updateRetrievalHours` server action.
- `components/RetrievalHoursDisplay.tsx` — **Create.** Pure display + `OpenNowBadge`.
- `components/RetrievalHoursEditor.tsx` — **Create.** Client editor.
- `app/dropoff/page.tsx` — **Modify.** Add the editor to each location card.
- `app/dropoffs/[id]/page.tsx` — **Modify.** Add the read-only display.
- `components/ListingDetail.tsx` — **Modify.** Add badge + today's window to the drop-off row.
- `lib/mock.ts` — **Modify.** Add `retrievalHours` to the `DROP_OFFS` type + entries.
- `prisma/seed.ts` — **Modify.** Persist `retrievalHours` when present.

Only `lib/**` has a unit-test harness (test glob `lib/**/*.test.ts`), so the editor, display, action, and pages are verified by `npx tsc --noEmit` + a manual check; their core logic lives in the tested `lib/hours.ts`.

> **Note (dev server):** Do not run `npm run build` while `next dev` is running — it clobbers `.next` and 404s CSS/JS. Use `npx tsc --noEmit` to typecheck. `prisma migrate dev` and `prisma db seed` are safe to run alongside dev.

---

### Task 1: Schema + migration

**Files:**
- Modify: `prisma/schema.prisma` (the `DropOff` model)

- [ ] **Step 1: Add the column**

In `prisma/schema.prisma`, inside `model DropOff`, add the field right after `notes`:

```prisma
  notes              String? // human-readable restrictions (allergens, hours…)
  retrievalHours     Json? // RetrievalHours: per-weekday food-retrieval windows (see lib/hours.ts)
```

- [ ] **Step 2: Create and apply the migration**

Run: `npx prisma migrate dev --name dropoff_retrieval_hours`
Expected: a new folder under `prisma/migrations/` and "Your database is now in sync with your schema." The Prisma Client regenerates automatically.

- [ ] **Step 3: Verify the client type**

Run: `npx tsc --noEmit`
Expected: PASS (no new errors). `prisma.dropOff` now has a `retrievalHours` field of type `Prisma.JsonValue | null`.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "Add retrievalHours column to DropOff"
```

---

### Task 2: `lib/hours.ts` (pure logic, TDD)

**Files:**
- Create: `lib/hours.ts`
- Test: `lib/hours.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/hours.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateRetrievalHours,
  parseStoredHours,
  isOpenNow,
  currentDayKey,
  formatDay,
} from "./hours";

const TZ = "America/New_York";
// 2026-06-08 is a Monday; June is EDT (UTC-4), so NY local = UTC - 4h.
const monNY = (h: number, m = 0) => Date.UTC(2026, 5, 8, h + 4, m); // Mon HH:MM NY
const tueNY = (h: number, m = 0) => Date.UTC(2026, 5, 9, h + 4, m); // Tue HH:MM NY

const WEEK = {
  mon: [
    { open: "09:00", close: "12:00" },
    { open: "13:00", close: "17:00" },
  ],
  // tue intentionally omitted → closed
};

test("validateRetrievalHours accepts a valid week and normalizes to 7 keys", () => {
  const res = validateRetrievalHours(WEEK);
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.deepEqual(res.hours.mon, WEEK.mon);
  assert.deepEqual(res.hours.tue, []); // missing day normalized to closed
  assert.deepEqual(res.hours.sun, []);
});

test("validateRetrievalHours rejects bad time format", () => {
  const res = validateRetrievalHours({ mon: [{ open: "9:00", close: "17:00" }] });
  assert.equal(res.ok, false);
});

test("validateRetrievalHours rejects open >= close", () => {
  const res = validateRetrievalHours({ mon: [{ open: "17:00", close: "17:00" }] });
  assert.equal(res.ok, false);
});

test("validateRetrievalHours rejects overlapping windows", () => {
  const res = validateRetrievalHours({
    mon: [
      { open: "09:00", close: "12:00" },
      { open: "11:00", close: "13:00" },
    ],
  });
  assert.equal(res.ok, false);
});

test("validateRetrievalHours rejects an unknown day key", () => {
  const res = validateRetrievalHours({ funday: [] });
  assert.equal(res.ok, false);
});

test("validateRetrievalHours rejects more than 4 windows in a day", () => {
  const res = validateRetrievalHours({
    mon: [
      { open: "00:00", close: "01:00" },
      { open: "02:00", close: "03:00" },
      { open: "04:00", close: "05:00" },
      { open: "06:00", close: "07:00" },
      { open: "08:00", close: "09:00" },
    ],
  });
  assert.equal(res.ok, false);
});

test("parseStoredHours returns null for unset and an object for valid", () => {
  assert.equal(parseStoredHours(null), null);
  assert.equal(parseStoredHours(undefined), null);
  const parsed = parseStoredHours(WEEK);
  assert.ok(parsed && parsed.mon.length === 2);
});

test("isOpenNow handles windows, gaps, boundaries, and closed days", () => {
  const { hours } = validateRetrievalHours(WEEK) as { ok: true; hours: any };
  assert.equal(isOpenNow(hours, monNY(10), TZ), true); // inside first window
  assert.equal(isOpenNow(hours, monNY(12), TZ), false); // in the midday gap (close exclusive)
  assert.equal(isOpenNow(hours, monNY(9), TZ), true); // open boundary inclusive
  assert.equal(isOpenNow(hours, monNY(17), TZ), false); // close boundary exclusive
  assert.equal(isOpenNow(hours, monNY(15), TZ), true); // inside second window
  assert.equal(isOpenNow(hours, tueNY(10), TZ), false); // closed day
  assert.equal(isOpenNow(null, monNY(10), TZ), false); // unset
});

test("currentDayKey and formatDay produce display values", () => {
  assert.equal(currentDayKey(monNY(10), TZ), "mon");
  const { hours } = validateRetrievalHours(WEEK) as { ok: true; hours: any };
  assert.equal(formatDay(hours.mon), "09:00–12:00, 13:00–17:00");
  assert.equal(formatDay(hours.tue), "closed");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `./hours` cannot be imported (module not found).

- [ ] **Step 3: Implement `lib/hours.ts`**

Create `lib/hours.ts`:

```ts
// Structured food-retrieval hours for a drop-off: multiple windows per weekday.
// Pure logic — validation, "open now" (in one fixed timezone), and formatting —
// so it's the single source of truth shared by the action, editor, and display.

export const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type DayKey = (typeof DAY_KEYS)[number];

export interface HourWindow {
  open: string; // "HH:MM", 24-hour
  close: string; // "HH:MM", 24-hour
}

export type RetrievalHours = Record<DayKey, HourWindow[]>; // empty/missing day = closed

export const DAY_LABELS: Record<DayKey, string> = {
  mon: "mon",
  tue: "tue",
  wed: "wed",
  thu: "thu",
  fri: "fri",
  sat: "sat",
  sun: "sun",
};

// All hours are interpreted in this one timezone (campus-local).
export const APP_TIMEZONE = process.env.APP_TIMEZONE ?? "America/New_York";

const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_WINDOWS_PER_DAY = 4;

function emptyWeek(): RetrievalHours {
  return { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] };
}

export type ValidationResult =
  | { ok: true; hours: RetrievalHours }
  | { ok: false; error: string };

export function validateRetrievalHours(raw: unknown): ValidationResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, error: "Hours must be an object keyed by weekday." };
  }
  const out = emptyWeek();
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!(DAY_KEYS as readonly string[]).includes(key)) {
      return { ok: false, error: `Unknown day "${key}".` };
    }
    if (!Array.isArray(value)) {
      return { ok: false, error: `${key} must be a list of windows.` };
    }
    if (value.length > MAX_WINDOWS_PER_DAY) {
      return { ok: false, error: `${key} has too many windows (max ${MAX_WINDOWS_PER_DAY}).` };
    }
    const windows: HourWindow[] = [];
    for (const w of value) {
      if (typeof w !== "object" || w === null) {
        return { ok: false, error: `${key} has an invalid window.` };
      }
      const { open, close } = w as { open?: unknown; close?: unknown };
      if (
        typeof open !== "string" ||
        typeof close !== "string" ||
        !HM.test(open) ||
        !HM.test(close)
      ) {
        return { ok: false, error: `${key} has a time that isn't HH:MM.` };
      }
      if (open >= close) {
        return { ok: false, error: `${key}: ${open}–${close} must open before it closes.` };
      }
      windows.push({ open, close });
    }
    windows.sort((a, b) => a.open.localeCompare(b.open));
    for (let i = 1; i < windows.length; i++) {
      if (windows[i].open < windows[i - 1].close) {
        return { ok: false, error: `${key} has overlapping windows.` };
      }
    }
    out[key as DayKey] = windows;
  }
  return { ok: true, hours: out };
}

// Turn a stored JSON value (Prisma.JsonValue | null) into typed hours, or null
// when unset/invalid. Stored data is written through the validator, so invalid
// is only defensive.
export function parseStoredHours(raw: unknown): RetrievalHours | null {
  if (raw == null) return null;
  const res = validateRetrievalHours(raw);
  return res.ok ? res.hours : null;
}

// The weekday in `tz` at instant `now`, as a DayKey.
export function currentDayKey(now: number = Date.now(), tz: string = APP_TIMEZONE): DayKey {
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" })
    .format(new Date(now))
    .toLowerCase();
  return wd as DayKey;
}

// Is the location open at instant `now`, interpreting windows in `tz`?
export function isOpenNow(
  hours: RetrievalHours | null,
  now: number = Date.now(),
  tz: string = APP_TIMEZONE
): boolean {
  if (!hours) return false;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(now));
  const day = (parts.find((p) => p.type === "weekday")?.value ?? "").toLowerCase() as DayKey;
  if (!(DAY_KEYS as readonly string[]).includes(day)) return false;
  const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  const hm = `${hour}:${minute}`;
  return (hours[day] ?? []).some((w) => w.open <= hm && hm < w.close);
}

export function formatWindow(w: HourWindow): string {
  return `${w.open}–${w.close}`;
}

export function formatDay(windows: HourWindow[]): string {
  return windows.length ? windows.map(formatWindow).join(", ") : "closed";
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — all `lib/hours.test.ts` tests green; existing tests still pass.

- [ ] **Step 5: Commit**

```bash
git add lib/hours.ts lib/hours.test.ts
git commit -m "Add lib/hours: retrieval-hours validation, open-now, formatting"
```

---

### Task 3: `updateRetrievalHours` server action

**Files:**
- Modify: `app/actions.ts`

- [ ] **Step 1: Add the import**

`app/actions.ts` already imports `Prisma` (`import { Prisma } from "@prisma/client";`). Add a hours import near the other `@/lib` imports:

```ts
import { validateRetrievalHours } from "@/lib/hours";
```

- [ ] **Step 2: Add the action**

Append after the existing `updateDropOffNotes` function in `app/actions.ts`:

```ts
/** A drop-off admin sets the structured food-retrieval hours for a location. */
export async function updateRetrievalHours(
  dropOffId: string,
  hours: unknown
): Promise<SignUpResult> {
  const session = await auth();
  const role = session?.user?.role;
  if (role !== "drop_off_admin" && role !== "org_admin") {
    return { ok: false, error: "Only drop-off admins can edit this." };
  }
  const res = validateRetrievalHours(hours);
  if (!res.ok) return { ok: false, error: res.error };
  await prisma.dropOff.update({
    where: { id: dropOffId },
    data: { retrievalHours: res.hours as unknown as Prisma.InputJsonValue },
  });
  revalidatePath("/dropoff");
  revalidatePath(`/dropoffs/${dropOffId}`);
  revalidatePath("/");
  revalidatePath("/map");
  return { ok: true };
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/actions.ts
git commit -m "Add updateRetrievalHours server action"
```

---

### Task 4: `RetrievalHoursDisplay` + `OpenNowBadge`

**Files:**
- Create: `components/RetrievalHoursDisplay.tsx`

- [ ] **Step 1: Create the component**

Create `components/RetrievalHoursDisplay.tsx`:

```tsx
import { cn } from "./cn";
import {
  DAY_KEYS,
  DAY_LABELS,
  formatDay,
  isOpenNow,
  type RetrievalHours,
} from "@/lib/hours";

// Open/closed status. Color-blind-safe: a dot + the literal label, never hue
// alone (sage = open, neutral = closed).
export function OpenNowBadge({ hours }: { hours: RetrievalHours | null }) {
  const open = isOpenNow(hours);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide",
        open ? "bg-rescued-50 text-rescued-800" : "bg-neutral-100 text-neutral-600"
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          open ? "bg-rescued-600" : "bg-neutral-400"
        )}
      />
      {open ? "open now" : "closed"}
    </span>
  );
}

// Read-only weekly hours table + the open-now badge. Reused on the drop-off
// console, the drop-off detail page, and (the badge) the listing detail.
export function RetrievalHoursDisplay({ hours }: { hours: RetrievalHours | null }) {
  if (!hours) {
    return (
      <p className="text-xs italic text-neutral-400">Retrieval hours not set yet.</p>
    );
  }
  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <p className="font-mono text-[10px] uppercase tracking-wide text-neutral-600">
          retrieval hours
        </p>
        <OpenNowBadge hours={hours} />
      </div>
      <ul className="space-y-0.5">
        {DAY_KEYS.map((d) => (
          <li key={d} className="flex justify-between gap-4 font-mono text-xs">
            <span className="text-neutral-500">{DAY_LABELS[d]}</span>
            <span className="text-neutral-700">{formatDay(hours[d])}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add components/RetrievalHoursDisplay.tsx
git commit -m "Add RetrievalHoursDisplay and OpenNowBadge"
```

---

### Task 5: `RetrievalHoursEditor`

**Files:**
- Create: `components/RetrievalHoursEditor.tsx`

- [ ] **Step 1: Create the component**

Create `components/RetrievalHoursEditor.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { Button } from "./Button";
import { Toast, useToast } from "./Toast";
import { RetrievalHoursDisplay } from "./RetrievalHoursDisplay";
import { updateRetrievalHours } from "@/app/actions";
import {
  DAY_KEYS,
  DAY_LABELS,
  parseStoredHours,
  type DayKey,
  type RetrievalHours,
} from "@/lib/hours";

function emptyWeek(): RetrievalHours {
  return { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] };
}

// Lets a drop-off admin set multi-window food-retrieval hours. Mirrors the
// DropOffNotesEditor pattern (useState + useTransition + Toast).
export function RetrievalHoursEditor({
  dropOffId,
  initialHours,
}: {
  dropOffId: string;
  initialHours: unknown;
}) {
  const parsed = parseStoredHours(initialHours);
  const [hours, setHours] = useState<RetrievalHours>(parsed ?? emptyWeek());
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { message, show } = useToast();

  function addWindow(day: DayKey) {
    setHours((h) => ({ ...h, [day]: [...h[day], { open: "09:00", close: "17:00" }] }));
  }
  function removeWindow(day: DayKey, i: number) {
    setHours((h) => ({ ...h, [day]: h[day].filter((_, idx) => idx !== i) }));
  }
  function setTime(day: DayKey, i: number, field: "open" | "close", value: string) {
    setHours((h) => ({
      ...h,
      [day]: h[day].map((w, idx) => (idx === i ? { ...w, [field]: value } : w)),
    }));
  }

  function save() {
    startTransition(async () => {
      const res = await updateRetrievalHours(dropOffId, hours);
      if (res.ok) {
        setEditing(false);
        show("Retrieval hours updated.");
      } else {
        show(res.error);
      }
    });
  }

  if (!editing) {
    return (
      <div className="mt-3">
        <RetrievalHoursDisplay hours={parsed} />
        <button
          onClick={() => setEditing(true)}
          className="mt-1 text-xs font-medium text-rescued-600 hover:underline"
        >
          {parsed ? "Edit retrieval hours" : "Set your retrieval hours"}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3">
      <div className="space-y-2">
        {DAY_KEYS.map((day) => (
          <div key={day} className="flex items-start gap-2">
            <span className="w-10 pt-1.5 font-mono text-xs uppercase text-neutral-500">
              {DAY_LABELS[day]}
            </span>
            <div className="flex flex-1 flex-wrap items-center gap-2">
              {hours[day].length === 0 && (
                <span className="py-1.5 font-mono text-xs italic text-neutral-400">
                  closed
                </span>
              )}
              {hours[day].map((w, i) => (
                <span key={i} className="inline-flex items-center gap-1">
                  <input
                    type="time"
                    value={w.open}
                    onChange={(e) => setTime(day, i, "open", e.target.value)}
                    className="rounded-md border border-neutral-200/60 bg-white px-2 py-1 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-transit-400"
                  />
                  <span className="text-neutral-400">–</span>
                  <input
                    type="time"
                    value={w.close}
                    onChange={(e) => setTime(day, i, "close", e.target.value)}
                    className="rounded-md border border-neutral-200/60 bg-white px-2 py-1 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-transit-400"
                  />
                  <button
                    type="button"
                    aria-label={`Remove ${day} window`}
                    onClick={() => removeWindow(day, i)}
                    className="px-1 text-neutral-400 hover:text-failed-600"
                  >
                    ×
                  </button>
                </span>
              ))}
              {hours[day].length < 4 && (
                <button
                  type="button"
                  onClick={() => addWindow(day)}
                  className="rounded-full px-2 py-1 font-mono text-xs text-rescued-600 hover:underline"
                >
                  + add
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <Button variant="primary" onClick={save} disabled={isPending}>
          {isPending ? "Saving…" : "Save"}
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            setHours(parsed ?? emptyWeek());
            setEditing(false);
          }}
          disabled={isPending}
        >
          Cancel
        </Button>
      </div>
      <Toast message={message} />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add components/RetrievalHoursEditor.tsx
git commit -m "Add RetrievalHoursEditor client component"
```

---

### Task 6: Wire types + data plumbing + surfaces

**Files:**
- Modify: `lib/types.ts`, `lib/listings.ts`, `lib/map.ts`, `app/dropoff/page.tsx`, `app/dropoffs/[id]/page.tsx`, `components/ListingDetail.tsx`

- [ ] **Step 1: Extend the types**

In `lib/types.ts`, add an import at the top (with the other imports):

```ts
import type { RetrievalHours } from "./hours";
```

In the `Listing` interface, add after `dropOff?: string;`:

```ts
  /** The drop-off's structured retrieval hours, for the open-now badge. */
  dropOffHours?: RetrievalHours;
```

In the `DropOffLocation` interface, add after `notes?: string;`:

```ts
  retrievalHours?: RetrievalHours;
```

- [ ] **Step 2: Map `dropOffHours` in the listing serializer**

In `lib/listings.ts`, add the import:

```ts
import { parseStoredHours } from "./hours";
```

In `serializeListing`, add after the `dropOff: l.dropOff?.name ?? undefined,` line:

```ts
    dropOffHours: parseStoredHours(l.dropOff?.retrievalHours) ?? undefined,
```

(`listingInclude` already uses `dropOff: true`, so `l.dropOff.retrievalHours` is present after the migration — no include change needed.)

- [ ] **Step 3: Map `retrievalHours` in the map helpers**

In `lib/map.ts`, add the import:

```ts
import { parseStoredHours } from "./hours";
```

In **both** `getMapData`'s `mapDropOffs` map and `getDropOffs`'s map, add after the `notes: d.notes ?? undefined,` line (in each):

```ts
    retrievalHours: parseStoredHours(d.retrievalHours) ?? undefined,
```

- [ ] **Step 4: Add the editor to the drop-off console card**

In `app/dropoff/page.tsx`, add the import near the top:

```ts
import { RetrievalHoursEditor } from "@/components/RetrievalHoursEditor";
```

Replace the existing notes-editor line:

```tsx
              <DropOffNotesEditor dropOffId={d.id} initialNotes={d.notes ?? ""} />
```

with:

```tsx
              <DropOffNotesEditor dropOffId={d.id} initialNotes={d.notes ?? ""} />
              <RetrievalHoursEditor dropOffId={d.id} initialHours={d.retrievalHours} />
```

- [ ] **Step 5: Add the read-only display to the drop-off detail page**

In `app/dropoffs/[id]/page.tsx`, add imports near the top:

```ts
import { RetrievalHoursDisplay } from "@/components/RetrievalHoursDisplay";
import { parseStoredHours } from "@/lib/hours";
```

Inside the white info `<section className="mb-8 rounded-xl border border-neutral-200/40 bg-white p-5">` (the block right after the header), add at the end of that section, before its closing `</section>`:

```tsx
        <div className="mt-4 border-t border-neutral-200/40 pt-4">
          <RetrievalHoursDisplay hours={parseStoredHours(dropOff.retrievalHours)} />
        </div>
```

(`getDropOffDetail` returns the raw `dropOff` row, so `dropOff.retrievalHours` exists after the migration.)

- [ ] **Step 6: Add the badge + today's window to the listing detail drop-off row**

In `components/ListingDetail.tsx`, add imports near the top (with the other component/lib imports):

```ts
import { OpenNowBadge } from "./RetrievalHoursDisplay";
import { currentDayKey, formatDay } from "@/lib/hours";
```

Replace the existing drop-off `MetaRow` block:

```tsx
              {listing.dropOff && (
                <MetaRow icon={<MapPin />}>→ drop at {listing.dropOff}</MetaRow>
              )}
```

with:

```tsx
              {listing.dropOff && (
                <MetaRow icon={<MapPin />}>
                  → drop at {listing.dropOff}
                  {listing.dropOffHours && (
                    <span className="ml-2 inline-flex items-center gap-2 align-middle">
                      <OpenNowBadge hours={listing.dropOffHours} />
                      <span className="font-mono text-xs text-neutral-500">
                        today {formatDay(listing.dropOffHours[currentDayKey()])}
                      </span>
                    </span>
                  )}
                </MetaRow>
              )}
```

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS — no type errors across types, serializer, map, and the three surfaces.

- [ ] **Step 8: Commit**

```bash
git add lib/types.ts lib/listings.ts lib/map.ts app/dropoff/page.tsx app/dropoffs/[id]/page.tsx components/ListingDetail.tsx
git commit -m "Surface retrieval hours on console, detail, and listing pages"
```

---

### Task 7: Seed demo hours

**Files:**
- Modify: `lib/mock.ts`, `prisma/seed.ts`

- [ ] **Step 1: Extend the mock type and add hours to entries**

In `lib/mock.ts`, add the import at the top (with the existing imports):

```ts
import type { RetrievalHours } from "./hours";
```

In the `DROP_OFFS` array type, add `retrievalHours` to the object type:

```ts
export const DROP_OFFS: {
  name: string;
  acceptedCategories: FoodCategory[];
  refrigerated: boolean;
  capacity: number;
  notes: string;
  lat: number;
  lng: number;
  retrievalHours?: RetrievalHours;
}[] = [
```

Add a `retrievalHours` field to the first two entries. For **"Community Fridge — 4th & Elm"**, after its `lng:` line (inside that object):

```ts
    retrievalHours: {
      mon: [{ open: "08:00", close: "20:00" }],
      tue: [{ open: "08:00", close: "20:00" }],
      wed: [{ open: "08:00", close: "20:00" }],
      thu: [{ open: "08:00", close: "20:00" }],
      fri: [{ open: "08:00", close: "20:00" }],
      sat: [{ open: "10:00", close: "16:00" }],
      sun: [],
    },
```

For **"St. Mark's Shelter"**, after its `lng:` line (a midday-gap, multi-window example):

```ts
    retrievalHours: {
      mon: [{ open: "11:00", close: "14:00" }, { open: "17:00", close: "19:00" }],
      tue: [{ open: "11:00", close: "14:00" }, { open: "17:00", close: "19:00" }],
      wed: [{ open: "11:00", close: "14:00" }, { open: "17:00", close: "19:00" }],
      thu: [{ open: "11:00", close: "14:00" }, { open: "17:00", close: "19:00" }],
      fri: [{ open: "11:00", close: "14:00" }, { open: "17:00", close: "19:00" }],
      sat: [],
      sun: [],
    },
```

(Leave the remaining drop-offs without hours, to exercise the "not set yet" state.)

- [ ] **Step 2: Persist hours in the seed**

In `prisma/seed.ts`, in the `prisma.dropOff.create` call, add the field to `data` using a conditional spread (so unset drop-offs stay `null`). Change the `data` object so it ends:

```ts
        capacity: d.capacity,
        notes: d.notes,
        ...(d.retrievalHours ? { retrievalHours: d.retrievalHours } : {}),
```

- [ ] **Step 3: Re-seed the database**

Run: `npx prisma db seed`
Expected: completes without error (it wipes and reseeds; dev-only).

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Manual verification**

With `npm run dev` running:
- As a **drop-off admin** (`dropoff@campus.edu` / `password`), open `/dropoff`: each location card shows the hours (or "Set your retrieval hours"); the editor adds/removes windows per day and saves with a toast; "Community Fridge" shows the open-now badge.
- Open a `/dropoffs/[id]` page: the weekly hours table + open-now badge render.
- As a **volunteer**, open a listing whose drop-off has hours: the drop-off row shows the open-now badge and "today …".

- [ ] **Step 6: Commit**

```bash
git add lib/mock.ts prisma/seed.ts
git commit -m "Seed demo retrieval hours for drop-offs"
```

---

## Final verification

- [ ] `npm test` — all tests pass (including new `lib/hours.test.ts`).
- [ ] `npx tsc --noEmit` — clean.
- [ ] Manual smoke per Task 7 Step 5: edit/save hours as an admin, see the table + open-now badge on the detail page, and the badge on a volunteer's listing detail.

## Post-implementation (per project conventions)

- [ ] Open a PR for `feature/dropoff-retrieval-hours` (base: `integration/all-features`).
- [ ] Run the Obsidian wiki ingest (standing "commit → ingest" rule): update `subsystems/drop-offs.md` (new hours model + open-now), note the `lib/hours.ts` source of truth, and append a dated entry to `log.md`.
