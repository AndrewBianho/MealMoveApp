import { ListingDetail } from "@/components/ListingDetail";
import { getListing } from "@/lib/listings";
import { getActiveDropOffNotices } from "@/lib/dropoffNotices";
import { canAccessChat } from "@/lib/chat";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

export default async function ListingDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await auth();
  const viewerId = session?.user?.id;
  const canClaim = session?.user?.role !== "org_admin";
  const listing = await getListing(params.id, viewerId);

  // Any active service notices for this listing's drop-off — a volunteer
  // heading there should see "closing early / fridge down" up front.
  const listingRow = await prisma.foodListing.findUnique({
    where: { id: params.id },
    select: { dropOffId: true },
  });
  const dropOffNotices = listingRow?.dropOffId
    ? await getActiveDropOffNotices(listingRow.dropOffId)
    : [];

  // Decide chat access server-side: it depends on the user's role + restaurantId
  // (not carried in the JWT session) and the claim's parties.
  let canChat = false;
  // A pending buddy invite addressed to this viewer, and the primary's
  // outstanding invite — both drive the buddy UI.
  let incomingInvite: { id: string; inviterName: string } | null = null;
  let outgoingInvite: { inviteeName: string } | null = null;
  if (viewerId) {
    const [user, ctx, mine, pending] = await Promise.all([
      prisma.user.findUnique({
        where: { id: viewerId },
        select: { id: true, role: true, restaurantId: true },
      }),
      prisma.foodListing.findUnique({
        where: { id: params.id },
        select: {
          id: true,
          restaurantId: true,
          dropOffId: true,
          status: true,
          pickup: { select: { volunteerId: true, buddyId: true } },
        },
      }),
      prisma.buddyInvite.findFirst({
        where: { listingId: params.id, inviteeId: viewerId, status: "pending" },
        include: { inviter: { select: { name: true } } },
      }),
      prisma.buddyInvite.findFirst({
        where: { listingId: params.id, status: "pending" },
        include: { invitee: { select: { name: true } } },
      }),
    ]);
    canChat = Boolean(user && ctx && canAccessChat(user, ctx));
    if (mine) incomingInvite = { id: mine.id, inviterName: mine.inviter.name };
    // Only the primary should see the outgoing-invite state.
    if (pending && ctx?.pickup?.volunteerId === viewerId) {
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
      />
    </main>
  );
}
