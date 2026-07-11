import { test } from "node:test";
import assert from "node:assert/strict";
import { trackServer, identifyServer } from "./server";

test("trackServer is a no-op (never throws) when POSTHOG_KEY is unset", () => {
  delete process.env.POSTHOG_KEY;
  assert.doesNotThrow(() =>
    trackServer({ name: "delivered", props: { pickupId: "p1", servings: 8, minutesClaimToDelivered: 40 } }, "user_1"),
  );
});

test("identifyServer never throws when disabled", () => {
  delete process.env.POSTHOG_KEY;
  assert.doesNotThrow(() => identifyServer("user_1", "volunteer"));
});
