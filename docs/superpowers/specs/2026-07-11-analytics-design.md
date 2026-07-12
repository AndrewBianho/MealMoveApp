# Meal Move — Analytics design

Date: 2026-07-11
Status: approved (brainstorm), ready for implementation plan
Approach: **A — Consolidated** (PostHog for product + errors + web/perf, own-DB operational dashboard; no Vercel Analytics — see 2026-07-11 change under Web & performance)

## Goal

Give the org a full-stack, privacy-first analytics setup covering four layers:

1. **Operational health** — mission metrics for org admins (food rescued, flake
   rate, claim→pickup→dropoff funnel, drop-off need coverage), computed from our
   own Supabase DB.
2. **Product / behavior** — how users move through the app; where the claim flow
   leaks; retention. PostHog.
3. **Web traffic & performance** — pageviews, sources, Core Web Vitals, via
   PostHog (pageview capture + Next.js `useReportWebVitals` → PostHog). No Vercel
   Analytics/Speed Insights — those bill past quota on the Pro plan, and the
   requirement is zero incremental cost.
4. **Error & session observability** — exceptions, failed-rescue session replay,
   API error rates. PostHog error tracking + session replay.

Everything serves the two product failure modes: **volunteers flaking** on
claimed pickups, and **loss of institutional memory** on founder turnover.
Analytics stays non-punitive (PRODUCT.md principle 1) — measured, never used to
shame a person.

## Constraints

- Free / cheap, privacy-first (student org; handles volunteer PII).
- Next.js 14 App Router, Prisma + Postgres (Supabase), NextAuth (JWT, 4 roles),
  deployed on Vercel.
- **One external vendor only: PostHog** (free tier, US-hosted) — product,
  errors/replay, *and* web/perf all consolidate here. Operational layer is our
  own DB — no vendor. Vercel Analytics/Speed Insights were removed to keep
  incremental cost at zero on the Pro plan (2026-07-11 change).

## Architecture

### 1. The event layer — `lib/analytics/`

One vendor-agnostic module. **No feature code imports PostHog directly.**

```
lib/analytics/
  events.ts     // typed taxonomy — discriminated union of every event + payload
  client.ts     // browser tracking (posthog-js), lazy-loaded, respects consent
  server.ts     // server tracking (posthog-node) for truth events
  identify.ts   // hashUserId(id) + role; PII firewall before anything leaves
  index.ts      // track() / identify() facade — the only feature-facing import
```

**Two emit paths, one taxonomy:**

- **Client events** — pure intent/navigation where the user is the signal
  (`claim_flow_viewed`, `drop_off_selected`, `filter_applied`, `view_toggled`).
  Fired from client components via `posthog-js`.
- **Server events** — state-change *truth*, fired from the server action / route
  handler that mutates the DB, so they survive ad-blockers and can't be faked
  (`claim_completed`, `pickup_photo_uploaded`, `delivered`, `flaked`,
  `taken_home`).

**Rule:** anything that also changes DB state is a **server** event; pure
intent/navigation is a **client** event.

### 2. PII firewall — `identify.ts`

Every event passes through a sanitizer before leaving the process:

- Identify by `sha256(userId)` + `role` only. Never name, phone, email, address.
- Drop any key on a PII denylist (`name`, `phone`, `email`, `address`, `lat`,
  `lng`, `coordinates`, …).
- Bucket location to a coarse area label (campus/neighborhood), never exact
  coordinates.
- PostHog configured with input masking on, autocapture of input *values* off,
  cookieless/consent-aware mode, US host.

### 3. Operational layer — own DB → org-admin console

Truth metrics computed from existing domain tables (Listing, Claim/Pickup,
DropOff) in server components / route handlers, rendered in the org-admin
console. No vendor touches this data.

- Metrics: total food rescued (servings/lbs) over time, completion rate, **flake
  rate**, claim→pickup→dropoff funnel, unclaimed-expired count, per-drop-off need
  coverage, active-volunteer count.
- Presented per DESIGN.md: `MetricCard` for headline numbers; charts follow the
  `dataviz` skill + semantic ramp tokens; reliability shown as non-punitive bars,
  never grades.
- Some funnel steps (e.g. `claim_flow_viewed`) aren't otherwise persisted; a
  lightweight append-only `AnalyticsEvent` table backs those derivations, or we
  read them from PostHog — decided in the plan (default: derive DB-truth metrics
  from domain tables, read behavioral funnels from PostHog).

