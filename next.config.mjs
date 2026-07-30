// Baseline security headers (SECURITY-AUDIT.md → remaining #3). Applied to every
// route. Deliberately *not* a Content-Security-Policy: a strict CSP breaks
// Mapbox GL (worker-src blob:, its inline styles) and needs testing against the
// map pages before it ships — tracked as the remaining half of that item.
const securityHeaders = [
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
