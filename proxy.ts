import NextAuth from "next-auth";
import { NextResponse, type NextRequest } from "next/server";
import { authConfig } from "./auth.config";
import { buildCsp, newNonce } from "./lib/csp";

// Uses only the edge-safe config (no Prisma/bcrypt) to gate every page route.
// Next 16 replaced the `middleware` file convention with `proxy`, and requires a
// default *function* export; the old `export const { auth: middleware } = ...`
// destructure is a const binding its static check rejects, so the handler is
// pulled out and exported directly.
const { auth } = NextAuth(authConfig);

// next-auth's `auth` used bare IS the middleware: it runs auth.config's
// `authorized` callback and returns either a redirect (gate denied, or an
// authed user bounced off a login page) or a pass-through response.
//
// It is called here rather than wrapped with `auth(callback)`. That wrapper
// form REPLACES the `authorized` gate instead of running after it — doing so
// left /map, /admin and /restaurant returning 200 to signed-out users. The gate
// stays entirely next-auth's; this only decorates responses it already allowed.
const authMiddleware = auth as unknown as (
  req: NextRequest,
  ctx: unknown,
) => Promise<Response | undefined>;

export default async function proxy(req: NextRequest, ctx: unknown) {
  const authRes = await authMiddleware(req, ctx);

  // A Location header means next-auth decided where this request goes. Hand it
  // back untouched — redirects carry no document that could run a script.
  if (authRes?.headers.get("location")) return authRes;

  const nonce = newNonce();
  const csp = buildCsp(nonce);

  // Next reads the nonce off the REQUEST's CSP header and stamps it onto the
  // inline bootstrap scripts it injects. Without this the page would render
  // un-nonced inline scripts under a policy that refuses them — a blank app.
  const headers = new Headers(req.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);

  const res = NextResponse.next({ request: { headers } });

  // Carry over any cookies next-auth set (it refreshes the session JWT), or
  // signing in would appear to work and then immediately log the user out.
  for (const cookie of authRes?.headers.getSetCookie?.() ?? []) {
    res.headers.append("set-cookie", cookie);
  }

  res.headers.set("Content-Security-Policy", csp);
  return res;
}

export const config = {
  // Run on everything except API routes, Next internals, and static files.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
