// Content-Security-Policy, ENFORCING (SECURITY-AUDIT.md #3).
//
// Shipped report-only first, deliberately: the risky consumer is Mapbox GL,
// which needs blob: workers, blob:/data: tile images and inline styles for its
// controls, and a wrong guess here kills the map silently for users while every
// automated check stays green. That pass earned its keep — it caught PostHog
// serving its SDK from us-assets.i.posthog.com, a different host from the
// us.i.posthog.com ingest endpoint the code names, which enforcing would have
// broken on day one.
//
// Promoted after a clean pass over /map, a listing detail with its side map,
// image upload and push opt-in. One caveat kept for whoever reads this next:
// the Firebase service worker runs in its own context, so its violations do NOT
// appear in the page console. If push ever stops registering, suspect this
// header first and check the SW console under Application -> Service workers.
//
// To roll back, rename the key below to `Content-Security-Policy-Report-Only`;
// nothing else needs to change.
//
// Origins below are taken from the code, not guessed: mapbox-gl's own bundle
// (api/events.mapbox.com), the Supabase Storage host in `images` beneath,
// gstatic for the Firebase messaging SDK the service worker imports, and
// PostHog. `'unsafe-inline'` stays on style-src because Next injects inline
// styles and Mapbox styles its controls that way; `'unsafe-eval'` is dev-only,
// where Next's dev runtime needs it.
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  // PostHog serves its SDK chunks (config.js, surveys, web-vitals,
  // dead-clicks-autocapture) from us-assets.i.posthog.com — a DIFFERENT host
  // from the us.i.posthog.com ingest endpoint set as `api_host`. Report-only
  // caught all four being blocked.
  `script-src 'self' 'unsafe-inline' https://www.gstatic.com https://us-assets.i.posthog.com${
    process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'"
  }`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data: https://*.supabase.co https://*.mapbox.com",
  "font-src 'self' data:",
  "worker-src 'self' blob:",
  "child-src 'self' blob:",
  "connect-src 'self' https://api.mapbox.com https://events.mapbox.com https://*.supabase.co https://us.i.posthog.com https://us-assets.i.posthog.com https://fcmregistrations.googleapis.com https://fcm.googleapis.com",
  "manifest-src 'self'",
].join("; ");

// Baseline security headers (SECURITY-AUDIT.md → remaining #3). Applied to every
// route.
const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  // HTTPS only, one year. No `preload` — that submits the domain to the
  // browser-baked preload list, which is slow and painful to undo.
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
  // Nothing here is meant to be framed, so clickjacking has no legitimate cost.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Send the origin (not the path) cross-site: listing/pickup URLs carry ids.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // `self` for the two features the app genuinely uses — camera for the pickup
  // photo (ImageUploadField's getUserMedia), geolocation for nearest-first
  // sorting and the rescue map. Everything else off.
  {
    key: "Permissions-Policy",
    value: "camera=(self), geolocation=(self), microphone=(), payment=()",
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  images: {
    // Supabase Storage public URLs live on the project's *.supabase.co host.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
