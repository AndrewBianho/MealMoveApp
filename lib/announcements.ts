import type { PrismaClient } from "@prisma/client";
import { prisma } from "./prisma";
import { dispatchToUser, type NotifyPayload } from "./notify-dispatch";
import { absoluteUrl, escapeHtml } from "./email";

export type World = "real" | "demo";

// FCM push bodies get truncated by the OS anyway; keep it short and add an
// ellipsis so the full text is clearly waiting in the inbox.
const PUSH_BODY_MAX = 140;

export function buildAnnouncementPayload(a: {
  title: string;
  body: string;
}): NotifyPayload {
  const pushBody =
    a.body.length > PUSH_BODY_MAX
      ? a.body.slice(0, PUSH_BODY_MAX - 1).trimEnd() + "…"
      : a.body;
  const html =
    escapeHtml(a.body)
      .split(/\n{2,}/)
      .map((para) => `<p>${para.replace(/\n/g, "<br/>")}</p>`)
      .join("") +
    `<p><a href="${absoluteUrl("/updates")}">See it in Meal Move</a></p>`;
  return {
    title: a.title,
    body: pushBody,
    url: "/updates",
    email: { subject: a.title, html },
  };
}

type SendDb = Pick<PrismaClient, "announcement" | "user">;

export async function sendAnnouncement(
  input: { authorId: string; title: string; body: string; world: World },
  deps: { db?: SendDb; dispatch?: typeof dispatchToUser } = {}
): Promise<{ announcementId: string; recipientCount: number }> {
  const db = deps.db ?? prisma;
  const dispatch = deps.dispatch ?? dispatchToUser;
  const demo = input.world === "demo";

  const announcement = await db.announcement.create({
    data: { authorId: input.authorId, title: input.title, body: input.body, demo },
    select: { id: true },
  });

  const volunteers = await db.user.findMany({
    where: { role: "volunteer", status: "active", dataMode: input.world },
    select: { id: true },
  });

  const payload = buildAnnouncementPayload(input);
  await Promise.all(volunteers.map((v) => dispatch(v.id, payload, { force: true })));

  await db.announcement.update({
    where: { id: announcement.id },
    data: { recipientCount: volunteers.length },
  });

  return { announcementId: announcement.id, recipientCount: volunteers.length };
}

export async function listAnnouncements(
  world: World,
  deps: { db?: Pick<PrismaClient, "announcement"> } = {}
) {
  const db = deps.db ?? prisma;
  return db.announcement.findMany({
    where: { demo: world === "demo" },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, body: true, createdAt: true, recipientCount: true },
  });
}

export async function unseenCount(
  userId: string,
  world: World,
  deps: { db?: Pick<PrismaClient, "announcement" | "user"> } = {}
): Promise<number> {
  const db = deps.db ?? prisma;
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { announcementsSeenAt: true },
  });
  const seenAt = user?.announcementsSeenAt ?? null;
  return db.announcement.count({
    where: {
      demo: world === "demo",
      ...(seenAt ? { createdAt: { gt: seenAt } } : {}),
    },
  });
}

export async function markSeen(
  userId: string,
  deps: { db?: Pick<PrismaClient, "user">; now?: Date } = {}
): Promise<void> {
  const db = deps.db ?? prisma;
  const now = deps.now ?? new Date();
  await db.user.update({
    where: { id: userId },
    data: { announcementsSeenAt: now },
  });
}
