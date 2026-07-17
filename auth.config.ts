import type { NextAuthConfig } from "next-auth";
import type { Role } from "@prisma/client";

// Edge-safe config: NO Prisma / bcrypt imports here, because the middleware
// bundles this file for the edge runtime. The Credentials provider (which does
// touch the DB) lives in auth.ts instead.

// Where each role lands after login. Exported so the server-side page guards
// (`lib/authz.ts`) redirect to the same home the edge middleware does — one
// source of truth for "where does this role belong".
export const ROLE_HOME: Record<Role, string> = {
  volunteer: "/",
  restaurant: "/restaurant",
  drop_off: "/dropoff",
  org_admin: "/",
};

// Role-restricted route prefixes. Anything not listed is open to any signed-in
// user (e.g. /impact, /styleguide). The feed "/" is volunteer/org_admin.
const ACCESS: { prefix: string; roles: Role[] }[] = [
  { prefix: "/", roles: ["volunteer", "org_admin"] },
  { prefix: "/map", roles: ["volunteer", "org_admin"] },
  { prefix: "/pickups", roles: ["volunteer", "org_admin"] },
  { prefix: "/restaurant", roles: ["restaurant", "org_admin"] },
  { prefix: "/dropoff", roles: ["drop_off", "org_admin"] },
  { prefix: "/admin", roles: ["org_admin"] },
];

function matches(path: string, prefix: string): boolean {
  return prefix === "/" ? path === "/" : path === prefix || path.startsWith(prefix + "/");
}

export const authConfig = {
  pages: { signIn: "/login" },
  providers: [], // real provider added in auth.ts
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const user = auth?.user;
      const path = nextUrl.pathname;
      const isAuthPage = ["/login", "/signup", "/forgot-password", "/reset-password"].includes(path);
      // Public pages — viewable without signing in (design reference, and the
      // privacy policy, which must be reachable before anyone creates an account).
      const isPublic = path === "/styleguide" || path === "/privacy";

      if (!user) return isAuthPage || isPublic; // signed out: auth pages + public

      if (isAuthPage) {
        return Response.redirect(new URL(ROLE_HOME[user.role], nextUrl));
      }

      const rule = ACCESS.find((r) => matches(path, r.prefix));
      if (rule && !rule.roles.includes(user.role)) {
        return Response.redirect(new URL(ROLE_HOME[user.role], nextUrl));
      }
      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.id as string;
      session.user.role = token.role as Role;
      return session;
    },
  },
} satisfies NextAuthConfig;
