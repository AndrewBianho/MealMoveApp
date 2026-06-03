"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const HOLD_MINUTES = 15;

// The acting user comes from the authenticated session.
async function currentUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated.");
  return session.user.id;
}

function refreshViews(listingId?: string) {
  revalidatePath("/");
  revalidatePath("/pickups");
  revalidatePath("/restaurant");
  if (listingId) revalidatePath(`/listings/${listingId}`);
}

/**
 * Claim an open listing. A transaction guards against two volunteers grabbing
 * the same listing, and stamps a 15-minute hold the expiry cron enforces.
 */
export async function claimListing(listingId: string) {
  const volunteerId = await currentUserId();
  await prisma.$transaction(async (tx) => {
    const listing = await tx.foodListing.findUnique({ where: { id: listingId } });
    if (!listing || listing.status !== "open") {
      throw new Error("This listing is no longer available.");
    }
    await tx.pickup.create({
      data: {
        listingId,
        volunteerId,
        holdUntil: new Date(Date.now() + HOLD_MINUTES * 60_000),
      },
    });
    await tx.foodListing.update({
      where: { id: listingId },
      data: { status: "claimed" },
    });
    await tx.listingEvent.create({
      data: { listingId, type: "claimed", actorId: volunteerId },
    });
  });
  refreshViews(listingId);
}

const NEXT_STATUS = { claimed: "in_transit", in_transit: "delivered" } as const;

/** Advance claimed → in_transit → delivered, logging each transition. */
export async function advanceListing(listingId: string) {
  const volunteerId = await currentUserId();
  await prisma.$transaction(async (tx) => {
    const listing = await tx.foodListing.findUnique({ where: { id: listingId } });
    if (!listing) throw new Error("Listing not found.");
    const next = NEXT_STATUS[listing.status as keyof typeof NEXT_STATUS];
    if (!next) return;
    await tx.foodListing.update({
      where: { id: listingId },
      data: { status: next },
    });
    if (next === "delivered") {
      await tx.pickup.update({
        where: { listingId },
        data: { deliveredAt: new Date() },
      });
    }
    await tx.listingEvent.create({
      data: { listingId, type: next, actorId: volunteerId },
    });
  });
  refreshViews(listingId);
}

/** Restaurant posts surplus. Resolves drop-off by name, creating it if new. */
export async function postListing(input: {
  restaurantId: string;
  title: string;
  servings: number;
  minutes: number;
  dropOffName?: string;
}) {
  let dropOffId: string | undefined;
  if (input.dropOffName?.trim()) {
    const name = input.dropOffName.trim();
    const dropOff =
      (await prisma.dropOff.findFirst({ where: { name } })) ??
      (await prisma.dropOff.create({
        data: { name, address: "Campus", lat: 0, lng: 0 },
      }));
    dropOffId = dropOff.id;
  }

  const listing = await prisma.foodListing.create({
    data: {
      title: input.title.trim(),
      servings: input.servings,
      status: "open",
      restaurantId: input.restaurantId,
      dropOffId,
      expiresAt: new Date(Date.now() + input.minutes * 60_000),
      events: { create: { type: "posted" } },
    },
  });
  refreshViews(listing.id);
  return listing.id;
}
