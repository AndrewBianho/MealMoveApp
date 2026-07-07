import test from "node:test";
import assert from "node:assert/strict";
import { occurrencesWithin } from "./recurring";

// Schedules resolve in the org's timezone (America/New_York), not the
// server's — the deployed cron runs in UTC, and server-local resolution made
// it generate different instants than local runs, duplicating every
// occurrence. These assertions hold under any TZ.

const DAILY = { daysOfWeek: [0, 1, 2, 3, 4, 5, 6], timeOfDay: 20 * 60, windowMinutes: 120 };

test("resolves 8 PM as 8 PM Eastern regardless of server timezone", () => {
  // 11 AM EDT on Mon Jul 6, 2026. 8 PM EDT = midnight UTC the next day.
  const now = new Date("2026-07-06T15:00:00Z");
  const first = occurrencesWithin(DAILY, 7, now)[0];
  assert.equal(first.availableAt.toISOString(), "2026-07-07T00:00:00.000Z");
  assert.equal(first.expiresAt.toISOString(), "2026-07-07T02:00:00.000Z");
});

test("a daily schedule yields one occurrence per calendar day over the horizon", () => {
  const now = new Date("2026-07-06T15:00:00Z");
  const out = occurrencesWithin(DAILY, 7, now);
  assert.equal(out.length, 8); // today + 7 days, today's window not yet passed
  const gaps = out.slice(1).map((o, i) => o.availableAt.getTime() - out[i].availableAt.getTime());
  for (const g of gaps) assert.equal(g, 24 * 60 * 60_000);
});

test("crossing the DST boundary keeps the wall-clock time", () => {
  // US DST ends Sun Nov 1, 2026: 8 PM is EDT (UTC-4) on Oct 31, EST (UTC-5) on Nov 1.
  const now = new Date("2026-10-31T12:00:00Z");
  const [sat, sun] = occurrencesWithin(DAILY, 1, now);
  assert.equal(sat.availableAt.toISOString(), "2026-11-01T00:00:00.000Z");
  assert.equal(sun.availableAt.toISOString(), "2026-11-02T01:00:00.000Z");
});

test("daysOfWeek filters by the org-timezone calendar", () => {
  // 10 PM EDT Mon Jul 6 is already Tue Jul 7 in UTC; a Mondays-only schedule
  // must still see "today is Monday" (though tonight's window has passed).
  const now = new Date("2026-07-07T02:00:00Z");
  const rule = { ...DAILY, daysOfWeek: [1] }; // Mondays
  const out = occurrencesWithin(rule, 7, now);
  assert.equal(out[0].availableAt.toISOString(), "2026-07-14T00:00:00.000Z"); // next Mon 8 PM EDT
});

test("deterministic: re-running with a later now inside the same day dedupes", () => {
  const a = occurrencesWithin(DAILY, 7, new Date("2026-07-06T15:00:00Z"))[0];
  const b = occurrencesWithin(DAILY, 7, new Date("2026-07-06T18:45:11Z"))[0];
  assert.equal(a.availableAt.getTime(), b.availableAt.getTime());
});
