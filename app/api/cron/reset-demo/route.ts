import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resetDemoWorld } from "@/prisma/seedDemo";

export const dynamic = "force-dynamic";
// The rebuild wipes and re-creates the whole demo world; give it room past the
// default serverless budget.
export const maxDuration = 60;

// Hit by Vercel Cron (which sends `Authorization: Bearer $CRON_SECRET`) or any
// external scheduler. If CRON_SECRET is set, the header must match. Rebuilds the
// curated demo world from scratch — restaurants, drop-offs, listings, and the
// seeded demo accounts (re-flagged demo:true) — so a day of demo clicking is
// wiped back to the pristine showcase. Real data is never touched.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    if (req.headers.get("authorization") !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    // Fail closed: never expose an unauthenticated rebuild endpoint in prod just
    // because the secret was left unset. (Local dev without a secret still runs.)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const counts = await resetDemoWorld(prisma);
  return NextResponse.json({ ok: true, ...counts });
}
