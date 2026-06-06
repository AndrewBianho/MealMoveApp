"use server";

import { createHash, randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit, resetLimit, clientIp, LIMITS } from "@/lib/rate-limit";
import { passwordValid } from "@/lib/password";
import { sendPasswordResetEmail } from "@/lib/email";
import { geocodeAddress } from "@/lib/geocode";
import { confirmCheckInFor, releaseClaimFor } from "@/lib/checkins";
import {
  startDeliveryWithPhotoFor,
  markDeliveredWithPhotoFor,
} from "@/lib/photos";
import {
  invitableVolunteers,
  inviteBuddyFor,
  respondToInviteFor,
  cancelInviteFor,
} from "@/lib/buddies";

const HOLD_MINUTES = 15;

type SignUpResult = { ok: true } | { ok: false; error: string };

/**
 * Self-serve registration. Only volunteer and restaurant accounts can be
 * created here — drop_off_admin / org_admin are provisioned by an org admin.
 */
export async function registerUser(input: {
  name: string;
  email: string;
  phone: string;
  password: string;
  role: "volunteer" | "restaurant";
  restaurantName?: string;
  restaurantAddress?: string;
}): Promise<SignUpResult> {
  // Throttle sign-ups per IP — registration runs bcrypt, so it's a cheap DoS
  // and spam vector if left open. Fails open if the limiter is unavailable.
  const ip = clientIp(headers());
  const gate = await rateLimit(`register:${ip}`, LIMITS.register);
  if (!gate.ok) {
    return { ok: false, error: "Too many sign-up attempts. Please try again later." };
  }

  const name = input.name?.trim();
  const email = input.email?.trim().toLowerCase();
  const phone = (input.phone ?? "").replace(/\D/g, ""); // keep digits only
  const password = input.password ?? "";

  if (!name) return { ok: false, error: "Please enter your name." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false, error: "Please enter a valid email address." };
  }
  if (phone.length !== 10) {
    return { ok: false, error: "Please enter a valid 10-digit phone number." };
  }
  if (!passwordValid(password)) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }
  // Guard the role server-side — never trust the client to send a safe value.
  if (input.role !== "volunteer" && input.role !== "restaurant") {
    return { ok: false, error: "Invalid account type." };
  }
  if (input.role === "restaurant" && !input.restaurantName?.trim()) {
    return { ok: false, error: "Please enter your restaurant's name." };
  }
  if (input.role === "restaurant" && !input.restaurantAddress?.trim()) {
    return { ok: false, error: "Please enter your restaurant's address." };
  }

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    if (input.role === "restaurant") {
      const address = input.restaurantAddress!.trim();
      // Locate the address so the restaurant lands a real pin on the map;
      // fall back to campus center if geocoding can't place it.
      const geo = await geocodeAddress(address);
      await prisma.$transaction(async (tx) => {
        const restaurant = await tx.restaurant.create({
          data: {
            name: input.restaurantName!.trim(),
            address,
            lat: geo?.lat ?? 40.04,
            lng: geo?.lng ?? -75.34,
          },
        });
        await tx.user.create({
          data: { name, email, phone, passwordHash, role: "restaurant", restaurantId: restaurant.id },
        });
      });
    } else {
      await prisma.user.create({
        data: { name, email, phone, passwordHash, role: "volunteer" },
      });
    }
    await resetLimit(`register:${ip}`);
    return { ok: true };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, error: "An account with that email already exists." };
    }
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

// Password reset is single-use and time-boxed. We store only the sha256 of the
// token; the raw token travels only in the emailed link.
const RESET_TTL_MS = 60 * 60_000; // 1 hour

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

// Build the app's origin from the incoming request, falling back to APP_URL.
// Used to construct the absolute reset link in the email.
function requestOrigin(): string {
  const h = headers();
  const env = process.env.APP_URL?.replace(/\/$/, "");
  if (env) return env;
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : "http://localhost:3000";
}

/**
 * Start a password reset. Always returns ok — we never reveal whether an email
 * is registered (no account enumeration). When the account exists we issue a
 * fresh single-use token (invalidating any prior ones) and email the link.
 */
export async function requestPasswordReset(
  emailInput: string
): Promise<{ ok: true }> {
  const ip = clientIp(headers());
  const gate = await rateLimit(`reset-req:${ip}`, LIMITS.passwordReset);
  if (!gate.ok) return { ok: true }; // stay silent even when throttled

  const email = (emailInput ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: true };

  const user = await prisma.user.findUnique({ where: { email } });
  if (user) {
    const raw = randomBytes(32).toString("hex");
    await prisma.$transaction([
      // One live token per user — drop any earlier ones.
      prisma.passwordResetToken.deleteMany({ where: { userId: user.id } }),
      prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(raw),
          expiresAt: new Date(Date.now() + RESET_TTL_MS),
        },
      }),
    ]);
    const link = `${requestOrigin()}/reset-password?token=${raw}`;
    await sendPasswordResetEmail(email, link);
  }
  return { ok: true };
}

