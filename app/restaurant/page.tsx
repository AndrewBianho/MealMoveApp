import { RestaurantConsole } from "@/components/RestaurantConsole";
import { TeamPanel } from "@/components/TeamPanel";
import { auth } from "@/auth";
import { getListings } from "@/lib/listings";
import { prisma } from "@/lib/prisma";
import { RESTAURANT } from "@/lib/mock";

export const dynamic = "force-dynamic";

export default async function RestaurantPage() {
  const session = await auth();
  const me = session?.user?.id
    ? await prisma.user.findUnique({
        where: { id: session.user.id },
        include: { restaurant: true },
      })
    : null;
  const restaurant =
    me?.restaurant ?? (await prisma.restaurant.findFirst({ where: { name: RESTAURANT } }));

  const all = await getListings();
  const mine = restaurant ? all.filter((l) => l.source === restaurant.name) : [];

  // The team that shares this restaurant: every linked member + open invites.
  const members = restaurant
    ? await prisma.user.findMany({
        where: { restaurantId: restaurant.id },
        select: { id: true, name: true, email: true },
        orderBy: { createdAt: "asc" },
      })
    : [];
  const invites = restaurant
    ? await prisma.teamInvite.findMany({
        where: { restaurantId: restaurant.id, role: "restaurant", status: "pending" },
        select: { id: true, email: true },
        orderBy: { createdAt: "asc" },
      })
    : [];

  return (
    <main className="mx-auto max-w-[1760px] px-6 py-8">
      <header className="mb-6">
        <h1 className="text-[32px] font-medium leading-tight">Restaurant console</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Post tonight&apos;s surplus and track who&apos;s picking it up.
        </p>
      </header>

      {restaurant ? (
        <>
          <RestaurantConsole
            restaurant={restaurant.name}
            restaurantId={restaurant.id}
            restaurantImageUrl={restaurant.imageUrl}
            listings={mine}
          />
          <div className="mt-8 max-w-md">
            <TeamPanel
              members={members}
              invites={invites}
              description="Everyone here manages this restaurant together — listings, photos, and pickups are shared."
            />
          </div>
        </>
      ) : (
        <p className="text-sm text-neutral-600">
          Restaurant account not found. Run <code className="font-mono">npm run db:seed</code>.
        </p>
      )}
    </main>
  );
}
