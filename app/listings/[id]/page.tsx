import { ListingDetail } from "@/components/ListingDetail";
import { getListing } from "@/lib/listings";
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
  const listing = await getListing(params.id, viewerId);

  // Decide chat access server-side: it depends on the user's role + restaurantId
  // (not carried in the JWT session) and the claim's parties.
  let canChat = false;
  if (viewerId) {
    const [user, ctx] = await Promise.all([
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
          pickup: { select: { volunteerId: true } },
        },
      }),
    ]);
    canChat = Boolean(user && ctx && canAccessChat(user, ctx));
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <ListingDetail listing={listing} viewerId={viewerId} canChat={canChat} />
    </main>
  );
}
