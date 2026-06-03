import { RestaurantConsole } from "@/components/RestaurantConsole";
import { getListings } from "@/lib/listings";
import { prisma } from "@/lib/prisma";
import { RESTAURANT } from "@/lib/mock";

export const dynamic = "force-dynamic";

export default async function RestaurantPage() {
  // Until auth, the "logged-in restaurant" is the seeded one.
  const restaurant = await prisma.restaurant.findFirst({
    where: { name: RESTAURANT },
  });
  const all = await getListings();
  const mine = all.filter((l) => l.source === RESTAURANT);

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
          restaurant={RESTAURANT}
          restaurantId={restaurant.id}
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
