import { prisma } from "@/lib/prisma";

/**
 * Is the viewer still carrying a rescue? `deliveredAt: null` covers claimed, in
 * transit, and taken home in one predicate, without restating the feed's
 * derived status list.
 *
 * The tour's entry points are gated on this. Chapter 3 needs a pickup it can
 * actually claim, and a volunteer already holding food is shown "One rescue at
 * a time" where the claim button would be — so the tour would spotlight a
 * control that does not exist and then walk on through steps about a claim that
 * never happened. Not offering the tour is simpler and more honest than trying
 * to repair the world underneath it.
 *
 * Deliberately NOT used for TourProvider's `enabled`: the tour's own claim step
 * puts the viewer into this exact state on purpose, and gating the provider on
 * it would make the overlay vanish halfway through chapter 3.
 */
export async function hasRescueInFlight(userId: string): Promise<boolean> {
  const inFlight = await prisma.pickup.count({
    where: {
      deliveredAt: null,
      OR: [{ volunteerId: userId }, { buddyId: userId }],
    },
  });
  return inFlight > 0;
}