/**
 * Complete a password reset: verify the token is real, unused and unexpired,
 * then set the new password and burn the token in one transaction.
 */
export async function resetPassword(
  token: string,
  newPassword: string
): Promise<SignUpResult> {
  const ip = clientIp(headers());
  const gate = await rateLimit(`reset-do:${ip}`, LIMITS.passwordReset);
  if (!gate.ok) {
    return { ok: false, error: "Too many attempts. Please try again later." };
  }

  if (!token) return { ok: false, error: "This reset link is invalid." };
  if (!passwordValid(newPassword)) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }

  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
  });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return { ok: false, error: "This reset link is invalid or has expired." };
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash },
    }),
    prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
  ]);
  return { ok: true };
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
  revalidatePath("/dropoff");
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

/** Record a "still on it" check-up confirmation for the caller's claim. */
export async function confirmCheckIn(listingId: string) {
  const userId = await currentUserId();
  await confirmCheckInFor(prisma, userId, listingId);
  refreshViews(listingId);
}

/** Voluntarily release the caller's claim, reopening the listing. */
export async function releaseClaim(listingId: string) {
  const userId = await currentUserId();
  await releaseClaimFor(prisma, userId, listingId);
  refreshViews(listingId);
}

/**
 * Capture the pickup photo and advance claimed → in_transit. The photo is
 * required — it's the proof a pickup actually happened (anti-flaking).
 */
export async function startDelivery(listingId: string, photoUrl: string) {
  const userId = await currentUserId();
  await startDeliveryWithPhotoFor(prisma, userId, listingId, photoUrl);
  refreshViews(listingId);
}

/** Capture the delivery photo and complete in_transit → delivered. */
export async function markDelivered(listingId: string, photoUrl: string) {
  const userId = await currentUserId();
  await markDeliveredWithPhotoFor(prisma, userId, listingId, photoUrl);
  refreshViews(listingId);
}

/** Volunteers the caller can invite to buddy this pickup. */
export async function getInvitableVolunteers(listingId: string) {
  const inviterId = await currentUserId();
  return invitableVolunteers(prisma, listingId, inviterId);
}

/** Invite a specific volunteer to do this pickup together. */
export async function inviteBuddy(listingId: string, inviteeId: string) {
  const inviterId = await currentUserId();
  await inviteBuddyFor(prisma, inviterId, listingId, inviteeId);
  refreshViews(listingId);
}

/** Accept or decline a buddy invite. `listingId` drives view revalidation. */
export async function respondToBuddyInvite(
  inviteId: string,
  accept: boolean,
  listingId: string
) {
  const inviteeId = await currentUserId();
  await respondToInviteFor(prisma, inviteeId, inviteId, accept);
  refreshViews(listingId);
}

/** The primary pulls back an outstanding buddy invite. */
export async function cancelBuddyInvite(listingId: string) {
  const inviterId = await currentUserId();
  await cancelInviteFor(prisma, inviterId, listingId);
  refreshViews(listingId);
}

// Bounds for a posted listing. Kept explicit so the server never trusts the
// client's numbers — a tampered or malformed payload is rejected, not stored.
const TITLE_MAX = 120;
const NOTES_MAX = 500;
const IMAGE_URL_MAX = 2048;
const SERVINGS_MAX = 10_000;
const MINUTES_MAX = 24 * 60; // 24 hours
const WEIGHT_MAX = 100_000; // lbs

// A finite number within [min, max]; rejects NaN/Infinity/strings-as-numbers.
function boundedInt(value: unknown, min: number, max: number): number | null {
  const n = typeof value === "number" ? value : NaN;
  if (!Number.isFinite(n)) return null;
  const i = Math.floor(n);
  return i >= min && i <= max ? i : null;
}

