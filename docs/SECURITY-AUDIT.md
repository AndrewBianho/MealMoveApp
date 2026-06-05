# Security audit — Meal Move

_Date: 2026-06-04. Scope: the `Code/` Next.js app (App Router, NextAuth, Prisma/Supabase)._

This documents the hardening done in this pass and the vulnerabilities that
remain, with severity and a recommended action for each. Severity reflects this
app's context: a small campus food-rescue org, low-sensitivity data, deployed on
Vercel.

---

## 1. Done in this pass

### Rate limiting (`lib/rate-limit.ts`)
- New fixed-window limiter. Uses **Upstash Redis** over its REST API when
  `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` are set (so limits hold
  across all Vercel serverless instances), and falls back to a **per-process
  in-memory** window otherwise. No new npm dependency — Upstash is reached with
  `fetch`.
- **Fails open**: any limiter error or outage allows the request. A throttling
  bug can never lock real users out.
- Applied:
  - **Login** — 5 attempts / 15 min, inside the Credentials `authorize()`,
    keyed by `IP + email`. A successful login clears the counter, so a user who
    fumbles their password is never locked out. (See "remaining" #2 for the
    keying trade-off.)
  - **Sign-up** (`registerUser`) — 10 / 15 min per IP. Sign-up runs bcrypt, so
    it's a cheap DoS/spam vector; the limit is a bit looser than login so an
    onboarding event behind one campus NAT isn't blocked.
  - **Image upload** — 30 / min per user (IP fallback).
  - **Chat** — 120 / min read (poll is ~15/min, wide headroom), 30 / min write.
- **Deliberately not limited:** `/api/cron/sweep`. It is already
  `CRON_SECRET`-gated, and IP-limiting it could block Vercel Cron (whose source
  IPs rotate).

### Input validation / payload hardening
- `postListing` now rejects malformed numbers (NaN/Infinity/strings) and bounds
  `servings` (1–10,000), `minutes` (1–1,440), `weightLbs` (1–100,000), and caps
  `title` (120), `notes` (500), and `imageUrl` (2,048) lengths.
- Existing validation confirmed adequate elsewhere: upload checks role + MIME +
  5 MB cap; chat trims + caps body at 2,000 chars; `registerUser` validates
  email shape, password length, and role.

### Broken access control fix
- `postListing` previously trusted the client-supplied `restaurantId` — any
  authenticated user (e.g. a volunteer) could post a listing **as any
  restaurant**. It now resolves the acting restaurant from the session: a
  `restaurant` member always posts for their own restaurant; only an `org_admin`
  may pass an arbitrary `restaurantId`.

### Secret handling — audited, already clean (no change needed)
- No hardcoded keys/tokens/passwords in source; every secret is read from
  `process.env`.
- `.env` is gitignored and was **never committed** (full history checked); only
  `.env.example` (placeholders) is tracked.
- The only browser-exposed value is `NEXT_PUBLIC_MAPBOX_TOKEN` (public by
  design). Confirmed **no** server secret (`AUTH_SECRET`, `CRON_SECRET`,
  `DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, Upstash token) appears in the
  client bundle (`.next/static`). `lib/storage.ts` guards the service-role
  client with `import "server-only"`.

---

## 2. Remaining vulnerabilities & recommendations

| # | Severity | Issue | Recommended action |
|---|----------|-------|--------------------|
| 1 | **Medium (until configured)** | In-memory limiter is per-instance on Vercel — limits leak across cold starts / concurrent instances. | Set `UPSTASH_REDIS_REST_URL` + `_TOKEN` in the Vercel project (free tier). Then limits are correct. |
| 2 | Low–Medium | Login limit keys on `IP+email`. **Credential stuffing** (many emails, few tries each, from one IP) isn't fully caught, by design (chosen to avoid locking out a shared campus NAT). | Add a secondary looser IP-only limit (e.g. 50 failed/15 min) if stuffing is observed. |
| 3 | Medium | **No security headers** (CSP, HSTS, X-Frame-Options, Referrer-Policy). | Add a `headers()` block in `next.config.mjs`. Not done here because a strict CSP can break Mapbox GL / inline styles — needs testing against the map pages. |
| 4 | Low–Medium | **Sign-up user enumeration**: "An account with that email already exists." reveals which emails are registered. | Accept as a UX trade-off, or switch to a generic "check your email" flow. |
| 5 | Low | **Upload trusts client `Content-Type`** and doesn't sniff magic bytes; no decompression-bomb guard. Files land in a public bucket. | Verify magic bytes (or re-encode server-side) and cap dimensions. Rate limit now caps volume. |
| 6 | Low | `/api/cron/sweep` is **open if `CRON_SECRET` is unset** (the check is conditional). It is set in this project. | Keep `CRON_SECRET` set in every environment; optionally hard-fail when missing in production. |
| 7 | Low | **Password policy** is min-8-chars only — no breach/complexity check. bcrypt cost is 10 (fine). | Consider a HaveIBeenPwned k-anonymity check at sign-up. |
| 8 | Info | Mapbox token is public; protect it operationally. | Restrict the token by URL in the Mapbox dashboard (already noted in `.env.example`). |
| 9 | Info | Business-logic actions (`claimListing`, check-in, delivery) are not rate-limited. | Bounded by state machine + ownership checks (test-covered); add limits only if abused. |

### Confirmed *not* vulnerable
- **SQL injection** — all DB access goes through Prisma (parameterized).
- **XSS** — React escapes by default; no `dangerouslySetInnerHTML` in the app.
- **Privilege escalation via roles** — `setRole` is org-admin-only with a
  last-admin guard; middleware gates routes; server actions re-check roles.
- **Secret leakage to client** — verified above.

---

## 3. Operational checklist for production (Vercel)
- [ ] Set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` (item #1).
- [ ] Confirm `CRON_SECRET` and `AUTH_SECRET` are set (and `AUTH_URL` if needed).
- [ ] URL-restrict the Mapbox token in the Mapbox dashboard.
- [ ] Decide on security headers / CSP (item #3) and test against `/map`.
