"use client";
import posthog from "posthog-js";
import type { AnalyticsEvent, Role } from "./events";
import { sanitizeProps } from "./sanitize";

let started = false;
export function initClient(): void {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key || started || typeof window === "undefined") return;
  started = true;
  try {
    posthog.init(key, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com",
      autocapture: false, // no autocapture of input values — PII safety
      capture_pageview: true,
      mask_all_text: false,
      mask_all_element_attributes: true,
      persistence: "memory", // cookieless
      session_recording: { maskAllInputs: true },
      disable_session_recording: true, // enabled only for gated flows (Task 8)
    });
  } catch {
    /* no-op */
  }
}

export function trackClient<E extends AnalyticsEvent>(
  name: E["name"],
  props: E["props"],
): void {
  try {
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
    posthog.capture(name, sanitizeProps(props as Record<string, unknown>));
  } catch {
    /* no-op */
  }
}

// Session replay is off by default (see disable_session_recording above);
// call this only from a failure/abandonment path (take-home, cancel pickup,
// flake) to capture the moments most worth reviewing.
export function startFailureReplay(): void {
  try {
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
    posthog.startSessionRecording();
  } catch {
    /* no-op */
  }
}

export function identifyClient(hashedId: string, role: Role): void {
  try {
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
    posthog.identify(hashedId, { role });
  } catch {
    /* no-op */
  }
}
