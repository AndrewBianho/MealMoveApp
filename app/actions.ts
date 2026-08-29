"use server";

import { createHash, randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import bcrypt from "bcryptjs";
import { Prisma, type FoodCategory } from "@prisma/client";
import { auth } from "@/auth";
import { trackServer, identifyServer } from "@/lib/analytics";
import { prisma } from "@/lib/prisma";
import { rateLimit, resetLimit, clientIp, LIMITS } from "@/lib/rate-limit";
import { passwordValid } from "@/lib/password";
import { sendPasswordResetEmail } from "@/lib/email";
import { geocodeAddress } from "@/lib/geocode";
import { cleanOrgNotes, type OrgNotesInput } from "@/lib/orgNotes";
import { orgForEmail } from "@/lib/org";
import { releaseClaimFor } from "@/lib/checkins";
import { claimsNeeded } from "@/lib/claims";
import { findActiveClaimFor } from "@/lib/activeClaim";
import { sendRestaurantRescueNotice } from "@/lib/notify";
import {
  startDeliveryWithPhotoFor,
  markDeliveredWithPhotoFor,
  takeHomeForTomorrowFor,
  recordRescueAccuracyFor,
} from "@/lib/photos";
import {
  invitableVolunteers,
  inviteBuddyFor,
  respondToInviteFor,
  cancelInviteFor,
} from "@/lib/buddies";
import { validateRetrievalHours } from "@/lib/hours";
import { getVolunteerImpact } from "@/lib/stats";
import { isDemo, getDataMode } from "@/lib/mode";
import { sendAnnouncement, markSeen } from "@/lib/announcements";
import { cleanAudience, countAudience, resolveAudience } from "@/lib/segments";
import { resetDemoWorld } from "@/prisma/seedDemo";
import { materializeSchedules } from "@/lib/sweep";
import { normalizeDaysOfWeek } from "@/lib/recurring";
import { canClaimPickups, isAdmin, isSuperAdmin } from "@/lib/roles";
import { roleChangeError, deleteAccountError } from "@/lib/accountAdmin";
import {
  mintToken,
  resolveInviteOrg,
  loadPendingInvite,
  emailTaken,
} from "@/lib/orgAdminInvite";

const HOLD_MINUTES = 15;

type SignUpResult =
  | { ok: true; pending?: boolean }
  | { ok: false; error: string };

// Seeded demo accounts (and anyone in demo mode) are showcase-only. They can
// explore every flow against the curated, resettable demo world — but they must
// never mutate the live chapter's real account/org graph. Approvals, role
// changes, and team invites are never demo-scoped (they act on real users and
// invites the admin pages surface alongside the demo world), so we block those
// writes outright while in demo mode rather than let a demo session touch real
// people's accounts.
const DEMO_BLOCKED =
  "This is a demo account — it can explore the app, but can't change live chapter data.";

async function blockIfDemo(): Promise<{ ok: false; error: string } | null> {
  return (await isDemo()) ? { ok: false, error: DEMO_BLOCKED } : null;
}

/**
 * Self-serve registration. Volunteer, restaurant, and drop-off accounts can be
 * created here (partners land pending until an org admin approves); org_admin is
 * provisioned by an existing org admin.
 */
export async function registerUser(input: {
  name: string;
  email: string;
  phone: string;
  password: string;
  role: "volunteer" | "restaurant" | "drop_off";
  restaurantName?: string;
  restaurantAddress?: string;
  dropOffName?: string;
  dropOffAddress?: string;
}): Promise<SignUpResult> {
  // Throttle sign-ups per IP — registration runs bcrypt, so it's a cheap DoS
  // and spam vector if left open. Fails open if the limiter is unavailable.
  const ip = clientIp(await headers());
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
    return { ok: false, error: "Password must be 8+ characters with an uppercase letter and a number." };
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
    if (invite.role === "drop_off") {
      const dropOff = invite.dropOffId
        ? await prisma.dropOff.findUnique({ where: { id: invite.dropOffId } })
        : null;
      if (!dropOff) {
        return { ok: false, error: "That invitation is no longer valid." };
      }
    }
    const passwordHash = await bcrypt.hash(password, 10);
    try {
      let newUserId = "";
      await prisma.$transaction(async (tx) => {
        const newUser = await tx.user.create({
          data: {
            name,
            email,
            phone,
            passwordHash,
            role: invite.role,
            restaurantId: invite.role === "restaurant" ? invite.restaurantId : null,
            dropOffId: invite.role === "drop_off" ? invite.dropOffId : null,
          },
        });
        newUserId = newUser.id;
        await tx.teamInvite.update({
          where: { id: invite.id },
          data: { status: "accepted", respondedAt: new Date() },
        });
      });
      await resetLimit(`register:${ip}`);
      trackServer({ name: "signup_submitted", props: { role: invite.role, hadInvite: true } }, newUserId);
      identifyServer(newUserId, invite.role);
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
    input.role !== "drop_off"
  ) {
    return { ok: false, error: "Invalid account type." };
  }
  if (input.role === "restaurant" && !input.restaurantName?.trim()) {
    return { ok: false, error: "Please enter your restaurant's name." };
  }
  if (input.role === "restaurant" && !input.restaurantAddress?.trim()) {
    return { ok: false, error: "Please enter your restaurant's address." };
  }
  if (input.role === "drop_off" && !input.dropOffName?.trim()) {
    return { ok: false, error: "Please enter the drop-off location's name." };
  }
  if (input.role === "drop_off" && !input.dropOffAddress?.trim()) {
    return { ok: false, error: "Please enter the drop-off location's address." };
  }

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    if (input.role === "restaurant" || input.role === "drop_off") {
      // Self-serve partner sign-ups need an org admin's confirmation before the
      // account is usable. We create the account as `pending` (it can't sign in
      // — see auth.ts) and stash the org/location details in `pendingOrg`. The
      // real Restaurant/DropOff row isn't created until approval, so an
      // unapproved partner has nothing operational on the map or feed.
      const pendingOrg =
        input.role === "restaurant"
          ? {
              kind: "restaurant" as const,
              name: input.restaurantName!.trim(),
              address: input.restaurantAddress!.trim(),
            }
          : {
              kind: "drop_off" as const,
              name: input.dropOffName!.trim(),
              address: input.dropOffAddress!.trim(),
            };
      const newUser = await prisma.user.create({
        data: {
          name,
          email,
          phone,
          passwordHash,
          role: input.role,
          status: "pending",
          pendingOrg,
        },
      });
      await resetLimit(`register:${ip}`);
      trackServer({ name: "signup_submitted", props: { role: input.role, hadInvite: false } }, newUser.id);
      identifyServer(newUser.id, input.role);
      return { ok: true, pending: true };
    }

    // Volunteers are active immediately — low-stakes, and the whole point is a
    // first-timer claiming a pickup without friction. Auto-join their org by
    // email domain (Malvern for @malvernprep.org, else the default org).
    const org = await orgForEmail(email);
    const newUser = await prisma.user.create({
      data: { name, email, phone, passwordHash, role: "volunteer", organizationId: org.id },
    });
    await resetLimit(`register:${ip}`);
    trackServer({ name: "signup_submitted", props: { role: "volunteer", hadInvite: false } }, newUser.id);
    identifyServer(newUser.id, "volunteer");
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
 * invite into their own restaurant; drop-off members invite into their own
 * drop-off location. The invite is consumed when the invitee signs up with that
 * email (see registerUser).
 */
export async function inviteTeammate(emailInput: string): Promise<SignUpResult> {
  const session = await auth();
  const role = session?.user?.role;
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "Not authenticated." };
  const demoInvite = await blockIfDemo();
  if (demoInvite) return demoInvite;
  if (role !== "restaurant" && role !== "drop_off") {
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
  let inviteRole: "restaurant" | "drop_off";
  let restaurantId: string | null = null;
  let dropOffId: string | null = null;
  if (role === "drop_off") {
    const me = await prisma.user.findUnique({
      where: { id: userId },
      select: { dropOffId: true },
    });
    if (!me?.dropOffId) {
      return { ok: false, error: "Your account isn't linked to a drop-off." };
    }
    inviteRole = "drop_off";
    dropOffId = me.dropOffId;
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
    where: { email, status: "pending", role: inviteRole, restaurantId, dropOffId },
    select: { id: true },
  });
  if (dupe) return { ok: false, error: "That email already has a pending invite." };

  await prisma.teamInvite.create({
    data: { email, role: inviteRole, restaurantId, dropOffId, invitedById: userId },
  });
  revalidatePath(role === "drop_off" ? "/dropoff" : "/restaurant");
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
  const demoCancel = await blockIfDemo();
  if (demoCancel) return demoCancel;

  const invite = await prisma.teamInvite.findUnique({ where: { id: inviteId } });
  if (!invite || invite.status !== "pending") {
    return { ok: false, error: "That invite is no longer pending." };
  }

  let authorized = role === "org_admin";
  if (!authorized && role === "drop_off" && invite.role === "drop_off") {
    const me = await prisma.user.findUnique({
      where: { id: userId },
      select: { dropOffId: true },
    });
    authorized = !!me?.dropOffId && me.dropOffId === invite.dropOffId;
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
  revalidatePath(invite.role === "drop_off" ? "/dropoff" : "/restaurant");
  return { ok: true };
}

/**
 * Look up a pending invite for an email — used by the sign-up form to show a
 * "you've been invited" banner and skip the new-org fields. Minimal info only.
 */
export async function findPendingInvite(
  emailInput: string
): Promise<{ orgName: string; role: "restaurant" | "drop_off" } | null> {
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
  const d = invite.dropOffId
    ? await prisma.dropOff.findUnique({
        where: { id: invite.dropOffId },
        select: { name: true },
      })
    : null;
  if (!d) return null;
  return { orgName: d.name, role: "drop_off" };
}

// ---- Org-admin invite links: super-admin bootstraps an org_admin ----------

type CreateInviteResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

/**
 * Generate a one-time, no-expiry, revocable link a super_admin sends to bootstrap
 * an org_admin for a chosen (or newly created) organization. Only the token hash
 * is stored, so the returned URL is the sole copy of the raw token — it can't be
 * re-displayed later; a lost link is handled by revoke + regenerate.
 */
export async function createOrgAdminInvite(input: {
  email: string;
  orgId?: string | null;
  newOrgName?: string | null;
  newOrgDomain?: string | null;
}): Promise<CreateInviteResult> {
  const session = await auth();
  const actor = session?.user;
  if (!actor?.id) return { ok: false, error: "Not authenticated." };
  if (!isSuperAdmin(actor.role)) {
    return { ok: false, error: "Only a master admin can invite org admins." };
  }
  const demo = await blockIfDemo();
  if (demo) return demo;

  const ip = clientIp(await headers());
  const gate = await rateLimit(`org-admin-invite:${ip}`, LIMITS.orgAdminInvite);
  if (!gate.ok) {
    return { ok: false, error: "Too many invites just now. Please try again shortly." };
  }

  const email = (input.email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false, error: "Please enter a valid email address." };
  }

  const resolved = await resolveInviteOrg(
    { orgId: input.orgId, newOrgName: input.newOrgName, newOrgDomain: input.newOrgDomain },
    { db: prisma }
  );
  if (!resolved.ok) return resolved;

  const origin = await requestOrigin();
  if (!origin) {
    return { ok: false, error: "Server misconfigured (APP_URL unset) — can't build a link." };
  }

  const { raw, hash } = mintToken();
  await prisma.orgAdminInvite.create({
    data: {
      tokenHash: hash,
      email,
      organizationId: resolved.org.id,
      createdById: actor.id,
    },
  });
  revalidatePath("/admin/users");
  return { ok: true, url: `${origin}/admin-invite/${raw}` };
}

/** Revoke a still-pending invite. Super-admin only. */
export async function revokeOrgAdminInvite(inviteId: string): Promise<SignUpResult> {
  const session = await auth();
  if (!isSuperAdmin(session?.user?.role)) {
    return { ok: false, error: "Only a master admin can revoke invites." };
  }
  const demo = await blockIfDemo();
  if (demo) return demo;

  const invite = await prisma.orgAdminInvite.findUnique({ where: { id: inviteId } });
  if (!invite || invite.status !== "pending") {
    return { ok: false, error: "That invite is no longer pending." };
  }
  await prisma.orgAdminInvite.update({
    where: { id: inviteId },
    data: { status: "revoked" },
  });
  revalidatePath("/admin/users");
  return { ok: true };
}

/**
 * Redeem an invite link: create an active org_admin for the invite's org. The
 * email prefills but is editable, so it's validated and uniqueness-checked here;
 * the token, not the email, is the credential. Returns ok so the client can then
 * sign in with the credentials the recipient just set.
 */
export async function acceptOrgAdminInvite(input: {
  token: string;
  name: string;
  email: string;
  phone: string;
  password: string;
}): Promise<SignUpResult> {
  const ip = clientIp(await headers());
  const gate = await rateLimit(`register:${ip}`, LIMITS.register);
  if (!gate.ok) {
    return { ok: false, error: "Too many attempts. Please try again later." };
  }

  const loaded = await loadPendingInvite(input.token, { db: prisma });
  if (!loaded.ok) return loaded;

  const name = (input.name ?? "").trim();
  const email = (input.email ?? "").trim().toLowerCase();
  const phone = (input.phone ?? "").replace(/\D/g, "");
  const password = input.password ?? "";

  if (!name) return { ok: false, error: "Please enter your name." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false, error: "Please enter a valid email address." };
  }
  if (phone.length !== 10) {
    return { ok: false, error: "Please enter a valid 10-digit phone number." };
  }
  if (!passwordValid(password)) {
    return { ok: false, error: "Password must be 8+ characters with an uppercase letter and a number." };
  }
  if (await emailTaken(email, { db: prisma })) {
    return { ok: false, error: "That email already has an account." };
  }

  const passwordHash = await bcrypt.hash(password, 10);
  try {
    const created = await prisma.$transaction(async (tx) => {
      // Re-check the invite is still pending inside the write so two concurrent
      // redemptions can't both mint an account from one link.
      const fresh = await tx.orgAdminInvite.findUnique({
        where: { id: loaded.invite.id },
        select: { status: true },
      });
      if (!fresh || fresh.status !== "pending") {
        throw new Prisma.PrismaClientKnownRequestError("consumed", {
          code: "P2025",
          clientVersion: Prisma.prismaVersion.client,
        });
      }
      const user = await tx.user.create({
        data: {
          name,
          email,
          phone,
          passwordHash,
          role: "org_admin",
          status: "active",
          organizationId: loaded.invite.organizationId,
        },
      });
      await tx.orgAdminInvite.update({
        where: { id: loaded.invite.id },
        data: { status: "accepted", acceptedUserId: user.id, acceptedAt: new Date() },
      });
      return user;
    });
    trackServer({ name: "signup_submitted", props: { role: "org_admin", hadInvite: true } }, created.id);
    identifyServer(created.id, "org_admin");
    return { ok: true };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2002") return { ok: false, error: "That email already has an account." };
      if (e.code === "P2025") return { ok: false, error: "This invite link is no longer valid." };
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

// The absolute origin for the reset link. We REQUIRE APP_URL rather than derive
// the host from request headers: `x-forwarded-host` is attacker-controllable, so
// trusting it lets someone trigger a victim's reset and have the (valid) token
// emailed with a link pointing at their own domain — reset-link poisoning, i.e.
// account takeover. In production an unset APP_URL returns null (we skip the
// email rather than send an unsafe link); in dev we fall back to the request
// host purely for local convenience, where the link is only logged, never sent.
async function requestOrigin(): Promise<string | null> {
  const env = process.env.APP_URL?.replace(/\/$/, "");
  if (env) return env;
  if (process.env.NODE_ENV === "production") return null;
  const h = await headers();
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
  const ip = clientIp(await headers());
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
    const origin = await requestOrigin();
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
  const ip = clientIp(await headers());
  const gate = await rateLimit(`reset-do:${ip}`, LIMITS.passwordReset);
  if (!gate.ok) {
    return { ok: false, error: "Too many attempts. Please try again later." };
  }

  if (!token) return { ok: false, error: "This reset link is invalid." };
  if (!passwordValid(newPassword)) {
    return { ok: false, error: "Password must be 8+ characters with an uppercase letter and a number." };
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
  revalidatePath("/impact");
  revalidatePath("/restaurant");
  revalidatePath("/restaurant/listings");
  revalidatePath("/dropoff");
  if (listingId) revalidatePath(`/listings/${listingId}`);
}

/**
 * Claim an open listing. A transaction guards against volunteers over-filling
 * the listing, and stamps a 15-minute hold the expiry cron enforces. A listing
 * that needs several cars (carsNeeded) takes one claim per volunteer and only
 * leaves the open feed once enough people have claimed.
 *
 * Destination-first: a claim can't start without a drop-off decided. The first
 * claimer picks one (validated against what the location can take in); later
 * cars on a multi-car listing inherit the same destination.
 */
export async function claimListing(listingId: string, dropOffId?: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated.");
  // Claiming is a volunteer action, and only a volunteer's. Restaurants post the
  // surplus, drop-offs receive it, and admins (org + master) oversee the
  // operation — none of them carry pickups. The UI hides the claim flow from all
  // of them, and this is the matching server-side gate: /listings/[id] is
  // readable by any signed-in account, so the action must refuse on its own
  // rather than trust that no button was rendered.
  if (!canClaimPickups(session.user.role)) {
    throw new Error("Claiming is for volunteer accounts.");
  }
  const volunteerId = session.user.id;
  let trackData: { expiresAt: Date; servings: number; dropOffId: string } | null = null;
  let notifyData:
    | { restaurantId: string; title: string; carsNeeded: number | null; carsClaimed: number }
    | null = null;
  await prisma.$transaction(async (tx) => {
    const listing = await tx.foodListing.findUnique({
      where: { id: listingId },
      include: { pickups: { select: { volunteerId: true, buddyId: true } } },
    });
    if (!listing || listing.status !== "open") {
      throw new Error("This listing is no longer available.");
    }
    // Scheduled/future listings are visible but locked until they go live.
    if (listing.availableAt && listing.availableAt > new Date()) {
      throw new Error("This pickup isn't open yet.");
    }
    const needed = claimsNeeded(listing.carsNeeded);
    if (listing.pickups.length >= needed) {
      throw new Error("This listing is no longer available.");
    }
    if (
      listing.pickups.some(
        (p) => p.volunteerId === volunteerId || p.buddyId === volunteerId
      )
    ) {
      throw new Error("You're already on this pickup.");
    }
    // One rescue at a time: a volunteer with a live claim anywhere (either
    // seat) can't take another until it's delivered or released.
    const active = await findActiveClaimFor(tx, volunteerId, listingId);
    if (active) {
      throw new Error(
        `One rescue at a time — you're already on "${active.title}". Deliver or release it first.`
      );
    }
    // Resolve the destination. Once set (by the first car, or a legacy row) it
    // stands for every later claim; otherwise the caller must have picked one,
    // and it has to actually be able to take this food — the same eligibility
    // rules lib/recommend uses to rank the picker.
    let chosenDropOffId = listing.dropOffId;
    if (!chosenDropOffId) {
      if (!dropOffId) {
        throw new Error("Pick a drop-off before claiming.");
      }
      const dropOff = await tx.dropOff.findUnique({ where: { id: dropOffId } });
      if (!dropOff || dropOff.demo !== listing.demo) {
        throw new Error("That drop-off isn't available.");
      }
      if (!dropOff.acceptedCategories.includes(listing.category)) {
        throw new Error(`${dropOff.name} can't take ${listing.category} food.`);
      }
      if (listing.perishable && !dropOff.refrigerated) {
        throw new Error(`${dropOff.name} isn't refrigerated — this food needs cold storage.`);
      }
      chosenDropOffId = dropOff.id;
    }
    await tx.pickup.create({
      data: {
        listingId,
        volunteerId,
        holdUntil: new Date(Date.now() + HOLD_MINUTES * 60_000),
      },
    });
    // Stamp the destination; only the claim that fills the last car seat closes
    // the listing — until then it stays open so the remaining cars can still be
    // claimed (delivering to the same drop-off).
    await tx.foodListing.update({
      where: { id: listingId },
      data: {
        dropOffId: chosenDropOffId,
        ...(listing.pickups.length + 1 >= needed ? { status: "claimed" as const } : {}),
      },
    });
    await tx.listingEvent.create({
      data: { listingId, type: "claimed", actorId: volunteerId },
    });
    trackData = {
      expiresAt: listing.expiresAt,
      servings: listing.servings ?? 0,
      dropOffId: chosenDropOffId,
    };
    notifyData = {
      restaurantId: listing.restaurantId,
      title: listing.title,
      carsNeeded: listing.carsNeeded,
      carsClaimed: listing.pickups.length + 1,
    };
  });
  refreshViews(listingId);
  if (trackData) {
    const claimTrackData: { expiresAt: Date; servings: number; dropOffId: string } = trackData;
    const { expiresAt, servings, dropOffId: trackedDropOffId } = claimTrackData;
    trackServer(
      {
        name: "claim_completed",
        props: {
          listingId,
          dropOffId: trackedDropOffId,
          minutesToExpiry: Math.max(0, Math.round((expiresAt.getTime() - Date.now()) / 60000)),
          servings,
        },
      },
      volunteerId,
    );
  }
  // Reassure the restaurant that a volunteer is on the way. Fired after commit,
  // best-effort — the claim already succeeded, so a push failure must not throw.
  if (notifyData) {
    const claimNotifyData: { restaurantId: string; title: string; carsNeeded: number | null; carsClaimed: number } =
      notifyData;
    try {
      await sendRestaurantRescueNotice({
        event: "claimed",
        restaurantId: claimNotifyData.restaurantId,
        listingId,
        listingTitle: claimNotifyData.title,
        carsNeeded: claimNotifyData.carsNeeded,
        carsClaimed: claimNotifyData.carsClaimed,
      });
    } catch {
      // best-effort notification
    }
  }
}

/** Voluntarily release the caller's claim, reopening the listing. */
export async function releaseClaim(listingId: string) {
  const userId = await currentUserId();
  // Read the pickup before releasing — a sole-volunteer release deletes the
  // row, so this is the only chance to capture its claimedAt/photo state for
  // the cancelled event below.
  const pickupBefore = await prisma.pickup.findFirst({
    where: { listingId, OR: [{ volunteerId: userId }, { buddyId: userId }] },
    select: { id: true, claimedAt: true, photoAtPickupUrl: true },
  });
  await releaseClaimFor(prisma, userId, listingId);
  refreshViews(listingId);
  if (pickupBefore) {
    trackServer(
      {
        name: "pickup_cancelled",
        props: {
          pickupId: pickupBefore.id,
          stage: pickupBefore.photoAtPickupUrl ? "photographed" : "claimed",
        },
      },
      userId,
    );
  }
}

/**
 * Capture the pickup photo and advance claimed → in_transit. The photo is
 * required — it's the proof a pickup actually happened (anti-flaking).
 */
export async function startDelivery(
  listingId: string,
  photoUrl: string,
  safety?: Record<string, boolean> | null
) {
  const userId = await currentUserId();
  await startDeliveryWithPhotoFor(prisma, userId, listingId, photoUrl, safety);
  refreshViews(listingId);
  const pickup = await prisma.pickup.findFirst({
    where: { listingId, OR: [{ volunteerId: userId }, { buddyId: userId }] },
    select: { id: true, claimedAt: true },
  });
  if (pickup) {
    const minutesSinceClaim = Math.max(0, Math.round((Date.now() - pickup.claimedAt.getTime()) / 60000));
    trackServer(
      { name: "pickup_photo_uploaded", props: { pickupId: pickup.id, minutesSinceClaim } },
      userId,
    );
    trackServer({ name: "in_transit_started", props: { pickupId: pickup.id } }, userId);
  }
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
  const pickup = await prisma.pickup.findFirst({
    where: { listingId, OR: [{ volunteerId: userId }, { buddyId: userId }] },
    select: { id: true, claimedAt: true, deliveredAt: true, listing: { select: { servings: true } } },
  });
  if (pickup) {
    const minutesClaimToDelivered = Math.max(
      0,
      Math.round(((pickup.deliveredAt ?? new Date()).getTime() - pickup.claimedAt.getTime()) / 60000),
    );
    trackServer(
      {
        name: "delivered",
        props: {
          pickupId: pickup.id,
          servings: pickup.listing.servings ?? 0,
          minutesClaimToDelivered,
        },
      },
      userId,
    );
  }
  return getVolunteerImpact(userId, await isDemo());
}

/**
 * Keep the food overnight and deliver it the next day instead of letting the
 * rescue fall through when the drop-off is closed or the day runs out. Advances
 * the caller's in_transit pickup → taken_home; they complete it later with the
 * normal delivery photo.
 */
export async function takeHomeForTomorrow(listingId: string) {
  const userId = await currentUserId();
  await takeHomeForTomorrowFor(prisma, userId, listingId);
  refreshViews(listingId);
  const pickup = await prisma.pickup.findFirst({
    where: { listingId, OR: [{ volunteerId: userId }, { buddyId: userId }] },
    select: { id: true },
  });
  if (pickup) {
    trackServer({ name: "taken_home", props: { pickupId: pickup.id } }, userId);
  }
}

/**
 * Record the caller's one-tap "rescue accuracy" signal on a pickup they did —
 * was the food present and as described? Private operations metric (org-admin +
 * the restaurant), never a public board.
 */
export async function recordRescueAccuracy(
  listingId: string,
  accuracy: string,
  note?: string
) {
  const userId = await currentUserId();
  await recordRescueAccuracyFor(prisma, userId, listingId, accuracy, note);
  refreshViews(listingId);
}

/**
 * Update the signed-in account's own profile (name, phone, photo). Email is the
 * login identifier and organization is the fixed chapter, so neither is editable
 * here. The image URL is trusted the same way listing photos are — it only
 * becomes visible once attached to the caller's own row.
 */
export async function updateProfile(input: {
  name: string;
  phone: string;
  imageUrl: string | null;
}): Promise<SignUpResult> {
  const userId = await currentUserId();

  const name = input.name.trim();
  if (name.length < 2) {
    return { ok: false, error: "Please enter your name." };
  }

  // Phone is optional here; when present it must be a real 10-digit number,
  // matching sign-up. Empty clears it.
  const digits = (input.phone ?? "").replace(/\D/g, "");
  if (digits.length > 0 && digits.length !== 10) {
    return { ok: false, error: "Please enter a valid 10-digit phone number." };
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      name,
      phone: digits.length === 10 ? digits : null,
      imageUrl: input.imageUrl,
    },
  });

  revalidatePath("/profile");
  revalidatePath("/impact");
  revalidatePath("/"); // the nav avatar reflects the new photo/name
  return { ok: true };
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
const ALLERGENS_MAX = 12; // distinct labels per listing
const ALLERGEN_LEN_MAX = 40; // chars per label

const TEMP_HANDLING = ["hot", "cold", "ambient"] as const;
type TempHandling = (typeof TEMP_HANDLING)[number];

// Clean an allergen list from the client: trim, drop blanks, dedupe
// (case-insensitively), and cap both count and per-label length.
function cleanAllergens(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const label = raw.trim().slice(0, ALLERGEN_LEN_MAX);
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
    if (out.length >= ALLERGENS_MAX) break;
  }
  return out;
}

// Validate the temp-handling choice, or null when unspecified/invalid.
function cleanTempHandling(input: unknown): TempHandling | null {
  return TEMP_HANDLING.includes(input as TempHandling) ? (input as TempHandling) : null;
}

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
  carsNeeded?: number;
  notes?: string;
  imageUrl?: string;
  allergens?: string[];
  tempHandling?: string;
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

  // Cars suggested to carry the food. Bounded the same way as servings so a
  // bad client value can't write nonsense; null when not provided.
  let carsNeeded: number | null = null;
  if (input.carsNeeded != null) {
    carsNeeded = boundedInt(input.carsNeeded, 1, 99);
  }

  const notes = input.notes?.trim().slice(0, NOTES_MAX) || null;
  const imageUrl = input.imageUrl?.trim().slice(0, IMAGE_URL_MAX) || null;
  const allergens = cleanAllergens(input.allergens);
  const tempHandling = cleanTempHandling(input.tempHandling);

  const listing = await prisma.foodListing.create({
    data: {
      title,
      servings,
      weightLbs,
      carsNeeded,
      notes,
      imageUrl,
      allergens,
      tempHandling,
      status: "open",
      restaurantId,
      // Post into the poster's current world so it surfaces in their feed/map.
      demo: await isDemo(),
      expiresAt: new Date(Date.now() + minutes * 60_000),
      events: { create: { type: "posted" } },
    },
  });
  refreshViews(listing.id);
  trackServer(
    {
      name: "listing_posted",
      props: {
        servings,
        foodType: listing.category,
        handling: tempHandling ?? "",
        minutesToExpiry: minutes,
        carsRequested: carsNeeded ?? 0,
      },
    },
    session.user.id,
  );
  return listing.id;
}

