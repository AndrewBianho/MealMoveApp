// Fixed-window rate limiter. Uses Upstash Redis over its REST API when
// configured (UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN), so limits
// hold across Vercel's many serverless instances. With no Upstash configured
// it falls back to a per-process in-memory window — fine for local dev and a
// single Node host, weak across multiple instances. Either way it FAILS OPEN:
// a limiter error or outage never blocks a legitimate request.
//
// No npm dependency — Upstash is reached with plain fetch. This file imports
// nothing from "next", so the node test runner can exercise the core directly.

export type RateResult = {
  ok: boolean;
  limit: number;
  remaining: number;
  retryAfterMs: number;
};

export type WindowState = { count: number; resetAt: number };

/**
 * Pure fixed-window step: fold one hit into the current window state and decide
 * whether it's allowed. Exported for testing and reused by the in-memory store.
 * A window whose `resetAt` has been reached (now >= resetAt) is treated as
 * expired and a fresh one is started.
 */
export function evaluateWindow(
  state: WindowState | undefined,
  now: number,
  limit: number,
  windowMs: number
): { state: WindowState; result: RateResult } {
  let next: WindowState =
    !state || now >= state.resetAt
      ? { count: 0, resetAt: now + windowMs }
      : { count: state.count, resetAt: state.resetAt };

  next = { count: next.count + 1, resetAt: next.resetAt };
  const ok = next.count <= limit;
  return {
    state: next,
    result: {
      ok,
      limit,
      remaining: Math.max(0, limit - next.count),
      retryAfterMs: ok ? 0 : Math.max(0, next.resetAt - now),
    },
  };
}

/** Best-effort client IP from proxy headers. Stable sentinel when unknown. */
export function clientIp(headers: { get(name: string): string | null }): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}

// --- in-memory backend ------------------------------------------------------

const memory = new Map<string, WindowState>();
let lastSweep = 0;

// Drop expired entries occasionally so the Map can't grow without bound.
function sweepMemory(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  memory.forEach((state, key) => {
    if (now >= state.resetAt) memory.delete(key);
  });
}

function memoryLimit(key: string, limit: number, windowMs: number): RateResult {
  const now = Date.now();
  sweepMemory(now);
  const { state, result } = evaluateWindow(memory.get(key), now, limit, windowMs);
  memory.set(key, state);
  return result;
}

// --- Upstash backend --------------------------------------------------------

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

export function isDistributedLimiter(): boolean {
  return Boolean(UPSTASH_URL && UPSTASH_TOKEN);
}

// Atomic INCR + first-hit PEXPIRE, returning the count and remaining TTL.
const LUA = `local c = redis.call('INCR', KEYS[1])
if c == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return {c, redis.call('PTTL', KEYS[1])}`;

async function upstashLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateResult> {
  const res = await fetch(UPSTASH_URL!, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${UPSTASH_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(["EVAL", LUA, "1", `rl:${key}`, String(windowMs)]),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Upstash ${res.status}`);
  const { result } = (await res.json()) as { result: [number, number] };
  const [count, ttl] = result;
  const ok = count <= limit;
  return {
    ok,
    limit,
    remaining: Math.max(0, limit - count),
    retryAfterMs: ok ? 0 : Math.max(0, ttl),
  };
}

/**
 * Consume one unit against `key`. Returns whether the request is allowed plus
 * how long to wait. Never throws — on any backend error it fails open.
 */
export async function rateLimit(
  key: string,
  opts: { limit: number; windowMs: number }
): Promise<RateResult> {
  const { limit, windowMs } = opts;
  if (isDistributedLimiter()) {
    try {
      return await upstashLimit(key, limit, windowMs);
    } catch {
      // Fail open: a limiter outage must not lock real users out.
      return { ok: true, limit, remaining: limit, retryAfterMs: 0 };
    }
  }
  return memoryLimit(key, limit, windowMs);
}

/**
 * Clear a key's counter. Used after a *successful* login so a legitimate user
 * who fumbled their password a few times is never locked out. Fails silently.
 */
export async function resetLimit(key: string): Promise<void> {
  if (isDistributedLimiter()) {
    try {
      await fetch(UPSTASH_URL!, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${UPSTASH_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(["DEL", `rl:${key}`]),
        cache: "no-store",
      });
    } catch {
      // ignore — a stale counter just expires on its own window.
    }
    return;
  }
  memory.delete(key);
}

// Common limit presets, in one place so they're easy to find and tune.
export const LIMITS = {
  // Auth: 5 attempts per 15 minutes (per IP + identity).
  auth: { limit: 5, windowMs: 15 * 60_000 },
  // Sign-up: a bit looser than login so an onboarding event behind one campus
  // NAT isn't blocked, while still capping bcrypt-spam from a single source.
  register: { limit: 10, windowMs: 15 * 60_000 },
  // Image uploads: generous, but caps abuse of the storage path.
  upload: { limit: 30, windowMs: 60_000 },
  // Chat polling runs every ~4s (~15/min); 120/min leaves wide headroom.
  chatRead: { limit: 120, windowMs: 60_000 },
  // Sending messages: brisk typing is fine, floods are not.
  chatWrite: { limit: 30, windowMs: 60_000 },
} as const;
