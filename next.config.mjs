// Content-Security-Policy, shipped in REPORT-ONLY mode (SECURITY-AUDIT.md #3).
//
// Report-Only means browsers evaluate this and log violations to the console
// without blocking anything, so it cannot break the app. That matters here: the
// risky consumer is Mapbox GL, which needs blob: workers, blob:/data: images for
// tiles, and inline styles for its controls — and a wrong guess in enforcing
// mode kills the map silently for users while every automated check stays green.
//
// To promote it: exercise /map, a listing detail with its side map, image
// upload, and push opt-in, collect the console violations, fold them in, THEN
// rename the header to `Content-Security-Policy`.
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
  `script-src 'self' 'unsafe-inline' https://www.gstatic.com${
    process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'"
  }`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data: https://*.supabase.co https://*.mapbox.com",
  "font-src 'self' data:",
  "worker-src 'self' blob:",
  "child-src 'self' blob:",
  "connect-src 'self' https://api.mapbox.com https://events.mapbox.com https://*.supabase.co https://us.i.posthog.com https://fcmregistrations.googleapis.com https://fcm.googleapis.com",
  "manifest-src 'self'",
].join("; ");

// Baseline security headers (SECURITY-AUDIT.md → remaining #3). Applied to every
// route.
const securityHeaders = [
  { key: "Content-Security-Policy-Report-Only", value: csp },
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
