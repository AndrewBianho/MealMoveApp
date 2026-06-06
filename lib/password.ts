// Single source of truth for password rules, shared by the client checklist
// (PasswordField) and server validation (registerUser / resetPassword) so the
// two can never drift. Add a rule here and it shows up live AND is enforced.

export interface PasswordRule {
  id: string;
  label: string;
  test: (password: string) => boolean;
}

export const PASSWORD_RULES: PasswordRule[] = [
  { id: "len", label: "At least 8 characters", test: (p) => p.length >= 8 },
];

/** True when every rule passes — the same check the server enforces. */
export function passwordValid(password: string): boolean {
  return PASSWORD_RULES.every((r) => r.test(password));
}