// Restaurant posts surplus. Restaurants don't choose a drop-off — that's
// decided downstream (the system recommends; the volunteer delivers). The
// acting restaurant is resolved from the session, never trusted from the
// client: a restaurant member posts for their own restaurant; only an
// org_admin may post on behalf of an arbitrary restaurantId.
export async function postListing(input: {
  restaurantId: string;
  title: string;
  servings: number;
  minutes: number;
  weightLbs?: number;
  notes?: string;
  imageUrl?: string;
}) {
  const session = await auth();
  const role = session?.user?.role;
  if (!session?.user?.id) throw new Error("Not authenticated.");

  let restaurantId: string;
  if (role === "org_admin") {
    if (!input.restaurantId?.trim()) throw new Error("Pick a restaurant.");
    restaurantId = input.restaurantId.trim();
  } else if (role === "restaurant") {
    const me = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { restaurantId: true },
    });
    if (!me?.restaurantId) throw new Error("Your account has no restaurant.");
    restaurantId = me.restaurantId; // ignore any client-supplied id
  } else {
    throw new Error("Only restaurants can post listings.");
  }

  const title = input.title?.trim();
  if (!title) throw new Error("Please enter what you're sharing.");
  if (title.length > TITLE_MAX) throw new Error("Title is too long.");

  const servings = boundedInt(input.servings, 1, SERVINGS_MAX);
  if (servings === null) throw new Error("Enter a valid number of servings.");

  const minutes = boundedInt(input.minutes, 1, MINUTES_MAX);
  if (minutes === null) throw new Error("Enter a valid pickup window.");

  let weightLbs: number | null = null;
  if (input.weightLbs != null) {
    const w = boundedInt(input.weightLbs, 1, WEIGHT_MAX);
    if (w === null) throw new Error("Enter a valid weight.");
    weightLbs = w;
  }

  const notes = input.notes?.trim().slice(0, NOTES_MAX) || null;
  const imageUrl = input.imageUrl?.trim().slice(0, IMAGE_URL_MAX) || null;

  const listing = await prisma.foodListing.create({
    data: {
      title,
      servings,
      weightLbs,
      notes,
      imageUrl,
      status: "open",
      restaurantId,
      expiresAt: new Date(Date.now() + minutes * 60_000),
      events: { create: { type: "posted" } },
    },
  });
  refreshViews(listing.id);
  return listing.id;
}

/**
 * Set (or clear) a restaurant's default image — shown on a listing card when
 * the listing has no food photo of its own. Restaurant members and org admins
 * only, and a restaurant member can only edit their own restaurant.
 */
export async function setRestaurantImage(
  restaurantId: string,
  imageUrl: string | null
): Promise<SignUpResult> {
  const session = await auth();
  const role = session?.user?.role;
  if (role !== "restaurant" && role !== "org_admin") {
    return { ok: false, error: "Only restaurants can set this." };
  }
  if (role === "restaurant") {
    const me = await prisma.user.findUnique({
      where: { id: session!.user!.id },
      select: { restaurantId: true },
    });
    if (me?.restaurantId !== restaurantId) {
      return { ok: false, error: "That isn't your restaurant." };
    }
  }
  await prisma.restaurant.update({
    where: { id: restaurantId },
    data: { imageUrl: imageUrl?.trim() || null },
  });
  refreshViews();
  return { ok: true };
}

/** A drop-off admin sets the special requests / restraints for a location. */
export async function updateDropOffNotes(
  dropOffId: string,
  notes: string
): Promise<SignUpResult> {
  const session = await auth();
  const role = session?.user?.role;
  if (role !== "drop_off_admin" && role !== "org_admin") {
    return { ok: false, error: "Only drop-off admins can edit this." };
  }
  await prisma.dropOff.update({
    where: { id: dropOffId },
    data: { notes: notes.trim() || null },
  });
  revalidatePath("/dropoff");
  revalidatePath(`/dropoffs/${dropOffId}`);
  return { ok: true };
}

// Roles an org_admin can assign via the panel. "restaurant" is excluded — it's
// tied to a Restaurant entity and only set at sign-up.
type ManagedRole = "volunteer" | "drop_off_admin" | "org_admin";

/** Change a user's role. Org-admin only; never leaves zero org admins. */
export async function setRole(
  userId: string,
  role: ManagedRole
): Promise<SignUpResult> {
  const session = await auth();
  if (session?.user?.role !== "org_admin") {
    return { ok: false, error: "Only org admins can change roles." };
  }
  if (!["volunteer", "drop_off_admin", "org_admin"].includes(role)) {
    return { ok: false, error: "Invalid role." };
  }

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return { ok: false, error: "User not found." };
  if (target.role === "restaurant") {
    return { ok: false, error: "Restaurant accounts are managed at sign-up." };
  }
  if (target.role === role) return { ok: true };

  // Last-admin guard — don't let the org lock itself out.
  if (target.role === "org_admin" && role !== "org_admin") {
    const admins = await prisma.user.count({ where: { role: "org_admin" } });
    if (admins <= 1) {
      return { ok: false, error: "Can't remove the last org admin." };
    }
  }

  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { role } }),
    prisma.adminEvent.create({
      data: {
        type: "role_changed",
        actorId: session.user.id,
        targetId: userId,
        meta: { from: target.role, to: role },
      },
    }),
  ]);
  revalidatePath("/admin/users");
  return { ok: true };
}
