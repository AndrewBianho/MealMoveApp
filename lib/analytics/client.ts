"use client";
import posthog from "posthog-js";
import type { AnalyticsEvent, Role } from "./events";

let started = false;
export function initClient(): void {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key || started || typeof window === "undefined") return;
  started = true;
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
}

export function trackClient<E extends AnalyticsEvent>(
  name: E["name"],
  props: E["props"],
): void {
  try {
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
    posthog.capture(name, props as Record<string, unknown>);
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
