# Domain cutover — mealmove.org

Record of moving Meal Move's production domain to **mealmove.org**.
Completed **2026-07-19**. Keep this as the reference for the next person who
touches DNS or the canonical origin.

## What changed

| Item | Before | After |
|---|---|---|
| Primary domain | `meal-move-app.vercel.app` (default) | `mealmove.org` |
| `.vercel.app` URL | served the app directly | **308** permanent redirect → `https://mealmove.org` |
| `APP_URL` (Vercel env, Production) | `""` (empty — links were relative/broken) | `https://mealmove.org` |
| Node (`package.json#engines`) | `>=20.0.0` (auto-upgrades on new major) | `22.x` (pinned) |

## Why `APP_URL` is the load-bearing variable

Every outbound link is built from `process.env.APP_URL`, so it must match the
canonical origin or links break/point to the wrong host:

- `lib/email.ts` — invite / password-reset / nudge email links
- `lib/firebaseAdmin.ts` — push-notification click-through URLs
- `app/actions.ts` — server-action generated links

NextAuth needs **no** URL env: `auth.ts` sets `trustHost: true` and cookies are
host-only, so it derives the origin from the request host automatically.

## Steps performed

1. Added `mealmove.org` (+ `www`) to the Vercel project; DNS pointed at Vercel;
   waited for "Valid Configuration" + SSL.
2. Set the `.vercel.app` default URL to **308** redirect to `mealmove.org`
   (canonical consolidation; 308 preserves HTTP method vs 301).
3. Set `APP_URL=https://mealmove.org` in Vercel → Environment Variables
   (Production scope), no trailing slash. *(The value was edited in the
   dashboard; the CLI `env rm`/`add` dance is brittle — dashboard "Edit" is the
   reliable path.)*
4. Pinned `"node": "22.x"` in `Code/package.json#engines`.
5. Updated hardcoded contact/sender to the new domain:
   `app/privacy/page.tsx` → `support@mealmove.org`; added
   `metadataBase: new URL("https://mealmove.org")` in `app/layout.tsx` (so
   OG/social-share + canonical URLs resolve absolutely).
6. Configured transactional email (see below).
7. Redeployed Production (`vercel --prod`). Deployment `READY`, aliased to
   `https://mealmove.org`.

## Transactional email — Resend (SMTP)

Before this, **no `SMTP_*` vars existed in production**, so `lib/email.ts`
`smtpConfigured()` was false and every reset/invite/nudge email was silently
skipped (token issued, never sent). Wired up via **Resend** SMTP:

1. Resend account → **Domains** → add `mealmove.org`; add the MX / SPF / DKIM
   (`resend._domainkey`) / DMARC records Resend generates at the registrar's DNS;
   click **Verify** (must be green before `@mealmove.org` can send).
2. Resend → **API Keys** → create a Send key (`re_…`) = the SMTP password.
3. Set these in Vercel → Environment Variables (Production), via the **dashboard**
   (not CLI):

   | Key | Value |
   |---|---|
   | `SMTP_HOST` | `smtp.resend.com` |
   | `SMTP_PORT` | `465` (implicit TLS — matches `secure: port === 465` in `lib/email.ts`) |
   | `SMTP_USER` | `resend` (literal, same for everyone) |
   | `SMTP_PASS` | the `re_…` API key |
   | `SMTP_FROM` | `Meal Move <no-reply@mealmove.org>` (address must be on the verified domain) |

4. Redeploy. Resend free tier: 3,000/mo, 100/day. Its dashboard logs every
   send/bounce/delivery.

## Verification

- `curl -sI https://meal-move-app.vercel.app` → `HTTP/2 308`,
  `location: https://mealmove.org/`.
- `curl -sI https://mealmove.org/login` → `HTTP/2 200`, and the auth cookie
  `__Secure-authjs.callback-url=https%3A%2F%2Fmealmove.org` — confirms NextAuth
  is operating on the new origin.
- **Still to confirm manually:** with the Resend domain **Verified**, trigger a
  real password reset → confirm the email arrives and its link reads
  `https://mealmove.org/reset-password?...`, and that Resend's dashboard logs the
  send. This is the one path that can't be verified from headers.

> **Tooling gotcha:** `vercel env pull` returns an **empty string for every
> variable** in this project (confirmed: `DATABASE_URL` / `NEXT_PUBLIC_MAPBOX_TOKEN`
> pull empty even though DB + maps work). Do **not** conclude a var is unset from a
> pulled `X=""`. Use `vercel env ls` for *presence* of a key, and actual runtime
> behavior for *correctness*.

## Not required / intentionally skipped

- **NextAuth** — no config change (`trustHost: true`, host-only cookies). Live
  sessions on the old URL get signed out once and re-login; expected.
- **Firebase / FCM** — `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` is Firebase's own
  domain, unchanged; the push service worker has no hardcoded origin.
- **PostHog** — works cross-domain as-is.
- **Mapbox** — only needs `mealmove.org/*` added if the
  `NEXT_PUBLIC_MAPBOX_TOKEN` has URL restrictions; skip if unrestricted.
- **Email deliverability** — SPF/DKIM on `mealmove.org` only needed if `SMTP_FROM`
  moves to an `@mealmove.org` address.

## Build warnings seen at cutover (all benign, non-blocking)

- `Failed to find font override values for 'Nunito Sans'` — Next 14.2.x can't
  find precomputed fallback metrics; font still loads via `display: swap`.
- npm `deprecated` notices (rimraf, glob, inflight, eslint 8, uuid, …) —
  transitive tooling deps, cosmetic.
- `package.json#prisma is deprecated` — advisory for Prisma 7 (`prisma.config.ts`);
  not urgent.
- `react-hooks/exhaustive-deps` at layout/listing effects (missing `listing`) —
  pre-existing lint warnings, unrelated to the cutover.
