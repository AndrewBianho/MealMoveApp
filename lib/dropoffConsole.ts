import { requireRole } from "@/lib/authz";
import { getDropOffs } from "@/lib/map";
import { getListings } from "@/lib/listings";
import { getActiveNoticesByDropOff } from "@/lib/dropoffNotices";
import { isDemo } from "@/lib/mode";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/roles";

// Shared data for the drop-off console, now split across four tab routes
// (About us / Conversations / Incoming / Impact). Each route loads this once
// and renders its own slice, so the auth + scoping logic lives in one place.
//
// A `drop_off` account is scoped to the single location it speaks for; an org
// admin inherits the chapter-wide view (every location at once). Impact data
// is *not* here — only the Impact route needs those aggregates, so it fetches
// them itself to keep the other tabs light.
export async function loadDropOffConsole() {
  // The console belongs to a `drop_off` account (its own location) or an
  // `org_admin` (redirected on to analytics by each tab). Volunteers and
  // restaurants are turned away here, not just by middleware.
  const { id: viewerId, role } = await requireRole("drop_off", "org_admin");
  const isOrgAdmin = isAdmin(role);

  let myDropOffId: string | null = null;
  if (!isOrgAdmin && viewerId) {
    const me = await prisma.user.findUnique({
      where: { id: viewerId },
      select: { dropOffId: true },
    });
    myDropOffId = me?.dropOffId ?? null;
  }

  const [all, allLocations] = await Promise.all([getListings(), getDropOffs()]);
  const demo = await isDemo();

  const locations = isOrgAdmin
    ? allLocations
    : allLocations.filter((d) => d.id === myDropOffId);
  const managedIds = new Set(locations.map((d) => d.id));

  const noticesByDropOff = await getActiveNoticesByDropOff(
    locations.map((d) => d.id)
  );

  // The team that shares this location: its own members + open invites. Org
  // admins manage roles/accounts on the Members page instead, so no team panel.
  const [members, invites] =
    !isOrgAdmin && myDropOffId
      ? await Promise.all([
          prisma.user.findMany({
            where: { dropOffId: myDropOffId },
            select: { id: true, name: true, email: true },
            orderBy: { createdAt: "asc" },
          }),
          prisma.teamInvite.findMany({
            where: { dropOffId: myDropOffId, role: "drop_off", status: "pending" },
            select: { id: true, email: true },
            orderBy: { createdAt: "asc" },
          }),
        ])
      : [[], []];

  const managed = (l: (typeof all)[number]) =>
    l.dropOffId != null && managedIds.has(l.dropOffId);
  // A multi-car listing stays "open" until every car is claimed, but food is
  // already headed here once anyone has claimed.
  const incoming = all.filter(
    (l) =>
      managed(l) &&
      (["claimed", "in transit", "taken home"].includes(l.status) ||
        (l.status === "open" && (l.claimedCount ?? 0) > 0))
  );
  const arrived = all.filter((l) => managed(l) && l.status === "delivered");

  const own = !isOrgAdmin ? locations[0] ?? null : null;

  return {
    viewerId,
    isOrgAdmin,
    myDropOffId,
    locations,
    own,
    demo,
    noticesByDropOff,
    members,
    invites,
    incoming,
    arrived,
  };
}

export type DropOffConsole = Awaited<ReturnType<typeof loadDropOffConsole>>;

// Shape the inbound listings into the three-way chat threads DropOffChats
// wants — shared by the org-admin console and the Conversations tab.
export function dropOffChatThreads(incoming: DropOffConsole["incoming"]) {
  return incoming.map((l) => ({
    id: l.id,
    title: l.title,
    source: l.source,
    dropOff: l.dropOff,
    volunteerName: l.claimedBy,
    status: l.status,
  }));
}
