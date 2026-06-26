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