## Event taxonomy

Sanitized props only. `(server)` = fired from the DB-mutating path.

**Auth & onboarding**
- `signup_started` `{ role }`
- `signup_step_completed` `{ role, step: 1–6 }`
- `signup_submitted` `{ role, hadInvite }` *(server)*
- `login` `{ role }` *(server)*

**Browsing**
- `feed_viewed` `{ openCount, scheduledCount }`
- `filter_applied` `{ kind: status|foodType, value }`
- `sort_changed` `{ sort: closing_soon|nearest|most_meals }`
- `view_toggled` `{ to: list|map }`
- `listing_opened` `{ listingId, urgencyBand: open|soon|closing_soon }`

**Claim funnel** (the flake-analysis heart)
- `claim_flow_viewed` `{ listingId }`
- `drop_off_selected` `{ listingId, dropOffId, wasNearest }`
- `claim_completed` `{ listingId, dropOffId, minutesToExpiry, servings }` *(server)* — funnel conversion
- `claim_abandoned` — **derived**: `claim_flow_viewed` with no `claim_completed` in session

**Pickup lifecycle** (all *server*)
- `pickup_photo_uploaded` `{ pickupId, minutesSinceClaim }`
- `in_transit_started` `{ pickupId }`
- `delivered` `{ pickupId, servings, minutesClaimToDelivered }` — success metric
- `taken_home` `{ pickupId }`
- `flaked` `{ pickupId, stage: claimed|photographed, minutesHeld }` — failure metric
- `pickup_cancelled` `{ pickupId, stage }`

**Restaurant & drop-off** (server)
- `listing_posted` `{ servings, foodType, handling, minutesToExpiry, carsRequested }`
- `listing_expired_unclaimed` `{ servings, minutesLive }` — food-lost signal
- `drop_off_need_updated` `{ dropOffId, needLevel }`

**Coordination**
- `chat_message_sent` `{ pickupId, senderRole }` — count only, never content

This makes three questions answerable out of the box: *where does the claim
funnel leak*, *what predicts a flake* (time-to-expiry, held-minutes, stage), and
*how much food is lost unclaimed vs. flaked*.

## Web & performance layer

- **No Vercel Analytics/Speed Insights** — they bill past the included quota on
  the Pro plan and the constraint is zero incremental spend. Routed through
  PostHog instead (the free vendor already in the stack):
  - **Pageviews / sources** — PostHog client init with `capture_pageview: true`.
  - **Core Web Vitals (RUM)** — a `WebVitals` client component using Next.js's
    built-in `useReportWebVitals` hook (zero dependencies, ships with Next),
    piping LCP/CLS/INP/FCP/TTFB into PostHog as the `web_vitals` event.
  - No `@vercel/*` analytics packages; nothing meters against the Vercel plan.

## Observability layer

- PostHog error tracking (captured exceptions) + session replay, **replay gated
  to failed/abandoned rescues** to stay within free tier and minimize PII. Replay
  masks all text/inputs by default. Revisit Sentry only if PostHog error tooling
  proves insufficient.

## Privacy & consent

- Identify by hashed id only; PII denylist enforced in `identify.ts`.
- PostHog US host, input masking on, autocapture values off.
- Consent-aware init (respect a do-not-track / consent flag); analytics is
  non-blocking and degrades silently if disabled or blocked.
- No event ever carries chat content, names, phones, emails, or exact locations.

## Testing

- Unit-test `identify.ts` sanitizer: PII keys stripped, ids hashed, locations
  bucketed — the privacy backbone must be covered.
- Unit-test the `events.ts` taxonomy types (payloads type-check per event).
- Server-event call sites covered by existing action tests (mock `track`).
- Operational metric queries unit-tested against seeded fixtures.

## Out of scope (YAGNI for v1)

- Sentry / Datadog / Amplitude (revisit if PostHog gaps appear).
- A/B experimentation, marketing attribution, cohort email.
- Self-hosting PostHog (start on free cloud, US region).

## Rollout

1. Foundation: `lib/analytics` + PII firewall + PostHog wiring + PostHog-based
   web vitals (env-gated, no-ops without keys).
2. Instrument client events (browsing, claim flow, signup).
3. Instrument server truth events (claim/pickup lifecycle, listings).
4. Operational org-admin dashboard from own DB.
5. Configure PostHog dashboards/funnels + error tracking + gated replay.
