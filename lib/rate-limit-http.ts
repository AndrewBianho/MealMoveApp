import { NextResponse } from "next/server";
import type { RateResult } from "./rate-limit";

// Standard 429 for API routes, with a Retry-After header (seconds) so clients
// can back off politely. Kept apart from rate-limit.ts so that module stays
// free of any "next" import and the node test runner can load it directly.
export function tooManyRequests(result: RateResult): NextResponse {
  return NextResponse.json(
    { error: "Too many requests. Please slow down and try again shortly." },
    {
      status: 429,
      headers: { "Retry-After": String(Math.ceil(result.retryAfterMs / 1000)) },
    }
  );
}
