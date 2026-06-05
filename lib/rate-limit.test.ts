import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateWindow, clientIp, type WindowState } from "./rate-limit";

const t0 = 1_000_000_000_000;
const WINDOW = 15 * 60_000; // 15 min
const LIMIT = 5;

test("evaluateWindow: first hit opens a fresh window", () => {
  const { state, result } = evaluateWindow(undefined, t0, LIMIT, WINDOW);
  assert.equal(state.count, 1);
  assert.equal(state.resetAt, t0 + WINDOW);
  assert.equal(result.ok, true);
  assert.equal(result.remaining, 4);
  assert.equal(result.retryAfterMs, 0);
});

test("evaluateWindow: allows exactly `limit` hits, then blocks", () => {
  let state: WindowState | undefined;
  for (let i = 1; i <= LIMIT; i++) {
    const r = evaluateWindow(state, t0, LIMIT, WINDOW);
    state = r.state;
    assert.equal(r.result.ok, true, `hit ${i} should pass`);
  }
  // 6th hit within the same window is blocked.
  const blocked = evaluateWindow(state, t0 + 1000, LIMIT, WINDOW);
  assert.equal(blocked.result.ok, false);
  assert.equal(blocked.result.remaining, 0);
  // retry-after counts down toward the original reset.
  assert.equal(blocked.result.retryAfterMs, t0 + WINDOW - (t0 + 1000));
});

test("evaluateWindow: window resets once it expires", () => {
  let state: WindowState | undefined;
  for (let i = 0; i < LIMIT + 3; i++) {
    state = evaluateWindow(state, t0, LIMIT, WINDOW).state;
  }
  // After the window elapses, the next hit starts a new window.
  const after = evaluateWindow(state, t0 + WINDOW, LIMIT, WINDOW);
  assert.equal(after.result.ok, true);
  assert.equal(after.state.count, 1);
  assert.equal(after.state.resetAt, t0 + WINDOW + WINDOW);
});

test("evaluateWindow: a window exactly at resetAt is treated as expired", () => {
  const first = evaluateWindow(undefined, t0, LIMIT, WINDOW);
  const atBoundary = evaluateWindow(first.state, first.state.resetAt, LIMIT, WINDOW);
  assert.equal(atBoundary.state.count, 1, "resetAt is inclusive of the new window");
});

test("clientIp: takes the first hop of x-forwarded-for", () => {
  const h = new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1, 10.0.0.2" });
  assert.equal(clientIp(h), "203.0.113.7");
});

test("clientIp: falls back to x-real-ip, then a stable sentinel", () => {
  assert.equal(clientIp(new Headers({ "x-real-ip": "198.51.100.4" })), "198.51.100.4");
  assert.equal(clientIp(new Headers()), "unknown");
});
