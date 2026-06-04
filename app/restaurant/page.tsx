import { RestaurantConsole } from "@/components/RestaurantConsole";
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

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-[32px] font-medium leading-tight">Restaurant console</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Post tonight&apos;s surplus and track who&apos;s picking it up.
        </p>
      </header>

      {restaurant ? (
        <RestaurantConsole
          restaurant={restaurant.name}
          restaurantId={restaurant.id}
          restaurantImageUrl={restaurant.imageUrl}
          listings={mine}
        />
      ) : (
        <p className="text-sm text-neutral-600">
          Restaurant account not found. Run <code className="font-mono">npm run db:seed</code>.
        </p>
      )}
    </main>
  );
}
