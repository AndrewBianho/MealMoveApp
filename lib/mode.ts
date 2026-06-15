import { cache } from "react";
import { auth } from "@/auth";
import { prisma } from "./prisma";

// "demo" is a curated, fully interactive sample world; "real" is the chapter's
// live data. The choice is saved per-account (User.dataMode) so it follows the
// user across devices. Reads and writes are both scoped to the current mode.
export type DataMode = "real" | "demo";

// Resolved from the DB, deduped per request via React cache so reads don't each
// pay a lookup. Logged-out / unknown falls back to "real". We read the DB
// (one indexed PK lookup) rather than threading the mode through the NextAuth
// JWT — simpler, and avoids a session-refresh dance when the toggle flips.
export const getDataMode = cache(async (): Promise<DataMode> => {
  const session = await auth();
  if (!session?.user?.id) return "real";
  const u = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { dataMode: true },
  });
  return (u?.dataMode as DataMode) ?? "real";
});

export async function isDemo(): Promise<boolean> {
  return (await getDataMode()) === "demo";
}
