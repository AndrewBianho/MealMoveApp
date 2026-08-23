import { test } from "node:test";
import assert from "node:assert/strict";
import { matchesRoute } from "./tour/route";

test("exact paths match", () => {
  assert.equal(matchesRoute("/", "/"), true);
  assert.equal(matchesRoute("/map", "/map"), true);
  assert.equal(matchesRoute("/impact", "/impact"), true);
});

test("different paths do not match", () => {
  assert.equal(matchesRoute("/", "/map"), false);
  assert.equal(matchesRoute("/map", "/"), false);
});

test(":id matches exactly one segment", () => {
  assert.equal(matchesRoute("/listings/:id", "/listings/abc123"), true);
  assert.equal(matchesRoute("/listings/:id", "/listings"), false);
  assert.equal(matchesRoute("/listings/:id", "/listings/abc/extra"), false);
});

test("a trailing slash on the pathname is tolerated", () => {
  assert.equal(matchesRoute("/map", "/map/"), true);
  assert.equal(matchesRoute("/listings/:id", "/listings/abc/"), true);
});

test("root does not swallow other routes", () => {
  assert.equal(matchesRoute("/", "/listings/abc"), false);
});