// Resolve the restaurant a posting action acts on, from the session — a
// restaurant member posts for their own restaurant; an org_admin may target an
// arbitrary one. Never trusts a client-sent id for a plain restaurant account.
async function resolvePostingRestaurantId(
  inputRestaurantId?: string
): Promise<string> {
  const session = await auth();
  const role = session?.user?.role;
  if (!session?.user?.id) throw new Error("Not authenticated.");
  if (role === "org_admin") {
    if (!inputRestaurantId?.trim()) throw new Error("Pick a restaurant.");
    return inputRestaurantId.trim();
  }
  if (role === "restaurant") {
    const me = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { restaurantId: true },
    });
    if (!me?.restaurantId) throw new Error("Your account has no restaurant.");
    return me.restaurantId;
  }
  throw new Error("Only restaurants can post listings.");
}

const DAY_MINUTES = 24 * 60;

/**
 * Create a recurring surplus schedule for the caller's restaurant. The schedule
 * is a template (title/servings/window) plus a recurrence (weekdays + time of
 * day); a generator materializes upcoming FoodListings from it so volunteers see
 * future pickups. We materialize immediately so the schedule's listings appear
 * without waiting for the next cron sweep.
 */
export async function createRecurringPost(input: {
  restaurantId?: string;
  title: string;
  servings: number;
  weightLbs?: number;
  notes?: string;
  daysOfWeek: number[];
  timeOfDay: number;
  windowMinutes: number;
}): Promise<SignUpResult> {
  let restaurantId: string;
  try {
    restaurantId = await resolvePostingRestaurantId(input.restaurantId);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const title = input.title?.trim();
  if (!title) return { ok: false, error: "Please enter what you're sharing." };
  if (title.length > TITLE_MAX) return { ok: false, error: "Title is too long." };

  const servings = boundedInt(input.servings, 1, SERVINGS_MAX);
  if (servings === null) {
    return { ok: false, error: "Enter a valid number of servings." };
  }

  const days = normalizeDaysOfWeek(input.daysOfWeek);
  if (!days) return { ok: false, error: "Pick at least one day." };

  const timeOfDay = boundedInt(input.timeOfDay, 0, DAY_MINUTES - 1);
  if (timeOfDay === null) return { ok: false, error: "Pick a valid time." };

  const windowMinutes = boundedInt(input.windowMinutes, 1, MINUTES_MAX);
  if (windowMinutes === null) {
    return { ok: false, error: "Enter a valid pickup window." };
  }

  let weightLbs: number | null = null;
  if (input.weightLbs != null) {
    const w = boundedInt(input.weightLbs, 1, WEIGHT_MAX);
    if (w === null) return { ok: false, error: "Enter a valid weight." };
    weightLbs = w;
  }

  const notes = input.notes?.trim().slice(0, NOTES_MAX) || null;

  await prisma.recurringPost.create({
    data: {
      restaurantId,
      title,
      servings,
      weightLbs,
      notes,
      daysOfWeek: days,
      timeOfDay,
      windowMinutes,
      demo: await isDemo(),
    },
  });
  // Generate the upcoming listings now so the feed shows them right away.
  await materializeSchedules();
  refreshViews();
  revalidatePath("/map");
  return { ok: true };
}

/** Verify a recurring post exists and the caller owns it (or is org_admin). */
async function authorizeSchedule(id: string): Promise<
  { ok: true; demo: boolean } | { ok: false; error: string }
> {
  const session = await auth();
  const role = session?.user?.role;
  if (!session?.user?.id) return { ok: false, error: "Not authenticated." };
  const schedule = await prisma.recurringPost.findUnique({ where: { id } });
  if (!schedule) return { ok: false, error: "That schedule no longer exists." };
  if (role === "org_admin") return { ok: true, demo: schedule.demo };
  if (role === "restaurant") {
    const me = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { restaurantId: true },
    });
    if (me?.restaurantId !== schedule.restaurantId) {
      return { ok: false, error: "That isn't your restaurant's schedule." };
    }
    return { ok: true, demo: schedule.demo };
  }
  return { ok: false, error: "Only restaurants can manage schedules." };
}

