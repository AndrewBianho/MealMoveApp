import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBuddyInvitePayload, buildDropOffPayload } from "./notify";

test("buddy invite payload names the inviter and listing", () => {
  const p = buildBuddyInvitePayload({
    inviteId: "i", listingId: "L2", inviteeId: "u", listingTitle: "Soup", inviterName: "Mia",
  });
  assert.equal(p.url, "/listings/L2");
  assert.match(p.email.html, /Mia/);
  assert.match(p.email.html, /Soup/);
});

test("drop-off payload escapes the title", () => {
  const p = buildDropOffPayload({
    listingId: "L3", dropOffId: "d", dropOffName: "Hall", listingTitle: "<x>",
  });
  assert.equal(p.url, "/dropoff");
  assert.match(p.email.html, /&lt;x&gt;/);
});
