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
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
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

// ── 12-hour helpers (the editor's time buttons + wheel picker) ──────────────
// Stored times are 24h "HH:MM"; the editing surface speaks 12h (1–12 · quarter
// hours · am/pm) since that's how a vendor thinks about a shift. Meridiem is the
// app's lower-case data token (matching "3:14 pm" in the type rules).

export type Meridiem = "am" | "pm";
export interface Time12 {
  h12: number; // 1–12
  min: number; // 0/15/30/45
  mer: Meridiem;
}

export function parseTime(hm: string): Time12 {
  const [h, m] = hm.split(":").map(Number);
  const mer: Meridiem = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return { h12, min: m, mer };
}

export function buildTime(h12: number, min: number, mer: Meridiem): string {
  const h = mer === "pm" ? (h12 % 12) + 12 : h12 % 12;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

// e.g. "11:00" → "11:00 am". Used on the time buttons and the picker preview.
export function to12h(hm: string): string {
  const { h12, min, mer } = parseTime(hm);
  return `${h12}:${String(min).padStart(2, "0")} ${mer}`;
}

// Snap a HH:MM to the nearest quarter hour — the picker only offers 00/15/30/45,
// so stored data with odd minutes lands on a real wheel stop when first opened.
export function snap15(hm: string): string {
  const [h, m] = hm.split(":").map(Number);
  const total = Math.min(Math.round((h * 60 + m) / 15) * 15, 23 * 60 + 45);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

// ── Per-day validation (for the editor's inline errors) ─────────────────────
// Mirrors validateRetrievalHours' rules but returns one human message per open
// day (first failure wins) so the editor can flag exactly the days to fix. The
// server still re-validates on save; this is only for immediate feedback.

export function validateDay(windows: HourWindow[]): string | null {
  for (const w of windows) {
    if (w.open >= w.close) return "Closing time must be after opening time";
  }
  const sorted = [...windows].sort((a, b) => a.open.localeCompare(b.open));
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].open < sorted[i - 1].close) return "These hours overlap — adjust them";
  }
  return null;
}

export function validateWeek(hours: RetrievalHours): Partial<Record<DayKey, string>> {
  const errors: Partial<Record<DayKey, string>> = {};
  for (const day of DAY_KEYS) {
    if (hours[day].length === 0) continue;
    const err = validateDay(hours[day]);
    if (err) errors[day] = err;
  }
  return errors;
}