// Remove a schedule's not-yet-live, unclaimed listings (and their events) so
// pausing/deleting it clears upcoming pickups from the feed. Live or claimed
// listings are left alone — the food still needs rescuing.
async function clearFutureListings(recurringPostId: string) {
  const future = await prisma.foodListing.findMany({
    where: {
      recurringPostId,
      status: "open",
      availableAt: { gt: new Date() },
    },
    select: { id: true },
  });
  const ids = future.map((f) => f.id);
  if (ids.length === 0) return;
  await prisma.listingEvent.deleteMany({ where: { listingId: { in: ids } } });
  await prisma.foodListing.deleteMany({ where: { id: { in: ids } } });
}

/** Edit a schedule's details. Regenerates its upcoming (unclaimed) listings so
 * the change takes effect on the feed; live/claimed pickups keep their terms. */
export async function updateRecurringPost(input: {
  id: string;
  title: string;
  servings: number;
  notes?: string;
  daysOfWeek: number[];
  timeOfDay: number;
  windowMinutes: number;
}): Promise<SignUpResult> {
  const gate = await authorizeSchedule(input.id);
  if (!gate.ok) return gate;

  const title = input.title?.trim();
  if (!title) return { ok: false, error: "Please enter what you're sharing." };
  if (title.length > TITLE_MAX) return { ok: false, error: "Title is too long." };

  const servings = boundedInt(input.servings, 1, SERVINGS_MAX);
  if (servings === null) {
    return { ok: false, error: "Enter a valid number of servings." };
  }

  const days = normalizeDaysOfWeek(input.daysOfWeek);
  if (!days) return { ok: false, error: "Pick at least one day." };

  const timeOfDay = boundedInt(input.timeOfDay, 0, DAY_MINUTES - 1);
  if (timeOfDay === null) return { ok: false, error: "Pick a valid time." };

  const windowMinutes = boundedInt(input.windowMinutes, 1, MINUTES_MAX);
  if (windowMinutes === null) {
    return { ok: false, error: "Enter a valid pickup window." };
  }

  const notes = input.notes?.trim().slice(0, NOTES_MAX) || null;

  await prisma.recurringPost.update({
    where: { id: input.id },
    data: { title, servings, notes, daysOfWeek: days, timeOfDay, windowMinutes },
  });
  // Clear the stale upcoming occurrences and regenerate from the new terms.
  // Only unclaimed future rows are cleared; the sweep skips paused schedules.
  await clearFutureListings(input.id);
  await materializeSchedules();
  refreshViews();
  revalidatePath("/map");
  return { ok: true };
}

