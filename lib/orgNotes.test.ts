import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cleanOrgNotes,
  parseContactDate,
  toDateInputValue,
  CONTACT_MAX,
  QUIRKS_MAX,
} from "./orgNotes";

test("cleanOrgNotes: trims, bounds, and nulls empties", () => {
  const got = cleanOrgNotes({
    primaryContact: "  Maria, closing manager  ",
    contactInfo: "",
    lastContactDate: "2026-06-01",
    quirks: "  bring a cooler bag  ",
  });
  assert.equal(got.primaryContact, "Maria, closing manager");
  assert.equal(got.contactInfo, null);
  assert.equal(got.quirks, "bring a cooler bag");
  assert.equal(got.lastContactAt?.toISOString().slice(0, 10), "2026-06-01");
});

test("cleanOrgNotes: caps long fields and ignores wrong types", () => {
  const got = cleanOrgNotes({
    primaryContact: "x".repeat(500),
    contactInfo: 42,
    lastContactDate: "not-a-date",
    quirks: "y".repeat(5000),
  });
  assert.equal(got.primaryContact?.length, CONTACT_MAX);
  assert.equal(got.contactInfo, null);
  assert.equal(got.lastContactAt, null);
  assert.equal(got.quirks?.length, QUIRKS_MAX);
});

test("parseContactDate: empty / invalid → null", () => {
  assert.equal(parseContactDate(""), null);
  assert.equal(parseContactDate("   "), null);
  assert.equal(parseContactDate(null), null);
  assert.equal(parseContactDate("2026-13-99"), null);
});

test("toDateInputValue: round-trips a stored date, blank for null", () => {
  assert.equal(toDateInputValue(new Date("2026-06-01T00:00:00Z")), "2026-06-01");
  assert.equal(toDateInputValue(null), "");
  assert.equal(toDateInputValue(undefined), "");
});

// A contact date is a CALENDAR date ("when the org last spoke with them"), not
// an instant. It used to be parsed at the runtime's local midnight but read
// back with toISOString(), i.e. in UTC — so anywhere at or east of UTC the
// value round-tripped one day early (London stored 23:00Z the previous day).
// Production happens to run UTC on Vercel and was correct by luck; local dev in
// Europe or Asia was not. Anchoring both ends to UTC makes it a pure date.
// `TZ=Asia/Tokyo npx tsx --test lib/orgNotes.test.ts` must pass.

test("a contact date round-trips to the same calendar day in any timezone", () => {
  for (const day of ["2026-06-01", "2026-01-15", "2026-12-31"]) {
    assert.equal(
      toDateInputValue(parseContactDate(day)),
      day,
      `${day} must survive the round trip`,
    );
  }
});

test("a contact date is stored at UTC midnight, so it carries no local offset", () => {
  assert.equal(parseContactDate("2026-06-01")?.toISOString(), "2026-06-01T00:00:00.000Z");
});
