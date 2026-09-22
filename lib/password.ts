// Single source of truth for password rules, shared by the client checklist
// (PasswordField) and server validation (registerUser / resetPassword) so the
// two can never drift. Add a rule here and it shows up live AND is enforced.

export interface PasswordRule {
  id: string;
  label: string;
  test: (password: string) => boolean;
}

export const PASSWORD_RULES: PasswordRule[] = [
  { id: "len", label: "8+ characters", test: (p) => p.length >= 8 },
  { id: "upper", label: "1 uppercase", test: (p) => /[A-Z]/.test(p) },
  { id: "number", label: "1 number", test: (p) => /[0-9]/.test(p) },
];

/** True when every rule passes — the same check the server enforces. */
export function passwordValid(password: string): boolean {
  return PASSWORD_RULES.every((r) => r.test(password));
}

/**
 * The rejection message, built from the rules themselves. The four call sites
 * that used to spell it out by hand would have kept saying "8+ characters with
 * an uppercase letter and a number" after a fourth rule was added here — the
 * checklist would show it, the error wouldn't. Reads "Password must have 8+
 * characters, 1 uppercase, and 1 number."
 */
export const PASSWORD_REQUIREMENT_MESSAGE = `Password must have ${
  PASSWORD_RULES.length > 1
    ? PASSWORD_RULES.slice(0, -1).map((r) => r.label).join(", ") +
      ", and " +
      PASSWORD_RULES[PASSWORD_RULES.length - 1].label
    : PASSWORD_RULES[0].label
}.`;
