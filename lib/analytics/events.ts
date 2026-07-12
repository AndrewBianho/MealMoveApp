// lib/analytics/events.ts
// Vendor-agnostic event taxonomy. Props here are pre-sanitization shapes;
// identify.ts strips any PII before an event leaves the process.
export type Role = "volunteer" | "restaurant" | "drop_off" | "org_admin";

export type AnalyticsEvent =
  // auth & onboarding
  | { name: "signup_started"; props: { role: Role } }
  | { name: "signup_step_completed"; props: { role: Role; step: number } }
  | { name: "signup_submitted"; props: { role: Role; hadInvite: boolean } }
  | { name: "login"; props: { role: Role } }
  // browsing
  | { name: "feed_viewed"; props: { openCount: number; scheduledCount: number } }
  | { name: "filter_applied"; props: { kind: "status" | "foodType"; value: string } }
  | { name: "sort_changed"; props: { sort: "closing_soon" | "nearest" | "most_meals" } }
  | { name: "view_toggled"; props: { to: "list" | "map" } }
  | { name: "listing_opened"; props: { listingId: string; urgencyBand: "open" | "soon" | "closing_soon" } }
  // claim funnel
  | { name: "claim_flow_viewed"; props: { listingId: string } }
  | { name: "drop_off_selected"; props: { listingId: string; dropOffId: string; wasNearest: boolean } }
  | { name: "claim_completed"; props: { listingId: string; dropOffId: string; minutesToExpiry: number; servings: number } }
  // pickup lifecycle
  | { name: "pickup_photo_uploaded"; props: { pickupId: string; minutesSinceClaim: number } }
  | { name: "in_transit_started"; props: { pickupId: string } }
  | { name: "delivered"; props: { pickupId: string; servings: number; minutesClaimToDelivered: number } }
  | { name: "taken_home"; props: { pickupId: string } }
  | { name: "flaked"; props: { pickupId: string; stage: "claimed" | "photographed"; minutesHeld: number } }
  | { name: "pickup_cancelled"; props: { pickupId: string; stage: "claimed" | "photographed" } }
  // restaurant & drop-off
  | { name: "listing_posted"; props: { servings: number; foodType: string; handling: string; minutesToExpiry: number; carsRequested: number } }
  | { name: "listing_expired_unclaimed"; props: { servings: number; minutesLive: number } }
  | { name: "drop_off_need_updated"; props: { dropOffId: string; needLevel: string } }
  // web performance — Core Web Vitals (RUM), reported via next/web-vitals → PostHog
  | { name: "web_vitals"; props: { metric: string; value: number; rating: string; navigationType: string } }
  // coordination
  | { name: "chat_message_sent"; props: { pickupId: string; senderRole: Role } };

export type EventName = AnalyticsEvent["name"];
