import { NextResponse } from "next/server";
import { runSweep, materializeSchedules } from "@/lib/sweep";
import { escalateBroadcasts } from "@/lib/broadcast";
import { trackServer } from "@/lib/analytics";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Hit by Vercel Cron (which sends `Authorization: Bearer $CRON_SECRET`) or any
// external scheduler. If CRON_SECRET is set, the header must match.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    if (req.headers.get("authorization") !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    // Fail closed: the sweep mutates real listings (expiries, broadcasts), so in
    // prod it must never run unauthenticated. (Local dev without a secret runs.)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Top up future scheduled listings from active recurring posts first (these
  // carry future expiries, so the sweep below won't touch them).
  const materialized = await materializeSchedules();
  // Snapshot the listings the sweep is about to expire (same filter runSweep
  // uses internally for stale open listings) so we can emit a truth event per
  // listing with its servings/age after the sweep flips their status. This
  // mirrors runSweep's own query without touching lib/sweep.ts; it can miss
  // the rare listing that flakes and expires within the same sweep pass
  // (open only after runSweep's own flake-release step), which is an
  // acceptable analytics gap.
  const now = new Date();
  const candidates = await prisma.foodListing.findMany({
    where: {
      status: "open",
      expiresAt: { lt: now },
      NOT: { demo: true, recurringPostId: null },
    },
    select: { id: true, servings: true, postedAt: true },
  });
  const swept = await runSweep();
  if (candidates.length > 0) {
    const expiredNow = await prisma.foodListing.findMany({
      where: { id: { in: candidates.map((c) => c.id) }, status: "expired" },
      select: { id: true },
    });
    const expiredIds = new Set(expiredNow.map((l) => l.id));
    for (const listing of candidates) {
      if (!expiredIds.has(listing.id)) continue;
      trackServer({
        name: "listing_expired_unclaimed",
        props: {
          servings: listing.servings ?? 0,
          minutesLive: Math.round((Date.now() - listing.postedAt.getTime()) / 60000),
        },
      });
    }
  }
  // Escalate AFTER the sweep so just-expired listings are already out of the
  // pool — we only broadcast food that's still claimable. Reach widens as each
  // listing's window narrows; dedupe keeps it to one ping per volunteer/band.
  const broadcasts = await escalateBroadcasts();
  return NextResponse.json({
    ok: true,
    ...materialized,
    ...swept,
    broadcasts,
  });
}
