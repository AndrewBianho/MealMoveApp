import type { Role } from "@prisma/client";
import type { DefaultSession } from "next-auth";

// Add our domain fields (id, role) to the session/user/JWT types.
declare module "next-auth" {
  interface Session {
    user: { id: string; role: Role } & DefaultSession["user"];
  }
  interface User {
    role: Role;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
  }
}