/** Pause or resume a schedule. Pausing clears its upcoming (locked) listings. */
export async function setRecurringPostActive(
  id: string,
  active: boolean
): Promise<SignUpResult> {
  const gate = await authorizeSchedule(id);
  if (!gate.ok) return gate;
  await prisma.recurringPost.update({ where: { id }, data: { active } });
  if (active) {
    await materializeSchedules();
  } else {
    await clearFutureListings(id);
  }
  refreshViews();
  revalidatePath("/map");
  return { ok: true };
}

/** Delete a schedule and its upcoming (unclaimed) listings. */
export async function deleteRecurringPost(id: string): Promise<SignUpResult> {
  const gate = await authorizeSchedule(id);
  if (!gate.ok) return gate;
  await clearFutureListings(id);
  // Any remaining listings (live/claimed/past) keep their history; just detach
  // them from the schedule so the FK delete succeeds.
  await prisma.foodListing.updateMany({
    where: { recurringPostId: id },
    data: { recurringPostId: null },
  });
  await prisma.recurringPost.delete({ where: { id } });
  refreshViews();
  revalidatePath("/map");
  return { ok: true };
}

/**
 * Switch the caller's world between demo (curated sample) and real (live data).
 * Saved on the account so it follows the user across devices.
 */
export async function setDataMode(
  mode: "real" | "demo"
): Promise<SignUpResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated." };
  if (mode !== "real" && mode !== "demo") {
    return { ok: false, error: "Invalid mode." };
  }
  // Demo accounts are locked to the demo world — they can never switch to real.
  // (A real account browsing demo keeps demo = false, so it's unaffected.)
  if (mode === "real") {
    const me = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { demo: true },
    });
    if (me?.demo) {
      return { ok: false, error: "Demo accounts stay in the demo world." };
    }
  }
  await prisma.user.update({
    where: { id: session.user.id },
    data: { dataMode: mode },
  });
  // Every data view reads the mode, so refresh them all.
  refreshViews();
  revalidatePath("/map");
  revalidatePath("/settings");
  return { ok: true };
}

