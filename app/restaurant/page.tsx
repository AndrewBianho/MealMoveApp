import { RestaurantConsole } from "@/components/RestaurantConsole";
import { TeamPanel } from "@/components/TeamPanel";
import { auth } from "@/auth";
import { getListings } from "@/lib/listings";
import { isDemo } from "@/lib/mode";
import { prisma } from "@/lib/prisma";
import { countActiveVolunteersNear } from "@/lib/nearby";
import { restaurantAccuracy } from "@/lib/accuracy";
import { RestaurantAccuracySummary } from "@/components/RestaurantAccuracySummary";
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
  const demo = await isDemo();

  // How many volunteers are active near this restaurant right now — an honest
  // "will someone show up?" signal for the post form and live cards.
  const nearbyVolunteers = restaurant
    ? await countActiveVolunteersNear(
        { lat: restaurant.lat, lng: restaurant.lng },
        { demo }
      )
    : 0;

  // How dependable this restaurant's pickups have been, per volunteers — a
  // private operations signal shown to the restaurant (and org admins).
  const accuracy = restaurant
    ? await restaurantAccuracy(restaurant.id)
    : null;

  // This restaurant's recurring schedules, newest first.
  const schedules = restaurant
    ? (
        await prisma.recurringPost.findMany({
          where: { restaurantId: restaurant.id },
          orderBy: { createdAt: "desc" },
        })
      ).map((s) => ({
        id: s.id,
        title: s.title,
        servings: s.servings,
        daysOfWeek: s.daysOfWeek,
        timeOfDay: s.timeOfDay,
        windowMinutes: s.windowMinutes,
        notes: s.notes ?? undefined,
        active: s.active,
      }))
    : [];

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
        <h1 className="text-[40px] font-semibold leading-[1.1] tracking-tight text-balance">Restaurant console</h1>
        <p className="mt-1 text-sm text-neutral-700">
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
            schedules={schedules}
            nearbyVolunteers={nearbyVolunteers}
          />
          {accuracy && (
            <div className="mt-8 max-w-md rounded-3xl bg-card p-6 shadow-card">
              <RestaurantAccuracySummary data={accuracy} />
            </div>
          )}
          <div className="mt-8 max-w-md">
            <TeamPanel
              members={members}
              invites={invites}
              description="Everyone here manages this restaurant together — listings, photos, and pickups are shared."
              demo={demo}
            />
          </div>
        </>
      ) : (
        <p className="text-sm text-neutral-700">
          Restaurant account not found. Run <code className="font-mono">npm run db:seed</code>.
        </p>
      )}
    </main>
  );
}
