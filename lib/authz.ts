import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { auth } from "@/auth";
import { ROLE_HOME } from "@/auth.config";

// Server-side authorization for pages, layouts, and route segments.
//
// The edge middleware (auth.config.ts) already gates routes by role, but a page
// must never *trust* that alone: if the matcher ever misses a path, middleware
// is bypassed, or a route is reached by an internal rewrite, the page itself is
// the last line of defense against forced browsing / direct-URL access. These
// helpers make that guard one line and keep the redirect targets identical to
// the middleware's, so page and edge always agree on who belongs where.

export type SessionUser = { id: string; role: Role };

/** Require any signed-in user. Sends anonymous callers to sign in. */
export async function requireUser(): Promise<SessionUser> {
  const session = await auth();
  const user = session?.user;
  if (!user?.id || !user.role) redirect("/login");
  return { id: user.id, role: user.role };
}

/**
 * Require one of `roles`. Anonymous callers go to sign in; a signed-in user
 * whose role isn't allowed is sent to their own role home (mirroring the
 * middleware), never shown the page.
 */
export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect(ROLE_HOME[user.role]);
  return user;
}
