import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

// Uses only the edge-safe config (no Prisma/bcrypt) to gate every page route.
// Next 16 replaced the `middleware` file convention with `proxy`, and requires a
// default *function* export; the old `export const { auth: middleware } = ...`
// destructure is a const binding its static check rejects, so the handler is
// pulled out and exported directly.
const { auth } = NextAuth(authConfig);

export default auth;

export const config = {
  // Run on everything except API routes, Next internals, and static files.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
