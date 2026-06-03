"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const HOLD_MINUTES = 15;

type SignUpResult = { ok: true } | { ok: false; error: string };

/**
 * Self-serve registration. Only volunteer and restaurant accounts can be
 * created here — drop_off_admin / org_admin are provisioned by an org admin.
 */
export async function registerUser(input: {
  name: string;
  email: string;
  password: string;
  role: "volunteer" | "restaurant";
  restaurantName?: string;
  restaurantAddress?: string;
}): Promise<SignUpResult> {
  const name = input.name?.trim();
  const email = input.email?.trim().toLowerCase();
  const password = input.password ?? "";

  if (!name) return { ok: false, error: "Please enter your name." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false, error: "Please enter a valid email address." };
  }
  if (password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }
  // Guard the role server-side — never trust the client to send a safe value.
  if (input.role !== "volunteer" && input.role !== "restaurant") {
    return { ok: false, error: "Invalid account type." };
  }
  if (input.role === "restaurant" && !input.restaurantName?.trim()) {
    return { ok: false, error: "Please enter your restaurant's name." };
  }

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    if (input.role === "restaurant") {
      await prisma.$transaction(async (tx) => {
        const restaurant = await tx.restaurant.create({
          data: {
            name: input.restaurantName!.trim(),
            address: input.restaurantAddress?.trim() || "Campus",
            lat: 0,
            lng: 0,
          },
        });
        await tx.user.create({
          data: { name, email, passwordHash, role: "restaurant", restaurantId: restaurant.id },
        });
      });
    } else {
      await prisma.user.create({
        data: { name, email, passwordHash, role: "volunteer" },
      });
    }
    return { ok: true };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, error: "An account with that email already exists." };
    }
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

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
