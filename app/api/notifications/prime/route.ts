import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// Records that the volunteer has seen the one-time notification prime card, so
// it never reappears — whether they turned notifications on or chose "not now".
// Enabling notifications marks this separately (see register); this endpoint is
// the dismissal-only path.
export async function POST() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  await prisma.user.update({
    where: { id: userId },
    data: { notifyPrimedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
