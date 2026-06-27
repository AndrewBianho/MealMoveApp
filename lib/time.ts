// Break a "minutes remaining" value into a days / hours / minutes countdown.
// Zero-value units are dropped so a short window reads "6m" and a longer one
// reads "2d 3h" or "1d 5m" — never a noisy "2d 0h 5m". Falls back to "0m" when
// nothing is left. `long` switches to worded, comma-joined prose for places
// with room ("2 days, 3 hours, 5 minutes"); default is the compact mono form
// used in the card/badge metadata.
export function formatTimeLeft(
  totalMinutes: number,
  opts?: { long?: boolean }
): string {
  const total = Math.max(0, Math.round(totalMinutes));
  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  const minutes = total % 60;

  const units: Array<{ value: number; abbr: string; word: string }> = [
    { value: days, abbr: "d", word: "day" },
    { value: hours, abbr: "h", word: "hour" },
    { value: minutes, abbr: "m", word: "minute" },
  ];

  let parts = units.filter((u) => u.value > 0);
  if (parts.length === 0) parts = [{ value: 0, abbr: "m", word: "minute" }];

  if (opts?.long) {
    return parts
      .map((u) => `${u.value} ${u.word}${u.value === 1 ? "" : "s"}`)
      .join(", ");
  }
  return parts.map((u) => `${u.value}${u.abbr}`).join(" ");
}
