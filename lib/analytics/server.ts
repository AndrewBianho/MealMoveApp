import "server-only";
import { PostHog } from "posthog-node";
import type { AnalyticsEvent, Role } from "./events";
import { hashUserId, sanitizeProps } from "./identify";

let client: PostHog | null = null;
function get(): PostHog | null {
  const key = process.env.POSTHOG_KEY;
  if (!key) return null;
  if (!client) {
    client = new PostHog(key, {
      host: process.env.POSTHOG_HOST ?? "https://us.i.posthog.com",
      flushAt: 1,
      flushInterval: 0,
    });
  }
  return client;
}

export function trackServer(event: AnalyticsEvent, userId?: string): void {
  try {
    const ph = get();
    if (!ph) return;
    ph.capture({
      distinctId: userId ? hashUserId(userId) : "anon",
      event: event.name,
      properties: sanitizeProps(event.props as Record<string, unknown>),
    });
  } catch {
    /* analytics must never break product code */
  }
}

export function identifyServer(userId: string, role: Role): void {
  try {
    const ph = get();
    if (!ph) return;
    ph.identify({ distinctId: hashUserId(userId), properties: { role } });
  } catch {
    /* no-op */
  }
}
