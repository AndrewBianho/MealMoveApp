// Recurrence helpers for a restaurant's standing surplus schedule. Pure and
// framework-free (no prisma) so they're shared by the server generator
// (lib/sweep materializeSchedules) and the client console preview. Times are
// resolved in server local time; daysOfWeek uses JS getDay(): 0 = Sunday … 6 =
// Saturday — so "daily" is all 7, "weekly" is a single day, and "specific days"
// is any subset.

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
    const day = new Date(now);
    day.setDate(day.getDate() + i);
    if (!days.has(day.getDay())) continue;
    const availableAt = new Date(day);
    availableAt.setHours(
      Math.floor(rule.timeOfDay / 60),
      rule.timeOfDay % 60,
      0,
      0
    );
    const expiresAt = new Date(
      availableAt.getTime() + rule.windowMinutes * 60_000
    );
    if (expiresAt <= now) continue; // window already fully passed
    out.push({ availableAt, expiresAt });
  }
  return out.sort((a, b) => a.availableAt.getTime() - b.availableAt.getTime());
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