/**
 * Reset the curated demo world to its pristine showcase state. Called by the
 * client right before sign-out (see NavBar) so the demo always starts clean for
 * the next person — claims, deliveries, and posts made while exploring are
 * wiped and reseeded. No-op for real-mode users (nothing demo to reset), so a
 * normal account logging out pays nothing. Returns whether a reset ran.
 */
export async function resetDemoOnLogout(): Promise<{ reset: boolean }> {
  if (!(await isDemo())) return { reset: false };
  await resetDemoWorld(prisma);
  refreshViews();
  revalidatePath("/map");
  return { reset: true };
}

/**
 * Rebuild the demo world so the tour has something to run on.
 *
 * A fresh demo world holds only four claimable pickups — the other fifteen
 * listings are seeded into claimed/in transit/delivered/expired/failed to
 * showcase the rest of the lifecycle. Chapter 3 consumes one per run and never
 * puts it back, so a few runs in one sitting leave the feed empty and the tour
 * with no card to open. The hourly cron eventually restores it; this makes the
 * next run work now — but only when the feed is genuinely empty, so a start on a
 * stocked world costs one count instead of a full rebuild.
 *
 * Safe here specifically because the tour's entry points are gated on the
 * viewer carrying nothing (lib/tour/gate). The reseed deletes every demo
 * pickup, so if it could run mid-rescue it would silently destroy one — the
 * gate is what makes that unreachable.
 */
