import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  canAccessChat,
  isChatActive,
  listMessages,
  postMessage,
} from "@/lib/chat";

export const runtime = "nodejs";

// Load the acting user + the claim, and authorize. The user is read from the DB
// (not just the session) because access depends on restaurantId, which the JWT
// session doesn't carry.
async function loadContext(listingId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      error: NextResponse.json({ error: "Not authenticated." }, { status: 401 }),
    } as const;
  }
  const [user, listing] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, role: true, restaurantId: true },
    }),
    prisma.foodListing.findUnique({
      where: { id: listingId },
      select: {
        id: true,
        restaurantId: true,
        dropOffId: true,
        status: true,
        pickup: { select: { volunteerId: true } },
      },
    }),
  ]);
  if (!user || !listing) {
    return { error: NextResponse.json({ error: "Not found." }, { status: 404 }) } as const;
  }
  if (!canAccessChat(user, listing)) {
    return { error: NextResponse.json({ error: "Not allowed." }, { status: 403 }) } as const;
  }
  return { user, listing } as const;
}

// Poll the thread. `?since=<ISO>` returns only newer messages for cheap updates.
export async function GET(
  req: Request,
  { params }: { params: { listingId: string } }
) {
  const ctx = await loadContext(params.listingId);
  if ("error" in ctx) return ctx.error;

  const since = new URL(req.url).searchParams.get("since") ?? undefined;
  const messages = await listMessages(prisma, params.listingId, since);
  return NextResponse.json({
    active: isChatActive(ctx.listing),
    messages: messages.map((m) => ({
      id: m.id,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
      senderId: m.sender.id,
      senderName: m.sender.name,
      senderRole: m.sender.role,
    })),
  });
}

export async function POST(
  req: Request,
  { params }: { params: { listingId: string } }
) {
  const ctx = await loadContext(params.listingId);
  if ("error" in ctx) return ctx.error;

  let body: unknown;
  try {
    ({ body } = (await req.json()) as { body?: unknown });
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    const m = await postMessage(
      prisma,
      ctx.user,
      ctx.listing,
      typeof body === "string" ? body : ""
    );
    return NextResponse.json({ id: m.id });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Couldn't send.";
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
