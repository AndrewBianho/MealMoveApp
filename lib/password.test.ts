// The rejection message is built from PASSWORD_RULES rather than written out,
// so adding a rule can't leave the error text describing the old policy while
// the live checklist shows the new one. These pin both halves of that.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PASSWORD_RULES,
  PASSWORD_REQUIREMENT_MESSAGE,
  passwordValid,
} from "./password";

test("passwordValid enforces every rule", () => {
  assert.equal(passwordValid("Abcdefg1"), true);
  assert.equal(passwordValid("Abcdef1"), false, "7 chars is too short");
  assert.equal(passwordValid("abcdefg1"), false, "no uppercase");
  assert.equal(passwordValid("Abcdefgh"), false, "no number");
  assert.equal(passwordValid(""), false);
});

test("the message names every rule currently in force", () => {
  for (const rule of PASSWORD_RULES) {
    assert.ok(
      PASSWORD_REQUIREMENT_MESSAGE.includes(rule.label),
      `message should mention "${rule.label}" — got: ${PASSWORD_REQUIREMENT_MESSAGE}`
    );
  }
});

test("the message reads as a sentence, not a list dump", () => {
  assert.equal(
    PASSWORD_REQUIREMENT_MESSAGE,
    "Password must have 8+ characters, 1 uppercase, and 1 number."
  );
});
