// Relationship-memory notes an org admin keeps on a restaurant or drop-off —
// the human know-how (contacts, quirks) that otherwise leaves when founders
// graduate. One sanitizer so the form, the server action, and any later display
// can't drift. Stored as fields on Restaurant / DropOff.

/** Longest free-text we keep — generous, but not unbounded. */
export const QUIRKS_MAX = 2000;
export const CONTACT_MAX = 200;

export interface OrgNotesInput {
  primaryContact?: unknown;
  contactInfo?: unknown;
  lastContactDate?: unknown; // "YYYY-MM-DD" from a <input type="date">, or ""
  quirks?: unknown;
}

export interface OrgNotes {
  primaryContact: string | null;
  contactInfo: string | null;
  lastContactAt: Date | null;
  quirks: string | null;
}

function clean(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Parse a date-only input ("YYYY-MM-DD") to a Date, or null if absent/invalid.
 *
 * Anchored at UTC midnight (note the trailing `Z`), because this is a CALENDAR
 * date — the day the org last spoke to someone — not an instant. Without it the
 * string parses at the *runtime's* midnight while `toDateInputValue` reads the
 * value back in UTC, so anywhere at or east of UTC the date round-tripped a day
 * early: London stored 23:00Z the previous day. Production runs UTC on Vercel
 * and was correct by luck; local dev in Europe or Asia was not.
 */
export function parseContactDate(value: unknown): Date | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const d = new Date(`${value.trim()}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Coerce an untrusted notes payload into the fields we store. */
export function cleanOrgNotes(input: OrgNotesInput): OrgNotes {
  return {
    primaryContact: clean(input.primaryContact, CONTACT_MAX),
    contactInfo: clean(input.contactInfo, CONTACT_MAX),
    lastContactAt: parseContactDate(input.lastContactDate),
    quirks: clean(input.quirks, QUIRKS_MAX),
  };
}

/**
 * "YYYY-MM-DD" for a stored date, for re-populating the date input. Reads in
 * UTC, matching where parseContactDate anchors it — keep the two in step.
 */
export function toDateInputValue(date: Date | null | undefined): string {
  if (!date) return "";
  return date.toISOString().slice(0, 10);
}
