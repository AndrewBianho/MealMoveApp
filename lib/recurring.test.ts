import test from "node:test";
import assert from "node:assert/strict";
import { occurrencesWithin, orgDayDiff, orgWeekday } from "./recurring";

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

// --- org-timezone relative day labels -------------------------------------
// Regression: RecurringPostManager's "next today/tomorrow …" label derived the
// day with setHours(0,0,0,0) and getDay(), both RUNTIME-local. Vercel renders in
// UTC and the browser renders in the viewer's zone, so the two produced
// different text and React threw a hydration mismatch (#418) every evening.
// These assert the org's calendar, so the answer cannot depend on where the
// code runs: `TZ=Asia/Tokyo npx tsx --test lib/recurring.test.ts` must pass.

test("orgDayDiff counts calendar days in the org timezone, not the runtime's", () => {
  // 01:30 UTC on the 4th is still 21:30 EDT on the 3rd — the case that broke.
  const evening = new Date("2026-08-04T01:30:00Z");
  const nextMorning = new Date("2026-08-04T13:00:00Z"); // 09:00 EDT on the 4th
  assert.equal(orgDayDiff(nextMorning, evening), 1, "should read as tomorrow");

  const sameOrgDay = new Date("2026-08-03T22:00:00Z"); // 18:00 EDT on the 3rd
  assert.equal(orgDayDiff(sameOrgDay, evening), 0, "should read as today");
});

test("orgWeekday reads the weekday from the org calendar", () => {
  // 01:30 UTC Tue 4 Aug 2026 is Mon 3 Aug in New York.
  assert.equal(orgWeekday(new Date("2026-08-04T01:30:00Z")), 1, "Monday");
  assert.equal(orgWeekday(new Date("2026-08-04T13:00:00Z")), 2, "Tuesday");
});