export async function resetDemoForTour(): Promise<{ reset: boolean }> {
  if (!(await isDemo())) return { reset: false };
  // Only pay for it when the world is actually spent. Reseeding is seconds of
  // work and it ran on every start, so the common case — a world that still has
  // pickups — sat waiting on a rebuild it did not need. One indexed count is
  // cheap enough to ask first.
  const claimable = await prisma.foodListing.count({
    where: {
      demo: true,
      status: "open",
      OR: [{ availableAt: null }, { availableAt: { lte: new Date() } }],
    },
  });
  if (claimable > 0) return { reset: false };
  await resetDemoWorld(prisma);
  refreshViews();
  revalidatePath("/map");
  return { reset: true };
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

/**
 * Who may edit a drop-off's own settings — notes, hours, notices, constraints,
 * need level: the account that speaks for that location (its own dropOffId), or
 * any org admin (chapter-wide oversight). Returns an error message when denied.
 */
async function guardDropOffEdit(
  dropOffId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth();
  const role = session?.user?.role;
  if (role === "org_admin") return { ok: true };
  if (role === "drop_off") {
    const me = await prisma.user.findUnique({
      where: { id: session!.user!.id },
      select: { dropOffId: true },
    });
    if (me?.dropOffId && me.dropOffId === dropOffId) return { ok: true };
    return { ok: false, error: "That isn't your drop-off." };
  }
  return { ok: false, error: "Only the drop-off or an org admin can edit this." };
}

/** The drop-off (or an org admin) sets the special requests / restraints. */
export async function updateDropOffNotes(
  dropOffId: string,
  notes: string
): Promise<SignUpResult> {
  const guard = await guardDropOffEdit(dropOffId);
  if (!guard.ok) return guard;
  await prisma.dropOff.update({
    where: { id: dropOffId },
    data: { notes: notes.trim() || null },
  });
  revalidatePath("/dropoff");
  revalidatePath(`/dropoffs/${dropOffId}`);
  return { ok: true };
}

/**
 * Org-admin relationship memory: save the contacts & quirks an org admin keeps
 * on a restaurant or drop-off — the handoff knowledge that survives founder
 * turnover. Org-admin only, demo-blocked. Logs the edit to the AdminEvent stream
 * so the institutional record shows who changed what, and when.
 */
export async function saveOrgNotes(
  entity: "restaurant" | "drop_off",
  id: string,
  input: OrgNotesInput
): Promise<SignUpResult> {
  const session = await auth();
  if (session?.user?.role !== "org_admin") {
    return { ok: false, error: "Only org admins can edit relationship notes." };
  }
  const demo = await blockIfDemo();
  if (demo) return demo;
  if (entity !== "restaurant" && entity !== "drop_off") {
    return { ok: false, error: "Unknown record." };
  }

  const data = cleanOrgNotes(input);

  // Fetch the name for the log + confirm the row exists.
  const name =
    entity === "restaurant"
      ? (await prisma.restaurant.findUnique({ where: { id }, select: { name: true } }))?.name
      : (await prisma.dropOff.findUnique({ where: { id }, select: { name: true } }))?.name;
  if (!name) return { ok: false, error: "Record not found." };

  await prisma.$transaction([
    entity === "restaurant"
      ? prisma.restaurant.update({ where: { id }, data })
      : prisma.dropOff.update({ where: { id }, data }),
    prisma.adminEvent.create({
      data: {
        type: "notes_edited",
        actorId: session.user.id,
        meta: { entity, entityId: id, name },
      },
    }),
  ]);

  revalidatePath("/admin/partners");
  return { ok: true };
}

const NOTICE_MAX = 280;
const NOTICE_KINDS = ["hours", "conditions", "general"] as const;

/**
 * Post a temporary service notice for a drop-off — a change to its normal hours
 * or conditions that volunteers should see (closing early, fridge down, side
 * door, etc.). The drop-off itself or an org admin only. `untilIso` is optional;
 * when set, the notice auto-expires after it.
 */
export async function postDropOffNotice(input: {
  dropOffId: string;
  kind: "hours" | "conditions" | "general";
  body: string;
  untilIso?: string;
}): Promise<SignUpResult> {
  const guard = await guardDropOffEdit(input.dropOffId);
  if (!guard.ok) return guard;
  const session = await auth();
  const body = input.body?.trim();
  if (!body) return { ok: false, error: "Add a short note about the change." };
  const kind = NOTICE_KINDS.includes(input.kind) ? input.kind : "general";

  let until: Date | null = null;
  if (input.untilIso) {
    const d = new Date(input.untilIso);
    if (Number.isNaN(d.getTime())) {
      return { ok: false, error: "That end time isn't valid." };
    }
    if (d.getTime() <= Date.now()) {
      return { ok: false, error: "The end time must be in the future." };
    }
    until = d;
  }

  await prisma.dropOffNotice.create({
    data: {
      dropOffId: input.dropOffId,
      authorId: session!.user!.id,
      kind,
      body: body.slice(0, NOTICE_MAX),
      until,
      demo: await isDemo(),
    },
  });
  revalidatePath("/dropoff");
  revalidatePath(`/dropoffs/${input.dropOffId}`);
  revalidatePath("/");
  revalidatePath("/map");
  return { ok: true };
}

/** Remove a drop-off service notice. The drop-off itself or an org admin only. */
export async function removeDropOffNotice(id: string): Promise<SignUpResult> {
  const notice = await prisma.dropOffNotice.findUnique({ where: { id } });
  if (!notice) return { ok: true };
  const guard = await guardDropOffEdit(notice.dropOffId);
  if (!guard.ok) return guard;
  await prisma.dropOffNotice.delete({ where: { id } });
  revalidatePath("/dropoff");
  revalidatePath(`/dropoffs/${notice.dropOffId}`);
  revalidatePath("/");
  revalidatePath("/map");
  return { ok: true };
}

/** The drop-off (or an org admin) sets the structured food-retrieval hours. */
export async function updateRetrievalHours(
  dropOffId: string,
  hours: unknown
): Promise<SignUpResult> {
  const guard = await guardDropOffEdit(dropOffId);
  if (!guard.ok) return guard;
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

const NEED_LEVELS = ["low", "steady", "high"] as const;

/**
 * The drop-off (or an org admin) sets how much food this location wants right
 * now — a standing, manual signal shown to volunteers choosing a drop-off.
 */
export async function updateNeedLevel(
  dropOffId: string,
  level: "low" | "steady" | "high"
): Promise<SignUpResult> {
  const guard = await guardDropOffEdit(dropOffId);
  if (!guard.ok) return guard;
  if (!NEED_LEVELS.includes(level)) {
    return { ok: false, error: "Pick a need level." };
  }
  await prisma.dropOff.update({
    where: { id: dropOffId },
    data: { needLevel: level },
  });
  revalidatePath("/dropoff");
  revalidatePath(`/dropoffs/${dropOffId}`);
  revalidatePath("/");
  revalidatePath("/map");
  trackServer({ name: "drop_off_need_updated", props: { dropOffId, needLevel: level } });
  return { ok: true };
}

const FOOD_CATEGORIES: readonly string[] = [
  "prepared",
  "produce",
  "bakery",
  "packaged",
  "dairy",
  "beverages",
];
/**
 * The drop-off (or an org admin) sets what this location can physically take in
 * — the food categories it accepts and whether it can hold cold/perishable
 * food. Drives the eligibility rules in lib/recommend, so only reachable
 * destinations are offered to a claiming volunteer.
 */
export async function updateDropOffConstraints(
  dropOffId: string,
  input: { acceptedCategories: string[]; refrigerated: boolean }
): Promise<SignUpResult> {
  const guard = await guardDropOffEdit(dropOffId);
  if (!guard.ok) return guard;

  const categories = Array.from(new Set(input.acceptedCategories)).filter((c) =>
    FOOD_CATEGORIES.includes(c)
  ) as FoodCategory[];

  await prisma.dropOff.update({
    where: { id: dropOffId },
    data: {
      acceptedCategories: categories,
      refrigerated: Boolean(input.refrigerated),
    },
  });
  revalidatePath("/dropoff");
  revalidatePath(`/dropoffs/${dropOffId}`);
  revalidatePath("/");
  revalidatePath("/map");
  return { ok: true };
}

// Roles an org_admin can assign via the panel. "restaurant" and "drop_off" are
// excluded — each is tied to a partner entity and only set at sign-up/approval.
type ManagedRole = "volunteer" | "org_admin";

/** Change a user's role. Org-admin (and super-admin) only; never leaves zero org admins. */
export async function setRole(
  userId: string,
  role: ManagedRole | "super_admin"
): Promise<SignUpResult> {
  const session = await auth();
  const actorRole = session?.user?.role;
  if (!isAdmin(actorRole)) {
    return { ok: false, error: "Only org admins can change roles." };
  }
  const demoRole = await blockIfDemo();
  if (demoRole) return demoRole;

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return { ok: false, error: "User not found." };

  const actor = await prisma.user.findUnique({
    where: { id: session!.user!.id },
    select: { organizationId: true },
  });

  // Counts for the last-admin guards.
  const [orgAdminCount, superAdminCount] = await Promise.all([
    prisma.user.count({
      where: { role: "org_admin", status: "active", organizationId: target.organizationId },
    }),
    prisma.user.count({ where: { role: "super_admin", status: "active" } }),
  ]);

  const error = roleChangeError({
    actorRole: actorRole!,
    actorId: session!.user!.id,
    actorOrgId: actor?.organizationId ?? null,
    target: {
      id: target.id,
      role: target.role,
      organizationId: target.organizationId,
    },
    newRole: role,
    orgAdminCount,
    superAdminCount,
  });
  if (error) return { ok: false, error };
  if (target.role === role) return { ok: true };

  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { role } }),
    prisma.adminEvent.create({
      data: {
        type: "role_changed",
        actorId: session!.user!.id,
        targetId: userId,
        meta: { from: target.role, to: role },
      },
    }),
  ]);
  revalidatePath("/admin/users");
  return { ok: true };
}

