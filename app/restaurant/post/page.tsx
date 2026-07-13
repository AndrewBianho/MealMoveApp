import Link from "next/link";
import { redirect } from "next/navigation";
import { PostSurplusWizard, type PastPost } from "@/components/PostSurplusWizard";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isDemo } from "@/lib/mode";
import { countActiveVolunteersNear } from "@/lib/nearby";
import { RESTAURANT } from "@/lib/mock";

export const metadata = { title: "Post surplus · Meal Move" };
export const dynamic = "force-dynamic";

export default async function PostSurplusPage() {
  const session = await auth();
  const role = session?.user?.role;
  // Only restaurants reach the wizard; anyone else — including org admins, who
  // oversee the chapter rather than post for any one account — goes to the feed.
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
  const recent = await prisma.foodListing.findMany({
    where: { restaurantId: restaurant.id },
    orderBy: { postedAt: "desc" },
    select: { title: true, notes: true },
    take: 24,
  });
  const seen = new Set<string>();
  const pastPosts: PastPost[] = [];
  for (const r of recent) {
    const key = r.title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    pastPosts.push({ title: r.title, notes: r.notes ?? undefined });
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
