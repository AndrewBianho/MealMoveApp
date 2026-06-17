import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  let token = "";
  try {
    const body = await req.json();
    token = typeof body?.token === "string" ? body.token : "";
  } catch {
    token = "";
  }

  const userAgent = req.headers.get("user-agent")?.slice(0, 255) ?? null;

  if (token) {
    await prisma.deviceToken.upsert({
      where: { token },
      update: { userId, userAgent, lastSeenAt: new Date() },
      create: { userId, token, userAgent },
    });
  }
  // Enabling counts as being primed too, so the one-time prime card never
  // reappears after a claim even if the user later turns notifications off.
  await prisma.user.update({
    where: { id: userId },
    data: { notificationsEnabled: true, notifyPrimedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
