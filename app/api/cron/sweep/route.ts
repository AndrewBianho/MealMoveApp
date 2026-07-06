import { NextResponse } from "next/server";
import { runSweep, materializeSchedules } from "@/lib/sweep";
import { escalateBroadcasts } from "@/lib/broadcast";

export const dynamic = "force-dynamic";

// Hit by Vercel Cron (which sends `Authorization: Bearer $CRON_SECRET`) or any
// external scheduler. If CRON_SECRET is set, the header must match.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Top up future scheduled listings from active recurring posts first (these
  // carry future expiries, so the sweep below won't touch them).
  const materialized = await materializeSchedules();
  const swept = await runSweep();
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
