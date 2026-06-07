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
