// Recurrence helpers for a restaurant's standing surplus schedule. Pure and
// framework-free (no prisma) so they're shared by the server generator
// (lib/sweep materializeSchedules) and the client console preview. Times are
// resolved in the org's home timezone (ORG_TIMEZONE) — a restaurant's
// "8:00 PM" means 8 PM on campus, no matter where the code runs. Resolving in
// server-local time made the deployed cron (UTC) and local/dev runs generate
// *different instants* for the same firing, duplicating every occurrence in
// the feed. daysOfWeek uses JS getDay(): 0 = Sunday … 6 = Saturday — so
// "daily" is all 7, "weekly" is a single day, and "specific days" is any
// subset, evaluated against the org-timezone calendar.

export const WEEKDAY_LABELS = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
] as const;

const WEEKDAYS = [1, 2, 3, 4, 5]; // Mon–Fri

/** Minutes-from-midnight (0–1439) → a friendly clock, e.g. 1200 → "8:00 PM". */
export function minutesToClock(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const period = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

/** A plain-language summary of when a schedule fires, for the console + cards. */
export function describeSchedule(daysOfWeek: number[], timeOfDay: number): string {
  const time = minutesToClock(timeOfDay);
  const set = new Set(daysOfWeek);
  if (set.size === 0) return `No days set`;
  if (set.size === 7) return `Every day at ${time}`;
  if (set.size === 5 && WEEKDAYS.every((d) => set.has(d))) {
    return `Weekdays at ${time}`;
  }
  const labels = Array.from(set)
    .sort((a, b) => a - b)
    .map((d) => WEEKDAY_LABELS[d]);
  return `${labels.join(", ")} at ${time}`;
}

/** Just the day cadence, no time — for compact card pills where the specific
 * next occurrence is shown separately: "every day", "weekdays", or "Mon, Wed". */
export function describeCadence(daysOfWeek: number[]): string {
  const set = new Set(daysOfWeek);
  if (set.size === 0) return "";
  if (set.size === 7) return "every day";
  if (set.size === 5 && WEEKDAYS.every((d) => set.has(d))) return "weekdays";
  return Array.from(set)
    .sort((a, b) => a - b)
    .map((d) => WEEKDAY_LABELS[d])
    .join(", ");
}

// How far ahead a recurring schedule reaches, everywhere: the sweep
// materializes (and prunes) listings to this horizon, and every listing view
// hides scheduled occurrences beyond it — so even rows written by an older,
// longer-horizon deploy never surface.
export const SCHEDULE_HORIZON_DAYS = 7;

export interface ScheduleRule {
  daysOfWeek: number[];
  timeOfDay: number; // minutes from local midnight
  windowMinutes: number;
}

/** One concrete future firing of a schedule. */
export interface Occurrence {
  availableAt: Date;
  expiresAt: Date;
}

/**
 * The schedule's firings whose pickup window has not fully elapsed, within
 * `horizonDays` of `now` (inclusive of today). Deterministic: seconds and ms are
 * zeroed, so re-running yields the same instants — the generator dedupes on
 * (recurringPostId, availableAt).
 */
export function occurrencesWithin(
  rule: ScheduleRule,
  horizonDays: number,
  now: Date = new Date()
): Occurrence[] {
  const days = new Set(rule.daysOfWeek);
  const out: Occurrence[] = [];
  for (let i = 0; i <= horizonDays; i++) {
    // The calendar date `i` days out, as the org's wall clock sees it.
    const { y, mo, d } = wallClock(new Date(now.getTime() + i * 86_400_000));
    // Weekday of a calendar date is timezone-free once the date is fixed.
    if (!days.has(new Date(Date.UTC(y, mo - 1, d)).getUTCDay())) continue;
    const availableAt = orgInstant(
      y,
      mo,
      d,
      Math.floor(rule.timeOfDay / 60),
      rule.timeOfDay % 60
    );
    const expiresAt = new Date(
      availableAt.getTime() + rule.windowMinutes * 60_000
    );
    if (expiresAt <= now) continue; // window already fully passed
    out.push({ availableAt, expiresAt });
  }
  return out.sort((a, b) => a.availableAt.getTime() - b.availableAt.getTime());
}

// The chapter's home timezone. The org is a single campus (Malvern, PA), so
// schedule wall-clock times all resolve here — if the app ever hosts chapters
// in other zones, this becomes a per-org setting.
export const ORG_TIMEZONE = "America/New_York";

/** What the org's wall clock/calendar reads at a given instant. */
function wallClock(instant: Date): {
  y: number;
  mo: number;
  d: number;
  h: number;
  mi: number;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ORG_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  // Intl renders midnight as "24" with hour12: false — normalize to 0.
  return { y: get("year"), mo: get("month"), d: get("day"), h: get("hour") % 24, mi: get("minute") };
}

/**
 * Calendar days from `from` to `to`, counted on the ORG's wall clock.
 *
 * Use this instead of `setHours(0,0,0,0)` for any "today / tomorrow" label.
 * That built-in reads the RUNTIME's midnight, so the same instant produces a
 * different answer on Vercel (UTC) than in the viewer's browser — which renders
 * different text on each side and trips a React hydration mismatch, besides
 * being wrong for anyone outside the org's zone.
 */
export function orgDayDiff(to: Date, from: Date): number {
  const a = wallClock(to);
  const b = wallClock(from);
  return Math.round(
    (Date.UTC(a.y, a.mo - 1, a.d) - Date.UTC(b.y, b.mo - 1, b.d)) / 86_400_000
  );
}

/** Weekday (0-6) as the org's calendar reads it, not the runtime's. */
export function orgWeekday(instant: Date): number {
  const w = wallClock(instant);
  return new Date(Date.UTC(w.y, w.mo - 1, w.d)).getUTCDay();
}

/** The instant at which the org's wall clock reads the given date and time. */
function orgInstant(y: number, mo: number, d: number, h: number, mi: number): Date {
  // Start from the same wall time read as UTC, then correct by the zone's
  // offset at that moment. Two passes so a DST boundary between the guess and
  // the target converges.
  const target = Date.UTC(y, mo - 1, d, h, mi, 0, 0);
  let guess = target;
  for (let i = 0; i < 2; i++) {
    const w = wallClock(new Date(guess));
    const asUtc = Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, 0, 0);
    guess += target - asUtc;
  }
  return new Date(guess);
}

/** Validate a day set: 1–7 distinct weekdays in 0–6. Returns a sorted copy. */
export function normalizeDaysOfWeek(input: unknown): number[] | null {
  if (!Array.isArray(input)) return null;
  const set = new Set<number>();
  for (const v of input) {
    const n = typeof v === "number" ? v : NaN;
    if (!Number.isInteger(n) || n < 0 || n > 6) return null;
    set.add(n);
  }
  if (set.size === 0) return null;
  return Array.from(set).sort((a, b) => a - b);
}
