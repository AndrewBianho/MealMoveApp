/**
 * The Content-Security-Policy, in one place.
 *
 * Built per request in `proxy.ts` so each response carries a fresh nonce. The
 * nonce is what lets `script-src` drop `'unsafe-inline'`: Next stamps the same
 * value onto the inline bootstrap scripts it injects, so those still run while
 * anything an attacker manages to inject does not.
 *
 * Deliberately NOT using `'strict-dynamic'`, which the Next docs suggest.
 * Browsers that honour it *ignore host allowlists entirely*, which would
 * silently drop www.gstatic.com (the Firebase messaging SDK) and
 * us-assets.i.posthog.com (PostHog's SDK chunks) — the exact origin the
 * report-only pass caught us missing. The nonce alone buys the thing that
 * matters here; strict-dynamic only adds ways to break it.
 *
 * Origins are read out of the code, not guessed. See SECURITY-AUDIT.md #3.
 */
export function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    // The nonce replaces 'unsafe-inline' here — that is the whole point of this
    // file. `'self'` still covers the bundles under /_next/static.
    `script-src 'self' 'nonce-${nonce}' https://www.gstatic.com https://us-assets.i.posthog.com`,
    // style-src keeps 'unsafe-inline': Next injects inline <style> for CSS-in-JS
    // and Mapbox styles its controls that way. Nonces do not reach either, so
    // tightening this needs a different approach than the script side.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data: https://*.supabase.co https://*.mapbox.com",
    "font-src 'self' data:",
    // Mapbox GL runs its tile decoder in a blob: worker.
    "worker-src 'self' blob:",
    "child-src 'self' blob:",
    "connect-src 'self' https://api.mapbox.com https://events.mapbox.com https://*.supabase.co https://us.i.posthog.com https://us-assets.i.posthog.com https://fcmregistrations.googleapis.com https://fcm.googleapis.com",
    "manifest-src 'self'",
  ].join("; ");
}

/**
 * A fresh nonce. Web Crypto rather than node:crypto — `proxy.ts` runs on the
 * edge runtime, where the node module is unavailable.
 */
export function newNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}
