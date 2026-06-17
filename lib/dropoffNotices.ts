import { prisma } from "./prisma";
import type { DropOffNoticeKind, DropOffNoticeView } from "./types";

// A notice is "active" until its `until` passes (null = no expiry). Expired
// notices stay in the table as a record but are never shown — they just age out.
function activeWhere(now: Date) {
  return { OR: [{ until: null }, { until: { gt: now } }] };
}

function serialize(n: {
  id: string;
  kind: string;
  body: string;
  until: Date | null;
  createdAt: Date;
  author?: { name: string } | null;
}): DropOffNoticeView {
  return {
    id: n.id,
    kind: n.kind as DropOffNoticeKind,
    body: n.body,
    until: n.until?.getTime(),
    createdAt: n.createdAt.getTime(),
    authorName: n.author?.name,
  };
}

/** Active notices for one drop-off, newest first. */
export async function getActiveDropOffNotices(
  dropOffId: string,
  now = new Date()
): Promise<DropOffNoticeView[]> {
  const rows = await prisma.dropOffNotice.findMany({
    where: { dropOffId, ...activeWhere(now) },
    orderBy: { createdAt: "desc" },
    include: { author: { select: { name: true } } },
  });
  return rows.map(serialize);
}

/** Active notices for many drop-offs at once, keyed by dropOffId (console use). */
export async function getActiveNoticesByDropOff(
  dropOffIds: string[],
  now = new Date()
): Promise<Record<string, DropOffNoticeView[]>> {
  if (dropOffIds.length === 0) return {};
  const rows = await prisma.dropOffNotice.findMany({
    where: { dropOffId: { in: dropOffIds }, ...activeWhere(now) },
    orderBy: { createdAt: "desc" },
    include: { author: { select: { name: true } } },
  });
  const byId: Record<string, DropOffNoticeView[]> = {};
  for (const r of rows) (byId[r.dropOffId] ??= []).push(serialize(r));
  return byId;
}