// The org/location details a pending partner submitted at sign-up.
type PendingOrg = {
  kind: "restaurant" | "drop_off";
  name: string;
  address: string;
};

function readPendingOrg(value: Prisma.JsonValue | null): PendingOrg | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const o = value as Record<string, unknown>;
  if ((o.kind !== "restaurant" && o.kind !== "drop_off") || typeof o.name !== "string" || typeof o.address !== "string") {
    return null;
  }
  return { kind: o.kind, name: o.name, address: o.address };
}

/**
 * Approve a pending restaurant/drop-off account: create its real
 * Restaurant/DropOff (geocoded so it lands a pin), link/activate the account,
 * and clear the held details. Org-admin only. Idempotent — approving an
 * already-active account is a no-op.
 */
export async function approveAccount(userId: string): Promise<SignUpResult> {
  const session = await auth();
  if (!isAdmin(session?.user?.role)) {
    return { ok: false, error: "Only org admins can approve accounts." };
  }
  const demoApprove = await blockIfDemo();
  if (demoApprove) return demoApprove;
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return { ok: false, error: "Account not found." };
  if (target.status === "active") return { ok: true };

  const pending = readPendingOrg(target.pendingOrg);
  if (!pending) {
    // No org details to materialize — just activate (shouldn't normally happen).
    await prisma.user.update({
      where: { id: userId },
      data: { status: "active", pendingOrg: Prisma.DbNull },
    });
    revalidatePath("/admin/users");
    return { ok: true };
  }

  // Geocode outside the transaction (network call); fall back to campus center.
  const geo = await geocodeAddress(pending.address);
  const lat = geo?.lat ?? 40.04;
  const lng = geo?.lng ?? -75.34;

  await prisma.$transaction(async (tx) => {
    let restaurantId: string | null = null;
    let dropOffId: string | null = null;
    if (pending.kind === "restaurant") {
      const restaurant = await tx.restaurant.create({
        data: { name: pending.name, address: pending.address, lat, lng },
      });
      restaurantId = restaurant.id;
    } else {
      const dropOff = await tx.dropOff.create({
        data: {
          name: pending.name,
          address: pending.address,
          lat,
          lng,
          // Accept everything by default; the account can narrow it later.
          acceptedCategories: ["prepared", "produce", "bakery", "packaged", "dairy", "beverages"],
        },
      });
      dropOffId = dropOff.id;
    }
    await tx.user.update({
      where: { id: userId },
      data: { status: "active", restaurantId, dropOffId, pendingOrg: Prisma.DbNull },
    });
    await tx.adminEvent.create({
      data: {
        type: "account_approved",
        actorId: session!.user!.id,
        targetId: userId,
        meta: { kind: pending.kind, name: pending.name },
      },
    });
  });

  revalidatePath("/admin/users");
  revalidatePath("/");
  revalidatePath("/map");
  revalidatePath("/dropoff");
  revalidatePath("/restaurant");
  return { ok: true };
}

