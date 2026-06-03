import { PrismaClient } from "@prisma/client";

// Single PrismaClient across hot reloads in dev — otherwise Next's module
// reloading spawns a new client (and connection pool) on every change.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
