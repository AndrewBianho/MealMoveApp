import type { Role } from "@prisma/client";
import { prisma } from "./prisma";

// A structural slice of the Prisma client — just the message delegate these
// functions touch. Lets tests inject a fake db without standing up a database.
type Db = Pick<typeof prisma, "message">;

const MAX_BODY = 2000;
// taken_home stays active: the volunteer and drop-off still coordinate the
// next-day delivery.
const ACTIVE_STATUSES = ["claimed", "in_transit", "taken_home"];

/** The fields of the acting user that decide chat access. */
export interface ChatUser {
  id: string;
  role: Role;
  restaurantId: string | null;
}

/** The fields of a listing's claim that decide chat access. */
export interface ChatListing {
  id: string;
  restaurantId: string;
  dropOffId: string | null;
  status: string;
  pickup: { volunteerId: string; buddyId: string | null } | null;
}

/**
 * Who may take part in a claim's coordination thread:
 *   - the claim's volunteer,
 *   - a member of the listing's restaurant,
 *   - a drop-off admin, when the listing has a drop-off assigned,
 *   - any org admin.
 *
 * NOTE: the schema doesn't link a drop_off_admin to a specific DropOff, so any
 * drop-off admin can access a claim that has a drop-off assigned. This mirrors
 * the /dropoff page, which already shows all drop-offs to any drop-off admin.
 */
export function canAccessChat(user: ChatUser, listing: ChatListing): boolean {
  switch (user.role) {
    case "org_admin":
      return true;
    case "volunteer":
      // Either seat on the claim — the primary volunteer or the buddy.
      return (
        listing.pickup?.volunteerId === user.id ||
        listing.pickup?.buddyId === user.id
      );
    case "restaurant":
      return (
        user.restaurantId != null && user.restaurantId === listing.restaurantId
      );
    case "drop_off_admin":
      return listing.dropOffId != null;
    default:
      return false;
  }
}

/** Chat is open only while the claim is active; otherwise it's read-only. */
export function isChatActive(listing: Pick<ChatListing, "status">): boolean {
  return ACTIVE_STATUSES.includes(listing.status);
}

/** Messages for a thread, oldest first. `sinceIso` enables incremental polling. */
export function listMessages(db: Db, listingId: string, sinceIso?: string) {
  // Validate the cursor: a malformed `since` would otherwise become an Invalid
  // Date and make Prisma throw (a client-triggerable 500). Use `gte` (not `gt`)
  // so a message written in the same millisecond as the cursor isn't skipped —
  // callers de-duplicate by id, so re-seeing the boundary row is harmless.
  const since = sinceIso ? new Date(sinceIso) : null;
  const validSince = since && !Number.isNaN(since.getTime()) ? since : null;
  return db.message.findMany({
    where: {
      listingId,
      ...(validSince ? { createdAt: { gte: validSince } } : {}),
    },
    orderBy: { createdAt: "asc" },
    include: { sender: { select: { id: true, name: true, role: true } } },
  });
}

/** Post a message — validates participation and that the claim is still active. */
export async function postMessage(
  db: Db,
  user: ChatUser,
  listing: ChatListing,
  body: string
) {
  if (!canAccessChat(user, listing)) {
    throw new Error("You're not part of this conversation.");
  }
  if (!isChatActive(listing)) {
    throw new Error("This conversation is closed.");
  }
  const text = body?.trim();
  if (!text) throw new Error("Message can't be empty.");
  return db.message.create({
    data: {
      listingId: listing.id,
      senderId: user.id,
      body: text.slice(0, MAX_BODY),
    },
  });
}
