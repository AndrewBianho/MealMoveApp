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

  // Remove this device's token (or all of the user's, if none was supplied).
  await prisma.deviceToken.deleteMany({
    where: token ? { userId, token } : { userId },
  });

  const remaining = await prisma.deviceToken.count({ where: { userId } });
  if (remaining === 0) {
    await prisma.user.update({
      where: { id: userId },
      data: { notificationsEnabled: false },
    });
  }

  return NextResponse.json({ ok: true, remaining });
}