/**
 * Decline a pending account: delete it (no org row was ever created, so there's
 * nothing else to clean up). Org-admin only; only pending accounts can be
 * declined, so an active member can never be removed through this path.
 */
export async function declineAccount(userId: string): Promise<SignUpResult> {
  const session = await auth();
  if (!isAdmin(session?.user?.role)) {
    return { ok: false, error: "Only org admins can decline accounts." };
  }
  const demoDecline = await blockIfDemo();
  if (demoDecline) return demoDecline;
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return { ok: false, error: "Account not found." };
  if (target.status !== "pending") {
    return { ok: false, error: "Only pending accounts can be declined." };
  }
  await prisma.user.delete({ where: { id: userId } });
  revalidatePath("/admin/users");
  return { ok: true };
}

/**
 * Soft-delete an active account (any role). Marks it `deleted` so it can no
 * longer sign in (auth gates on status === "active") and drops off the roster,
 * while its pickups, messages, and the audit trail stay intact — rescue history
 * and impact stats survive. The venue (Restaurant/DropOff) is left untouched;
 * only the login account is removed. Org-admin only. You can't delete your own
 * account or the last org admin, so the org can never lock itself out. Pending
 * accounts go through Decline instead. Idempotent on already-deleted accounts.
 */
export async function deleteAccount(userId: string): Promise<SignUpResult> {
  const session = await auth();
  const actorRole = session?.user?.role;
  if (!isAdmin(actorRole)) {
    return { ok: false, error: "Only org admins can delete accounts." };
  }
  const demoDelete = await blockIfDemo();
  if (demoDelete) return demoDelete;

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return { ok: false, error: "Account not found." };

  const actor = await prisma.user.findUnique({
    where: { id: session!.user!.id },
    select: { organizationId: true },
  });
  const [orgAdminCount, superAdminCount] = await Promise.all([
    prisma.user.count({
      where: { role: "org_admin", status: "active", organizationId: target.organizationId },
    }),
    prisma.user.count({ where: { role: "super_admin", status: "active" } }),
  ]);

  const error = deleteAccountError({
    actorRole: actorRole!,
    actorId: session!.user!.id,
    actorOrgId: actor?.organizationId ?? null,
    target: {
      id: target.id,
      role: target.role,
      status: target.status,
      organizationId: target.organizationId,
    },
    orgAdminCount,
    superAdminCount,
  });
  if (error) return { ok: false, error };
  if (target.status === "deleted") return { ok: true };

  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { status: "deleted" } }),
    prisma.adminEvent.create({
      data: {
        type: "account_deleted",
        actorId: session!.user!.id,
        targetId: userId,
        meta: { role: target.role, name: target.name },
      },
    }),
  ]);
  revalidatePath("/admin/users");
  return { ok: true };
}

const ANN_TITLE_MAX = 120;
const ANN_BODY_MAX = 2000;

// Org-admin only: fan a chapter-wide update out to every active volunteer in
// the admin's current world. /admin is org-admin-gated at the route level, but
// server actions aren't route-scoped, so the role is checked here too.
export async function sendAnnouncementAction(
  title: string,
  body: string,
  audienceInput: unknown
): Promise<{ ok: true; recipientCount: number } | { ok: false; error: string }> {
  const session = await auth();
  if (session?.user?.role !== "org_admin" || !session.user.id) {
    return { ok: false, error: "Only org admins can send updates." };
  }
  const t = title.trim();
  const b = body.trim();
  if (!t || !b) return { ok: false, error: "Add a title and a message." };
  if (t.length > ANN_TITLE_MAX)
    return { ok: false, error: `Title is too long (max ${ANN_TITLE_MAX}).` };
  if (b.length > ANN_BODY_MAX)
    return { ok: false, error: `Message is too long (max ${ANN_BODY_MAX}).` };

  // An org admin only ever reaches their own organization's volunteers.
  const actor = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { organizationId: true },
  });
  if (!actor?.organizationId) {
    return { ok: false, error: "Your account isn't linked to an organization." };
  }

  // The audience arrives from the client — validate it, never trust it.
  const audience = cleanAudience(audienceInput);
  if (!audience) return { ok: false, error: "Pick a valid group to send to." };

  const world = await getDataMode();

  // Never send into the void: a group with nobody in it would create an
  // announcement no one hears.
  if ((await countAudience(audience, world, { organizationId: actor.organizationId })) === 0) {
    return { ok: false, error: "No volunteers match this group right now." };
  }

  const { recipientCount } = await sendAnnouncement({
    authorId: session.user.id,
    title: t,
    body: b,
    world,
    audience,
    organizationId: actor.organizationId,
  });
  revalidatePath("/admin/updates");
  return { ok: true, recipientCount };
}

// Powers the composer's live "this will reach N volunteers" line AND the
// confirm-step sentence, so both show the group's actual label (e.g.
// "Volunteers who could use encouragement"), not the raw pill kind. Returns a
// COUNT only — never names, never individual percentages (reliability is a
// support signal here, never a grade).
export async function countAudienceAction(
  audienceInput: unknown
): Promise<
  { ok: true; count: number; label: string } | { ok: false; error: string }
> {
  const session = await auth();
  if (session?.user?.role !== "org_admin" || !session.user.id) {
    return { ok: false, error: "Only org admins can preview a group." };
  }
  const audience = cleanAudience(audienceInput);
  if (!audience) return { ok: false, error: "Pick a valid group." };
  // Scope the preview to the admin's org so the reach line matches the send.
  const actor = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { organizationId: true },
  });
  if (!actor?.organizationId) {
    return { ok: false, error: "Your account isn't linked to an organization." };
  }
  const world = await getDataMode();
  const { ids, label } = await resolveAudience(audience, world, {
    organizationId: actor.organizationId,
  });
  return { ok: true, count: ids.length, label };
}

// Clears a volunteer's "new updates" badge once they open the inbox.
export async function markUpdatesSeen(): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) return;
  await markSeen(session.user.id);
}
