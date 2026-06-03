import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

// Uses only the edge-safe config (no Prisma/bcrypt) to gate every page route.
export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  // Run on everything except API routes, Next internals, and static files.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
