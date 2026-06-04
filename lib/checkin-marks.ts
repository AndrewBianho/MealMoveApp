// Pure timing logic for check-up confirmations. No I/O — runs on both server
// and client and is the single source of truth for the 15-min hold and the
// 5/10-min nudge marks (used by the cron dispatcher and the UI prompt alike).

export const HOLD_MINUTES = 15;
export const CHECK_IN_MARKS = [5, 10] as const; // minutes after claim to nudge

const MIN = 60_000;

/** How many nudge marks have elapsed since the claim (0–2). Drives the cron. */
export function dueNudgeCount(claimedAtMs: number, nowMs: number): number {
  const elapsedMin = (nowMs - claimedAtMs) / MIN;
  return CHECK_IN_MARKS.filter((m) => elapsedMin >= m).length;
}

/**
 * The nudge mark (in minutes) to prompt the volunteer with right now, or null
 * if none is pending. A mark is pending when its time has passed and the
 * volunteer hasn't confirmed since then. The most recent pending mark wins.
 */
export function activeMark(
  claimedAtMs: number,
  lastCheckInAtMs: number | null,
  nowMs: number
): number | null {
  for (let i = CHECK_IN_MARKS.length - 1; i >= 0; i--) {
    const mark = CHECK_IN_MARKS[i];
    const markTime = claimedAtMs + mark * MIN;
    const passed = nowMs >= markTime;
    const unconfirmed = lastCheckInAtMs === null || lastCheckInAtMs < markTime;
    if (passed && unconfirmed) return mark;
  }
  return null;
}

/** Milliseconds left until the 15-min auto-release, formatted "M:SS". */
export function formatCountdown(remainingMs: number): string {
  const totalSec = Math.floor(Math.max(0, remainingMs) / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}
