import { prisma } from "./prisma";

// The volunteer's first-rescue activation state, read live from their pickups.
// Three real backend milestones drive it — claim → pick up → drop off — so the
// feed's first-run tracker reflects what actually happened, not a tutorial flag.
// It self-retires the moment a volunteer completes their first rescue.

// Number of milestones completed: 0 (nothing yet) · 1 (claimed) · 2 (in transit)
// · 3 (delivered — flow complete, tracker hidden).
export type OnboardingStep = 0 | 1 | 2 | 3;

export interface VolunteerOnboarding {
  /** Show the first-rescue tracker? False once they've ever completed a rescue. */
  show: boolean;
  step: OnboardingStep;
  /** Their current in-flight pickup, so the tracker can deep-link to it. */
  active: { listingId: string; source: string } | null;
}

const DONE: VolunteerOnboarding = { show: false, step: 3, active: null };

export async function getVolunteerOnboarding(
  userId: string
): Promise<VolunteerOnboarding> {
  // Has this person ever closed the loop? Credit both seats — a buddy who helped
  // deliver has rescued food too, matching how impact/celebration credit them.
  const completed = await prisma.pickup.count({
    where: {
      deliveredAt: { not: null },
      OR: [{ volunteerId: userId }, { buddyId: userId }],
    },
  });
  if (completed > 0) return DONE;

  // Their current claim, if any. taken_home counts as "has the food" (step 2):
  // a deferred drop-off is still an in-flight rescue, not a fresh claim.
  const active = await prisma.pickup.findFirst({
    where: {
      deliveredAt: null,
      OR: [{ volunteerId: userId }, { buddyId: userId }],
      listing: { status: { in: ["claimed", "in_transit", "taken_home"] } },
    },
    orderBy: { claimedAt: "desc" },
    select: {
      listing: {
        select: { id: true, status: true, restaurant: { select: { name: true } } },
      },
    },
  });

  if (!active) return { show: true, step: 0, active: null };

  const step: OnboardingStep = active.listing.status === "claimed" ? 1 : 2;
  return {
    show: true,
    step,
    active: { listingId: active.listing.id, source: active.listing.restaurant.name },
  };
}
