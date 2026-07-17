import { redirect } from "next/navigation";
import { RestaurantListings } from "@/components/RestaurantListings";
import { RestaurantAccuracySummary } from "@/components/RestaurantAccuracySummary";
import { auth } from "@/auth";
import { requireRole } from "@/lib/authz";
import { getListings } from "@/lib/listings";
import { isDemo } from "@/lib/mode";
import { prisma } from "@/lib/prisma";
import { countActiveVolunteersNear } from "@/lib/nearby";
import { restaurantAccuracy } from "@/lib/accuracy";
import { RESTAURANT } from "@/lib/mock";

export const dynamic = "force-dynamic";

/**
 * The tracking side of the restaurant surface: everything this restaurant has
 * posted — live, scheduled, and past — plus its pickup-accuracy summary.
 * Posting lives on /restaurant.
 */
export default async function RestaurantListingsPage() {
  await requireRole("restaurant", "org_admin");
  const session = await auth();
  // Org admins oversee the chapter, not any one restaurant's listings — send
  // them to their analytics home rather than showing this tracking surface.
  if (session?.user?.role === "org_admin") redirect("/admin/analytics");
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
  const demo = await isDemo();

  // Live cards show how many volunteers are active nearby right now — the
  // honest "will someone show up?" signal.
  const nearbyVolunteers = restaurant
    ? await countActiveVolunteersNear(
        { lat: restaurant.lat, lng: restaurant.lng },
        { demo }
      )
    : 0;

  // How dependable this restaurant's pickups have been, per volunteers — a
  // private operations signal shown to the restaurant (and org admins).
  const accuracy = restaurant ? await restaurantAccuracy(restaurant.id, demo) : null;

  return (
    <main className="mx-auto max-w-[1760px] px-6 py-8">
      <header className="mb-6">
        <h1 className="text-[40px] font-semibold leading-[1.1] tracking-tight text-balance">Your listings</h1>
        <p className="mt-1 text-sm text-neutral-700">
          What&apos;s live now, what&apos;s queued, and how past pickups went.
        </p>
      </header>

      {restaurant ? (
        <>
          <RestaurantListings listings={mine} nearbyVolunteers={nearbyVolunteers} />
          {accuracy && (
            <div className="mt-8 max-w-md rounded-3xl bg-card p-6 shadow-card">
              <RestaurantAccuracySummary data={accuracy} />
            </div>
          )}
        </>
      ) : (
        <p className="text-sm text-neutral-700">
          Restaurant account not found. Run <code className="font-mono">npm run db:seed</code>.
        </p>
      )}
    </main>
  );
}
