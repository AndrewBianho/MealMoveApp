import Link from "next/link";
import { redirect } from "next/navigation";
import { PostSurplusWizard, type PastPost } from "@/components/PostSurplusWizard";
import { auth } from "@/auth";
import { isAdmin } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { isDemo } from "@/lib/mode";
import { countActiveVolunteersNear } from "@/lib/nearby";
import { APP_TIMEZONE } from "@/lib/hours";
import { RESTAURANT } from "@/lib/mock";

export const metadata = { title: "Post surplus · Meal Move" };
export const dynamic = "force-dynamic";

export default async function PostSurplusPage() {
  const session = await auth();
  const role = session?.user?.role;
  // Only restaurants reach the wizard. Admins (org + master) oversee rather than
  // post, so they go to their analytics home; any other non-restaurant lands on
  // the feed.
  if (isAdmin(role)) redirect("/admin/analytics");
  if (role !== "restaurant") redirect("/");

  const me = session?.user?.id
    ? await prisma.user.findUnique({
        where: { id: session.user.id },
        include: { restaurant: true },
      })
    : null;
  const restaurant =
    me?.restaurant ?? (await prisma.restaurant.findFirst({ where: { name: RESTAURANT } }));

  if (!restaurant) {
    return (
      <main className="mx-auto max-w-[480px] px-5 py-16 text-center">
        <p className="text-sm text-neutral-700">
          No restaurant is linked to this account yet.
        </p>
        <Link href="/restaurant" className="mt-3 inline-block font-semibold text-rescued-600 hover:underline">
          Back to console
        </Link>
      </main>
    );
  }

  const demo = await isDemo();
  const nearbyVolunteers = await countActiveVolunteersNear(
    { lat: restaurant.lat, lng: restaurant.lng },
    { demo }
  );

  // "Post again" — the source's recent listings, newest first, deduped by title
  // so the same dish isn't offered five times. Capped to a short list.
  // Each carries its whole answer set, not just the title: re-listing the same
  // dish shouldn't mean re-entering the weight, window, allergens, handling and
  // photo that haven't changed. The newest post of a given title wins, so the
  // values reflect how it was last listed.
  const recent = await prisma.foodListing.findMany({
    where: { restaurantId: restaurant.id },
    orderBy: { postedAt: "desc" },
    select: {
      title: true,
      notes: true,
      weightLbs: true,
      carsNeeded: true,
      allergens: true,
      tempHandling: true,
      imageUrl: true,
      postedAt: true,
      expiresAt: true,
    },
    take: 24,
  });

  // Formatted here rather than in the client wizard: a date rendered in the
  // browser's own zone would disagree with every other stamp in the app.
  const postedLabel = (d: Date) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: APP_TIMEZONE,
      month: "short",
      day: "numeric",
    }).format(d);

  const seen = new Set<string>();
  const pastPosts: PastPost[] = [];
  for (const r of recent) {
    const key = r.title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    pastPosts.push({
      title: r.title,
      notes: r.notes ?? undefined,
      weightLbs: r.weightLbs ?? undefined,
      carsNeeded: r.carsNeeded ?? undefined,
      // The claim window the restaurant originally chose, recovered from the
      // two timestamps — the duration itself isn't stored.
      windowMinutes: Math.max(
        1,
        Math.round((r.expiresAt.getTime() - r.postedAt.getTime()) / 60_000)
      ),
      allergens: r.allergens.length > 0 ? r.allergens : undefined,
      tempHandling: r.tempHandling ?? undefined,
      imageUrl: r.imageUrl ?? undefined,
      postedLabel: postedLabel(r.postedAt),
    });
    if (pastPosts.length >= 4) break;
  }

  return (
    <main>
      <PostSurplusWizard
        restaurant={restaurant.name}
        restaurantId={restaurant.id}
        nearbyVolunteers={nearbyVolunteers}
        pastPosts={pastPosts}
      />
    </main>
  );
}
