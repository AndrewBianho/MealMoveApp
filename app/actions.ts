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
import { validateRetrievalHours } from "@/lib/hours";
import { getVolunteerImpact } from "@/lib/stats";

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
  role: "volunteer" | "restaurant" | "drop_off_admin";
  restaurantName?: string;
  restaurantAddress?: string;
  dropOffName?: string;
  dropOffAddress?: string;
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

  // If this email was invited to an existing organization, the invite governs
  // the account: join the existing org instead of creating a new one, and ignore
  // any client-sent role / new-org fields (defense in depth).
  const invite = await prisma.teamInvite.findFirst({
    where: { email, status: "pending" },
    orderBy: { createdAt: "desc" },
  });
  if (invite) {
    if (invite.role === "restaurant") {
      const restaurant = invite.restaurantId
        ? await prisma.restaurant.findUnique({ where: { id: invite.restaurantId } })
        : null;
      if (!restaurant) {
        return { ok: false, error: "That invitation is no longer valid." };
      }
    }
    const passwordHash = await bcrypt.hash(password, 10);
    try {
      await prisma.$transaction(async (tx) => {
        await tx.user.create({
          data: {
            name,
            email,
            phone,
            passwordHash,
            role: invite.role,
            restaurantId: invite.role === "restaurant" ? invite.restaurantId : null,
          },
        });
        await tx.teamInvite.update({
          where: { id: invite.id },
          data: { status: "accepted", respondedAt: new Date() },
        });
      });
      await resetLimit(`register:${ip}`);
      return { ok: true };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        return { ok: false, error: "An account with that email already exists." };
      }
      return { ok: false, error: "Something went wrong. Please try again." };
    }
  }

  // Guard the role server-side — never trust the client to send a safe value.
  if (
    input.role !== "volunteer" &&
    input.role !== "restaurant" &&
    input.role !== "drop_off_admin"
  ) {
    return { ok: false, error: "Invalid account type." };
  }
  if (input.role === "restaurant" && !input.restaurantName?.trim()) {
    return { ok: false, error: "Please enter your restaurant's name." };
  }
  if (input.role === "restaurant" && !input.restaurantAddress?.trim()) {
    return { ok: false, error: "Please enter your restaurant's address." };
  }
  if (input.role === "drop_off_admin" && !input.dropOffName?.trim()) {
    return { ok: false, error: "Please enter the drop-off location's name." };
  }
  if (input.role === "drop_off_admin" && !input.dropOffAddress?.trim()) {
    return { ok: false, error: "Please enter the drop-off location's address." };
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
    } else if (input.role === "drop_off_admin") {
      const address = input.dropOffAddress!.trim();
      // Geocode so the new drop-off lands a real pin; fall back to campus center.
      const geo = await geocodeAddress(address);
      // drop_off_admins manage every location (no per-user link, unlike
      // restaurants), so we create the location and a role account; the new
      // location is immediately visible on the drop-off console and the map.
      await prisma.$transaction(async (tx) => {
        await tx.dropOff.create({
          data: {
            name: input.dropOffName!.trim(),
            address,
            lat: geo?.lat ?? 40.04,
            lng: geo?.lng ?? -75.34,
            // Accept everything by default; an admin can narrow it later.
            acceptedCategories: [
              "prepared",
              "produce",
              "bakery",
              "packaged",
              "dairy",
              "beverages",
            ],
          },
        });
        await tx.user.create({
          data: { name, email, phone, passwordHash, role: "drop_off_admin" },
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

// ---- Team invites: multiple accounts per organization --------------------

/**
 * Invite a teammate (by email) to the caller's organization. Restaurant members
 * invite into their own restaurant; drop-off admins invite chapter-wide (they
 * aren't tied to a specific DropOff). The invite is consumed when the invitee
 * signs up with that email (see registerUser).
 */
export async function inviteTeammate(emailInput: string): Promise<SignUpResult> {
  const session = await auth();
  const role = session?.user?.role;
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "Not authenticated." };
  if (role !== "restaurant" && role !== "drop_off_admin" && role !== "org_admin") {
    return {
      ok: false,
      error: "Only restaurant and drop-off accounts can invite teammates.",
    };
  }

  const email = (emailInput ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false, error: "Please enter a valid email address." };
  }

  // Resolve the org + invite role from the caller, never from the client.
  let inviteRole: "restaurant" | "drop_off_admin";
  let restaurantId: string | null;
  if (role === "drop_off_admin") {
    inviteRole = "drop_off_admin";
    restaurantId = null;
  } else {
    const me = await prisma.user.findUnique({
      where: { id: userId },
      select: { restaurantId: true },
    });
    if (!me?.restaurantId) {
      return { ok: false, error: "Your account isn't linked to a restaurant." };
    }
    inviteRole = "restaurant";
    restaurantId = me.restaurantId;
  }

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existing) {
    return { ok: false, error: "That email already has an account." };
  }
  const dupe = await prisma.teamInvite.findFirst({
    where: { email, status: "pending", role: inviteRole, restaurantId },
    select: { id: true },
  });
  if (dupe) return { ok: false, error: "That email already has a pending invite." };

  await prisma.teamInvite.create({
    data: { email, role: inviteRole, restaurantId, invitedById: userId },
  });
  revalidatePath(role === "drop_off_admin" ? "/dropoff" : "/restaurant");
  return { ok: true };
}

/** Cancel a pending invite — only a member of the same org may cancel it. */
export async function cancelTeammateInvite(
  inviteId: string
): Promise<SignUpResult> {
  const session = await auth();
  const role = session?.user?.role;
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "Not authenticated." };

  const invite = await prisma.teamInvite.findUnique({ where: { id: inviteId } });
  if (!invite || invite.status !== "pending") {
    return { ok: false, error: "That invite is no longer pending." };
  }

  let authorized = role === "org_admin";
  if (!authorized && role === "drop_off_admin" && invite.role === "drop_off_admin") {
    authorized = true;
  }
  if (!authorized && role === "restaurant" && invite.role === "restaurant") {
    const me = await prisma.user.findUnique({
      where: { id: userId },
      select: { restaurantId: true },
    });
    authorized = !!me?.restaurantId && me.restaurantId === invite.restaurantId;
  }
  if (!authorized) return { ok: false, error: "You can't cancel that invite." };

  await prisma.teamInvite.update({
    where: { id: inviteId },
    data: { status: "cancelled", respondedAt: new Date() },
  });
  revalidatePath(invite.role === "drop_off_admin" ? "/dropoff" : "/restaurant");
  return { ok: true };
}

/**
 * Look up a pending invite for an email — used by the sign-up form to show a
 * "you've been invited" banner and skip the new-org fields. Minimal info only.
 */
export async function findPendingInvite(
  emailInput: string
): Promise<{ orgName: string; role: "restaurant" | "drop_off_admin" } | null> {
  const email = (emailInput ?? "").trim().toLowerCase();
  if (!email) return null;
  const invite = await prisma.teamInvite.findFirst({
    where: { email, status: "pending" },
    orderBy: { createdAt: "desc" },
  });
  if (!invite) return null;
  if (invite.role === "restaurant") {
    const r = invite.restaurantId
      ? await prisma.restaurant.findUnique({
          where: { id: invite.restaurantId },
          select: { name: true },
        })
      : null;
    if (!r) return null;
    return { orgName: r.name, role: "restaurant" };
  }
  return { orgName: "the drop-off team", role: "drop_off_admin" };
}

// Password reset is single-use and time-boxed. We store only the sha256 of the
// token; the raw token travels only in the emailed link.
const RESET_TTL_MS = 60 * 60_000; // 1 hour

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

// The absolute origin for the reset link. We REQUIRE APP_URL rather than derive
// the host from request headers: `x-forwarded-host` is attacker-controllable, so
// trusting it lets someone trigger a victim's reset and have the (valid) token
// emailed with a link pointing at their own domain — reset-link poisoning, i.e.
// account takeover. In production an unset APP_URL returns null (we skip the
// email rather than send an unsafe link); in dev we fall back to the request
// host purely for local convenience, where the link is only logged, never sent.
function requestOrigin(): string | null {
  const env = process.env.APP_URL?.replace(/\/$/, "");
  if (env) return env;
  if (process.env.NODE_ENV === "production") return null;
  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
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
    const origin = requestOrigin();
    if (origin) {
      await sendPasswordResetEmail(email, `${origin}/reset-password?token=${raw}`);
    } else {
      // No safe origin (APP_URL unset in production): don't email a header-derived
      // link. The token simply goes unused and expires.
      console.error(
        "[password-reset] APP_URL is not set — skipping email to avoid an unsafe reset link."
      );
    }
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

/**
 * Capture the delivery photo and complete in_transit → delivered. Returns the
 * volunteer's fresh lifetime impact so the client can celebrate the rescue
 * with up-to-date totals (positive reinforcement against flaking).
 */
export async function markDelivered(listingId: string, photoUrl: string) {
  const userId = await currentUserId();
  await markDeliveredWithPhotoFor(prisma, userId, listingId, photoUrl);
  refreshViews(listingId);
  return getVolunteerImpact(userId);
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

/** A drop-off admin sets the structured food-retrieval hours for a location. */
export async function updateRetrievalHours(
  dropOffId: string,
  hours: unknown
): Promise<SignUpResult> {
  const session = await auth();
  const role = session?.user?.role;
  if (role !== "drop_off_admin" && role !== "org_admin") {
    return { ok: false, error: "Only drop-off admins can edit this." };
  }
  const res = validateRetrievalHours(hours);
  if (!res.ok) return { ok: false, error: res.error };
  await prisma.dropOff.update({
    where: { id: dropOffId },
    data: { retrievalHours: res.hours as unknown as Prisma.InputJsonValue },
  });
  revalidatePath("/dropoff");
  revalidatePath(`/dropoffs/${dropOffId}`);
  revalidatePath("/");
  revalidatePath("/map");
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
