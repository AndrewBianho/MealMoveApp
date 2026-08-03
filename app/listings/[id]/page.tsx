import { ListingDetail } from "@/components/ListingDetail";
import { getListing } from "@/lib/listings";
import { getActiveDropOffNotices } from "@/lib/dropoffNotices";
import { canAccessChat } from "@/lib/chat";
import { getDropOffs } from "@/lib/map";
import { rankDropOffs } from "@/lib/recommend";
import { findActiveClaimFor } from "@/lib/activeClaim";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/authz";
import { isAdmin } from "@/lib/roles";
import { isDemo } from "@/lib/mode";
import type { DropOffChoice } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ListingDetailPage(
  props: {
    params: Promise<{ id: string }>;
  }
) {
  const params = await props.params;
  const viewer = await requireUser();
  const viewerId = viewer.id;
  const canClaim = !isAdmin(viewer.role);
  const demo = await isDemo();
  const listing = await getListing(params.id, viewerId);

  // Any active service notices for this listing's drop-off — a volunteer
  // heading there should see "closing early / fridge down" up front.
  const listingRow = await prisma.foodListing.findUnique({
    where: { id: params.id },
    select: {
      demo: true,
      dropOffId: true,
      status: true,
      category: true,
      perishable: true,
      servings: true,
      restaurant: { select: { lat: true, lng: true } },
      // The chosen destination's pin for the side map, once a claim set it.
      dropOff: { select: { id: true, name: true, lat: true, lng: true } },
    },
  });
  // World isolation: a listing from the other world (demo vs real) is treated
  // as not existing, so its URL can't be reached by direct browsing.
  if (listingRow && listingRow.demo !== demo) notFound();

  const dropOffNotices = listingRow?.dropOffId
    ? await getActiveDropOffNotices(listingRow.dropOffId)
    : [];

  // Destination-first claiming: an open listing with no drop-off yet needs the
  // claiming volunteer to pick one. Offer only locations that can actually take
  // this food (category, refrigeration), nearest to the restaurant
  // first — the same ranking the map recommendation uses.
  let dropOffChoices: DropOffChoice[] = [];
  if (canClaim && listingRow && listingRow.status === "open" && !listingRow.dropOffId) {
    const dropOffs = await getDropOffs();
    dropOffChoices = rankDropOffs(
      {
        id: params.id,
        name: "",
        lat: listingRow.restaurant.lat,
        lng: listingRow.restaurant.lng,
        servings: listingRow.servings,
        categories: [listingRow.category],
        perishable: listingRow.perishable,
        count: 1,
      },
      dropOffs
    )
      .filter((x) => x.eligible)
      .map((x) => ({
        id: x.dropOff.id,
        name: x.dropOff.name,
        lat: x.dropOff.lat,
        lng: x.dropOff.lng,
        miles: x.miles,
        refrigerated: x.dropOff.refrigerated,
        needLevel: x.dropOff.needLevel,
        retrievalHours: x.dropOff.retrievalHours,
        notes: x.dropOff.notes,
      }));
  }

  // One rescue at a time: if the viewer is already on a live claim elsewhere,
  // this page shows a gentle "finish that one first" notice instead of the
  // claim flow (the server action enforces the same rule).
  const activeElsewhere =
    viewerId && canClaim && listingRow?.status === "open"
      ? await findActiveClaimFor(prisma, viewerId, params.id)
      : null;

  // Decide chat access server-side: it depends on the user's role + restaurantId
  // (not carried in the JWT session) and the claim's parties.
  let canChat = false;
  // A pending buddy invite addressed to this viewer, and the primary's
  // outstanding invite — both drive the buddy UI.
  let incomingInvite: { id: string; inviterName: string } | null = null;
  let outgoingInvite: { inviteeName: string } | null = null;
  // Whether to offer the one-time post-claim notification prime to this viewer.
  let canPrimeNotifications = false;
  if (viewerId) {
    const [user, ctx, mine, pending] = await Promise.all([
      prisma.user.findUnique({
        where: { id: viewerId },
        select: {
          id: true,
          role: true,
          restaurantId: true,
          dropOffId: true,
          notificationsEnabled: true,
          notifyPrimedAt: true,
        },
      }),
      prisma.foodListing.findUnique({
        where: { id: params.id },
        select: {
          id: true,
          restaurantId: true,
          dropOffId: true,
          status: true,
          pickups: { select: { volunteerId: true, buddyId: true } },
        },
      }),
      prisma.buddyInvite.findFirst({
        where: { listingId: params.id, inviteeId: viewerId, status: "pending" },
        include: { inviter: { select: { name: true } } },
      }),
      prisma.buddyInvite.findFirst({
        // Scoped to this viewer's own invite — on a multi-car listing each
        // primary only sees the invite they sent.
        where: { listingId: params.id, inviterId: viewerId, status: "pending" },
        include: { invitee: { select: { name: true } } },
      }),
    ]);
    canChat = Boolean(user && ctx && canAccessChat(user, ctx));
    // Volunteers only, and only if they haven't already opted in or been asked.
    canPrimeNotifications = Boolean(
      canClaim && user && !user.notificationsEnabled && !user.notifyPrimedAt
    );
    if (mine) incomingInvite = { id: mine.id, inviterName: mine.inviter.name };
    // Only the primary should see the outgoing-invite state.
    if (pending && ctx?.pickups?.some((p) => p.volunteerId === viewerId)) {
      outgoingInvite = { inviteeName: pending.invitee.name };
    }
  }

  return (
    <main className="mx-auto max-w-[1760px] px-6 py-8">
      <ListingDetail
        listing={listing}
        viewerId={viewerId}
        canChat={canChat}
        canClaim={canClaim}
        incomingInvite={incomingInvite}
        outgoingInvite={outgoingInvite}
        dropOffNotices={dropOffNotices}
        dropOffChoices={dropOffChoices}
        activeElsewhere={activeElsewhere}
        chosenDropOffPin={listingRow?.dropOff ?? null}
        canPrimeNotifications={canPrimeNotifications}
      />
    </main>
  );
}
