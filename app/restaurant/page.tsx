import { redirect } from "next/navigation";
import { RestaurantPostHub } from "@/components/RestaurantPostHub";
import { RecurringPostManager } from "@/components/RecurringPostManager";
import { TeamPanel } from "@/components/TeamPanel";
import { auth } from "@/auth";
import { requireRole } from "@/lib/authz";
import { isDemo } from "@/lib/mode";
import { prisma } from "@/lib/prisma";
import { countActiveVolunteersNear } from "@/lib/nearby";
import { RESTAURANT } from "@/lib/mock";

export const dynamic = "force-dynamic";

/**
 * The posting side of the restaurant surface: tonight's surplus, recurring
 * schedules, the default photo, and the team. Tracking what's already posted
 * lives on /restaurant/listings.
 */
export default async function RestaurantPage() {
  await requireRole("restaurant", "org_admin");
  const session = await auth();
  // Org admins oversee the chapter; they don't run a restaurant account, so the
  // posting surface is off-limits — send them to their analytics home.
  if (session?.user?.role === "org_admin") redirect("/admin/analytics");
  const me = session?.user?.id
    ? await prisma.user.findUnique({
        where: { id: session.user.id },
        include: { restaurant: true },
      })
    : null;
  const restaurant =
    me?.restaurant ?? (await prisma.restaurant.findFirst({ where: { name: RESTAURANT } }));

  const demo = await isDemo();

  // How many volunteers are active near this restaurant right now — an honest
  // "will someone show up?" signal for the post form.
  const nearbyVolunteers = restaurant
    ? await countActiveVolunteersNear(
        { lat: restaurant.lat, lng: restaurant.lng },
        { demo }
      )
    : 0;

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
        <h1 className="text-[40px] font-semibold leading-[1.1] tracking-tight text-balance">Post surplus</h1>
        <p className="mt-1 text-sm text-neutral-700">
          Share tonight&apos;s extra food — as a one-off or on a standing schedule.
        </p>
      </header>

      {restaurant ? (
        // Primary action (post + photo) leads in a wider left column; the
        // supporting cards (recurring schedules, team) stack in a narrower right
        // one, so heights balance instead of the three-up grid's ragged bottoms.
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <RestaurantPostHub
            restaurant={restaurant.name}
            restaurantId={restaurant.id}
            restaurantImageUrl={restaurant.imageUrl}
            nearbyVolunteers={nearbyVolunteers}
          />
          <div className="flex flex-col gap-6">
            <RecurringPostManager restaurantId={restaurant.id} schedules={schedules} />
            <TeamPanel
              members={members}
              invites={invites}
              description="Everyone here manages this restaurant together — listings, photos, and pickups are shared."
              demo={demo}
            />
          </div>
        </div>
      ) : (
        <p className="text-sm text-neutral-700">
          Restaurant account not found. Run <code className="font-mono">npm run db:seed</code>.
        </p>
      )}
    </main>
  );
}
