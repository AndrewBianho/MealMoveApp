# Analytics: PostHog setup runbook

Audience: whoever runs Meal Move's org-admin/tech-lead seat next. This doc is
written so you can stand up (or re-stand-up) product analytics from zero
context. Meal Move ships two analytics layers:

1. **PostHog** (this doc) — event-level product analytics, funnels, session
   replay, error tracking, web vitals. Optional at runtime: if the env vars
   below are unset, every call in `lib/analytics/*` no-ops cleanly (try/catch
   around each `posthog.*` call) — the app works fine with PostHog fully
   disconnected.
2. **Our own database** (`/admin/analytics`, see bottom of this doc) — mission
   metrics (food rescued, flake rate, funnel conversion) computed straight
   from Postgres, independent of PostHog. That page keeps working even if
   PostHog is down or was never configured.

## 1. Create the PostHog project (US cloud, free tier)

Meal Move uses the **US** PostHog cloud (US-based volunteers and data). Pick the
region once at project creation — a PostHog project cannot be moved between US
and EU later, so be deliberate here.

1. Go to https://us.posthog.com and sign up (or sign in if the org already
   has an account — check with the outgoing admin first, PostHog orgs can
   have multiple projects).
2. Create a new project, e.g. "Meal Move — production". The free tier
   (1M events/mo) is more than enough for a campus chapter.
3. Create a second project "Meal Move — preview/dev" if you want to keep
   Vercel preview-deploy noise out of the production project's data. (Not
   required — you can point everything at one project and filter by
   environment later if needed.)
