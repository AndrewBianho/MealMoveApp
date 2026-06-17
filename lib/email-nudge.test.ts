import { test } from "node:test";
import assert from "node:assert/strict";
import { absoluteUrl, escapeHtml } from "./email";

test("escapeHtml neutralizes angle brackets and ampersands", () => {
  assert.equal(escapeHtml(`<b>a & b</b>`), "&lt;b&gt;a &amp; b&lt;/b&gt;");
});

test("absoluteUrl joins APP_URL with a path", () => {
  process.env.APP_URL = "https://meal.example";
  assert.equal(absoluteUrl("/listings/abc"), "https://meal.example/listings/abc");
});

test("absoluteUrl tolerates a trailing slash on APP_URL", () => {
  process.env.APP_URL = "https://meal.example/";
  assert.equal(absoluteUrl("/listings/abc"), "https://meal.example/listings/abc");
});
