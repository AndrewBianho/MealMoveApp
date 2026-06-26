// The food-safety checklist a volunteer acknowledges at the pickup-proof step.
// One source of truth for the questions, so the form, the server sanitizer, and
// any later display can't drift apart. Answers are stored on Pickup.safetyChecklist.

export interface SafetyQuestion {
  key: string;
  /** Short, plain-language prompt shown to the volunteer. */
  label: string;
}

export const SAFETY_QUESTIONS: readonly SafetyQuestion[] = [
  { key: "tempKept", label: "Kept hot or cold as it needs to be" },
  { key: "underTwoHours", label: "Out of temperature for under 2 hours" },
  { key: "sealed", label: "Packaging is sealed and intact" },
];

export type SafetyAnswers = Record<string, boolean>;

/**
 * Keep only known questions and coerce each answer to a boolean. Returns null
 * for an empty/garbage payload so callers can store "no checklist" cleanly.
 */
export function cleanSafetyAnswers(input: unknown): SafetyAnswers | null {
  if (!input || typeof input !== "object") return null;
  const out: SafetyAnswers = {};
  for (const q of SAFETY_QUESTIONS) {
    const v = (input as Record<string, unknown>)[q.key];
    if (typeof v === "boolean") out[q.key] = v;
  }
  return Object.keys(out).length > 0 ? out : null;
}
