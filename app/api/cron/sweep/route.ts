import { NextResponse } from "next/server";
import { runSweep } from "@/lib/sweep";
import { dispatchCheckIns } from "@/lib/checkins";

export const dynamic = "force-dynamic";

// Hit by Vercel Cron (which sends `Authorization: Bearer $CRON_SECRET`) or any
// external scheduler. If CRON_SECRET is set, the header must match.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Sweep FIRST so any just-expired hold is released before the nudge pass —
  // a claim that's both due for a nudge and past its hold is released, not nudged.
  const swept = await runSweep();
  const checkins = await dispatchCheckIns();
  return NextResponse.json({ ok: true, ...swept, ...checkins });
}
