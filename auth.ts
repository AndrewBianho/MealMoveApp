import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authConfig } from "./auth.config";
import { rateLimit, resetLimit, clientIp, LIMITS } from "@/lib/rate-limit";
import { trackServer, identifyServer } from "@/lib/analytics";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  session: { strategy: "jwt" },
  // Auth.js auto-trusts the host in dev; production (next start / deploy) needs
  // this explicitly. Safe behind our own middleware + hosting.
  trustHost: true,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        const email = credentials?.email ? String(credentials.email).trim().toLowerCase() : "";
        const password = credentials?.password ? String(credentials.password) : "";
        if (!email || !password) return null;

        // Throttle failed logins: max 5 attempts per 15 min, keyed by IP +
        // account so a shared campus NAT can't lock everyone out, and a
        // successful login (below) clears the counter. Fails open if the
        // limiter is down — we never block a real user on limiter trouble.
        const ip = clientIp(new Headers(request?.headers));
        const limitKey = `auth:${ip}:${email}`;
        const gate = await rateLimit(limitKey, LIMITS.auth);
        if (!gate.ok) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user?.passwordHash) return null;

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;

        // A self-serve restaurant/drop-off account stays `pending` until an org
        // admin approves it — never issue a session before then. Checked after
        // the password so a wrong guess can't probe for pending accounts.
        if (user.status !== "active") return null;

        await resetLimit(limitKey);
        trackServer({ name: "login", props: { role: user.role } }, user.id);
        identifyServer(user.id, user.role);
        return { id: user.id, email: user.email, name: user.name, role: user.role };
      },
    }),
  ],
});
