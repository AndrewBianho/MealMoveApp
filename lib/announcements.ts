import type { PrismaClient } from "@prisma/client";
import { prisma } from "./prisma";
import { dispatchToUser, type NotifyPayload } from "./notify-dispatch";
import { absoluteUrl, escapeHtml } from "./email";
import { resolveAudience, type Audience } from "./segments";

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

type SendDb = Pick<
  PrismaClient,
  "announcement" | "user" | "listingEvent" | "pickup" | "restaurant" | "dropOff"
>;

export async function sendAnnouncement(
  input: {
    authorId: string;
    title: string;
    body: string;
    world: World;
    audience: Audience;
    // The sending admin's organization; the audience is scoped to it and the
    // row records which org's volunteers this reached.
    organizationId: string;
  },
  deps: {
    db?: SendDb;
    dispatch?: typeof dispatchToUser;
    resolve?: typeof resolveAudience;
    now?: Date;
  } = {}
): Promise<{ announcementId: string; recipientCount: number }> {
  const db = deps.db ?? prisma;
  const dispatch = deps.dispatch ?? dispatchToUser;
  const resolve = deps.resolve ?? resolveAudience;
  const demo = input.world === "demo";

  // Who hears it. `{ kind: "everyone" }` is the whole active in-world roster —
  // the original behavior.
  const { ids, label } = await resolve(input.audience, input.world, {
    db,
    now: deps.now,
    organizationId: input.organizationId,
  });

  // Closes a TOCTOU: the action's own zero-check can pass and the audience
  // still resolve to nobody by the time we get here (e.g. it shrank in
  // between). Never create an announcement row with nobody to hear it.
  if (ids.length === 0) {
    throw new Error("This group has no volunteers right now.");
  }

  const announcement = await db.announcement.create({
    data: {
      authorId: input.authorId,
      title: input.title,
      body: input.body,
      demo,
      audienceLabel: label,
      recipientIds: ids,
      organizationId: input.organizationId,
    },
    select: { id: true },
  });

  const payload = buildAnnouncementPayload(input);
  await Promise.all(ids.map((id) => dispatch(id, payload, { force: true })));

  await db.announcement.update({
    where: { id: announcement.id },
    data: { recipientCount: ids.length },
  });

  return { announcementId: announcement.id, recipientCount: ids.length };
}

// The admin sent log: every in-world announcement, regardless of who it was
// targeted at. Do not scope this by recipient — the org admin needs to see
// the full send history, targeted or not.
export async function listAnnouncements(
  world: World,
  deps: { db?: Pick<PrismaClient, "announcement"> } = {}
) {
  const db = deps.db ?? prisma;
  return db.announcement.findMany({
    where: { demo: world === "demo" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      body: true,
      createdAt: true,
      recipientCount: true,
      audienceLabel: true,
    },
  });
}

// The volunteer's durable inbox (/updates): only announcements actually
// targeted at this volunteer, not every in-world send.
export async function listAnnouncementsFor(
  userId: string,
  world: World,
  deps: { db?: Pick<PrismaClient, "announcement"> } = {}
) {
  const db = deps.db ?? prisma;
  return db.announcement.findMany({
    where: { demo: world === "demo", recipientIds: { has: userId } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      body: true,
      createdAt: true,
      recipientCount: true,
      audienceLabel: true,
    },
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
      recipientIds: { has: userId },
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