4. In the project, go to **Project settings → General**. You'll find:
   - **Project API key** — starts with `phc_...`. This is the *public*
     client key (safe to ship to the browser) — used for both
     `POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_KEY` below (same project key,
     PostHog doesn't distinguish server/client keys for capture).
   - **Project ID** and the **host** — for US cloud this is
     `https://us.i.posthog.com`. (EU cloud would be `https://eu.i.posthog.com`;
     this project is US, so keep the US host in the env vars below.)

## 2. The four env vars

The code reads two pairs — a server-side pair (used by `lib/analytics/server.ts`
for events emitted from Server Actions / route handlers) and a client-side
`NEXT_PUBLIC_*` pair (used by `lib/analytics/client.ts`, which runs in the
browser and therefore must be exposed via the `NEXT_PUBLIC_` prefix per
Next.js convention).

| Var | Value | Used by |
|---|---|---|
| `POSTHOG_KEY` | the `phc_...` project API key | `lib/analytics/server.ts` |
| `POSTHOG_HOST` | `https://us.i.posthog.com` | `lib/analytics/server.ts` |
| `NEXT_PUBLIC_POSTHOG_KEY` | the same `phc_...` project API key | `lib/analytics/client.ts` |
| `NEXT_PUBLIC_POSTHOG_HOST` | `https://us.i.posthog.com` | `lib/analytics/client.ts` |

In this codebase, all four are optional — `client.ts`'s `initClient()` and
every `trackClient`/`identifyClient`/`startFailureReplay` call checks
`NEXT_PUBLIC_POSTHOG_KEY` first and returns early (wrapped in try/catch) if
unset; `server.ts` does the analogous check for `POSTHOG_KEY`. That means:
new environments (a fresh preview deploy, a laptop with no `.env` set up)
simply run with analytics off, no crashes, no build failures.

### Where to put them

**Local development** — add to `Code/.env` (not committed; see
`Code/.env.example` if present for the expected keys):

```
POSTHOG_KEY=phc_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
POSTHOG_HOST=https://us.i.posthog.com
NEXT_PUBLIC_POSTHOG_KEY=phc_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
```

Restart `next dev` after editing `.env` — env vars are read at process start.

**Vercel** — Project settings → Environment Variables (or `vercel env add`,
see the `vercel:env-vars` skill):

- Add all four vars scoped to **Production**.
- Add all four vars scoped to **Preview** too (point Preview at the separate
  "Meal Move — preview/dev" PostHog project if you made one in step 1.3, so
  preview-deploy clicks from PR review don't pollute production funnels).
- Do **not** add them to a shared "Development" Vercel env unless you want
  `vercel dev` to also emit events — usually just rely on local `.env`.
- After adding/changing, redeploy (env var changes don't apply to already-
  built deployments).

Remember `vercel env pull` returns empty for sensitive-type vars (see project
memory `vercel-prod-env-sensitive`) — always verify values by checking the
Vercel dashboard directly, not by pulling and diffing.

## 3. Building the key insights

All event names below come straight from `lib/analytics/events.ts` — the
`AnalyticsEvent` union is the single source of truth for what's emitted. If
an insight below doesn't match what you see in PostHog's event list, check
that file first before assuming a config problem.

### Claim funnel

Product path: browsing a listing → picking a drop-off → committing to the
pickup.

In PostHog: **Product analytics → Insights → New insight → Funnel**, add
steps in order:

1. `claim_flow_viewed` (props: `listingId`)
2. `drop_off_selected` (props: `listingId`, `dropOffId`, `wasNearest`)
3. `claim_completed` (props: `listingId`, `dropOffId`, `minutesToExpiry`,
   `servings`)

Breakdown suggestion: by `wasNearest` on step 2, to see whether volunteers
who pick the nearest drop-off convert better than those who scroll past it.

### Rescue funnel

Product path: a claimed pickup actually getting delivered (the core "does
food move" metric).

Funnel steps:

1. `claim_completed`
2. `pickup_photo_uploaded` (props: `pickupId`, `minutesSinceClaim`)
3. `delivered` (props: `pickupId`, `servings`, `minutesClaimToDelivered`)

Consider a time-to-convert window of 24–48h per step, since pickups can be
"taken home" overnight (see `taken_home` event) before delivery.

### Flake insight

Flaking is the #1 product failure mode (see PRODUCT.md). Build this as a
**trends** insight comparing two event counts over time, or a ratio:

- Numerator: `flaked` (props: `pickupId`, `stage: "claimed" | "photographed"`,
  `minutesHeld`)
- Denominator: `flaked` + `delivered` (or just `delivered` alone as the
  "healthy" counterpart)

Breakdown `flaked` by `stage` to see whether people bail before or after
picking up the food (very different failure — pre-pickup flaking just means
the listing needs to be reclaimed; post-photo flaking means food is already
out in the world unaccounted for). `minutesHeld` as a trend/histogram shows
how long food sat before someone gave up on it — useful for tuning claim
expiry windows.

Note `pickup_cancelled` (props: `pickupId`, `stage`) is the *voluntary*,
early-release counterpart to `flaked` (a volunteer honestly stepping off,
e.g. via "Cancel pickup") — don't conflate the two in a flake-rate metric;
`flaked` is the one that represents an actual reliability failure.

### Signup funnel

Onboarding drop-off across the 6-step signup wizard (see DESIGN.md → Auth
surface):

- Event: `signup_step_completed`, props `role`, `step` (1–6)
- Build as a **funnel** with 6 steps, each step filtered to
  `step = 1`, `step = 2`, ... `step = 6` of the same event (PostHog supports
  multi-step funnels off one event name with different property filters per
  step — use "Add filter" per step, not 6 separate events).
- Breakdown by `role` to compare volunteer vs. restaurant/drop-off signup
  completion (restaurant/drop-off accounts land on an "awaiting org-admin
  approval" panel instead of signing in immediately, which is a natural
  place for drop-off — don't mistake that for a bug).
- `signup_started` (props: `role`) and `signup_submitted` (props: `role`,
  `hadInvite`) bookend the wizard if you want start→submit as a coarser
  two-step funnel instead.

### Web vitals (Core Web Vitals dashboard)

Event: `web_vitals`, props `metric` (e.g. `LCP`, `FID`/`INP`, `CLS`, `TTFB`),
`value`, `rating` (`good`/`needs-improvement`/`poor`), `navigationType`.

Build a **trends** insight: `web_vitals` events, breakdown by `metric`,
displaying `value` as an average/p75 (use "Property value" aggregation,
p75 is the standard CWV percentile), filtered by `rating` if you want to
isolate regressions. One chart per metric reads more cleanly than one
combined chart because the units differ (ms vs. unitless CLS score).

### Enabling error tracking

PostHog error tracking is a separate opt-in surface from event capture:

1. In the PostHog project, go to **Error tracking** in the left nav.
2. If prompted, click "Enable error tracking" / follow the setup card —
   PostHog's JS SDK (already initialized via `posthog.init` in
   `lib/analytics/client.ts`) auto-captures uncaught exceptions and unhandled
   promise rejections in the browser once error tracking is turned on
   project-side; no additional code change is required in this repo.
3. Optionally wire `Sentry`-style manual `posthog.captureException(err)`
   calls into specific `catch` blocks later if you want richer coverage of
   handled errors (the current codebase deliberately swallows errors in
   analytics helpers themselves — see Privacy section — but this applies to
   *product* error handling elsewhere, not the analytics layer).

## 4. Privacy posture (already enforced in code — don't weaken it)

Meal Move's analytics are built to be privacy-conservative by default. If
you're auditing or extending the analytics layer, these are the invariants
to preserve:

- **Identify by hashed id only.** `lib/analytics/identify.ts` →
  `hashUserId(userId)` runs a SHA-256 hash before any user id reaches
  PostHog. `identifyClient(hashedId, role)` in `client.ts` only ever receives
  the hashed value — never call `posthog.identify` with a raw database id,
  email, or name.
- **PII denylist.** `lib/analytics/identify.ts` → `sanitizeProps()` strips
  `name`, `firstName`, `lastName`, `phone`, `email`, `address`, `lat`, `lng`,
  `latitude`, `longitude`, `coordinates` from any props object before it's
  sent. Route new event props through `sanitizeProps()` (server side) rather
  than adding a new PII field and hoping it's caught elsewhere.
- **No autocapture.** `posthog.init(..., { autocapture: false })` — PostHog
  will not automatically scrape click text, form values, or DOM content.
  Every captured event is one we explicitly call `trackClient`/`trackServer`
  for, from `lib/analytics/events.ts`'s taxonomy.
- **Input masking.** `mask_all_element_attributes: true` and
  `session_recording: { maskAllInputs: true }` — even the (normally-off)
  session replay never records raw input values.
- **Cookieless / memory persistence.** `persistence: "memory"` — no
  PostHog cookie or localStorage identity persists across page loads/tabs;
  identity resets each session unless `identifyClient` is called again.
- **US host.** `api_host` defaults to `https://us.i.posthog.com` in
  `client.ts`, and `host` defaults the same way in `server.ts` — US routing
  holds even if `NEXT_PUBLIC_POSTHOG_HOST`/`POSTHOG_HOST` are left unset.
- **Session replay is off by default, gated to failure flows.**
  `posthog.init(..., { disable_session_recording: true })` turns replay off
  globally. The only way replay starts is an explicit call to
  `startFailureReplay()` (exported from `lib/analytics/client.ts`), which
  itself no-ops if `NEXT_PUBLIC_POSTHOG_KEY` is unset. As of this task, it's
  wired into `components/ListingDetail.tsx`'s `onTakeHome()` and
  `onCancelPickup()` handlers — the two in-flight deviation/failure paths
  ("take it home instead" and "Cancel pickup"). If you add more
  failure/abandonment paths later (e.g. a flake-confirmation flow), call
  `startFailureReplay()` at the top of that handler too, following the same
  pattern — do not flip `disable_session_recording` to `false` globally.

## 5. In-app analytics (independent of PostHog)

`/admin/analytics` (org-admin only) renders mission metrics — food rescued,
flake rate, claim/rescue funnel conversion — computed directly from
Postgres via `lib/analytics/dashboardData.ts` and `lib/analytics/operational.ts`.
This page has no PostHog dependency: it works identically whether or not any
of the four env vars above are set, so the chapter's core "is this working"
view survives even before (or if) PostHog is ever configured. Use PostHog
for deeper, ad-hoc, event-level exploration (funnels above, session replay,
web vitals, error tracking); use `/admin/analytics` as the always-on source
of truth for the mission numbers themselves.
