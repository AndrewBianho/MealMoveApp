// Quiet hours: a volunteer's "don't ping me" window, as two local hours (0–23).
// One source of truth so the dispatch chokepoint, the escalation pass, and the
// settings UI agree. No per-user timezone is tracked — a single chapter-local
// clock is assumed (campus org), which keeps this honest and simple.

/**
 * Is `date` inside the quiet window? Both bounds must be set; a zero-length
 * window (start === end) is treated as off. Wraps midnight when start > end
 * (e.g. 22 → 7 covers 22:00–06:59). The window is [start, end): the end hour
 * itself is no longer quiet.
 */
export function quietHoursActive(
  start: number | null | undefined,
  end: number | null | undefined,
  date: Date
): boolean {
  if (start == null || end == null || start === end) return false;
  const h = date.getHours();
  return start < end ? h >= start && h < end : h >= start || h < end;
}

/** "10 PM" — a friendly label for an hour 0–23. */
export function formatHour(h: number): string {
  const norm = ((h % 24) + 24) % 24;
  const period = norm < 12 ? "AM" : "PM";
  const twelve = norm % 12 === 0 ? 12 : norm % 12;
  return `${twelve} ${period}`;
}

/** "10 PM – 7 AM", or null when quiet hours aren't set. */
export function describeQuietHours(
  start: number | null | undefined,
  end: number | null | undefined
): string | null {
  if (start == null || end == null || start === end) return null;
  return `${formatHour(start)} – ${formatHour(end)}`;
}
