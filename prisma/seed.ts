// Seeds the database from lib/mock.ts so the shapes line up exactly with what
// the frontend already renders. Safe to re-run — it wipes first (dev only).
import { PrismaClient, type ListingStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import { LISTINGS, RESTAURANT } from "../lib/mock";

const prisma = new PrismaClient();

// "in transit" (UI) → "in_transit" (Postgres enum).
function toEnum(status: string): ListingStatus {
  return status.replace(/ /g, "_") as ListingStatus;
}

const jitter = () => (Math.random() - 0.5) * 0.02;

async function main() {
  // Wipe in FK-safe order.
  await prisma.listingEvent.deleteMany();
  await prisma.pickup.deleteMany();
  await prisma.foodListing.deleteMany();
  await prisma.dropOff.deleteMany();
  await prisma.user.deleteMany();
  await prisma.restaurant.deleteMany();

  // All demo accounts share the password "password".
  const passwordHash = await bcrypt.hash("password", 10);

  // Restaurants, derived from unique listing sources.
  const restaurantId = new Map<string, string>();
  for (const name of Array.from(new Set(LISTINGS.map((l) => l.source)))) {
    const r = await prisma.restaurant.create({
      data: { name, address: "Campus", lat: 40.04 + jitter(), lng: -75.34 + jitter() },
    });
    restaurantId.set(name, r.id);
  }

  // Drop-off locations.
  const dropOffId = new Map<string, string>();
  const dropNames = LISTINGS.map((l) => l.dropOff).filter(Boolean) as string[];
  for (const name of Array.from(new Set(dropNames))) {
    const d = await prisma.dropOff.create({
      data: { name, address: "Campus", lat: 40.04 + jitter(), lng: -75.34 + jitter() },
    });
    dropOffId.set(name, d.id);
  }

  // Volunteers (everyone who has claimed something, plus "You").
  const volunteerId = new Map<string, string>();
  const names = Array.from(
    new Set<string>(["You", ...(LISTINGS.map((l) => l.claimedBy).filter(Boolean) as string[])])
  );
  for (const name of names) {
    const email = `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@campus.edu`;
    const u = await prisma.user.create({
      data: { name, email, role: "volunteer", passwordHash },
    });
    volunteerId.set(name, u.id);
  }

  // Cross-role demo accounts (all password: "password").
  await prisma.user.upsert({
    where: { email: "saxbys@campus.edu" },
    update: { passwordHash, role: "restaurant", restaurantId: restaurantId.get(RESTAURANT) },
    create: {
      name: "Saxbys manager",
      email: "saxbys@campus.edu",
      role: "restaurant",
      passwordHash,
      restaurantId: restaurantId.get(RESTAURANT),
    },
  });
  await prisma.user.upsert({
    where: { email: "dropoff@campus.edu" },
    update: { passwordHash, role: "drop_off_admin" },
    create: {
      name: "Drop-off admin",
      email: "dropoff@campus.edu",
      role: "drop_off_admin",
      passwordHash,
    },
  });
  await prisma.user.upsert({
    where: { email: "admin@campus.edu" },
    update: { passwordHash, role: "org_admin" },
    create: { name: "Org admin", email: "admin@campus.edu", role: "org_admin", passwordHash },
  });

  // Listings + their pickups + event trail.
  for (const l of LISTINGS) {
    const status = toEnum(l.status);
    const expiresAt = new Date(Date.now() + (l.minutesLeft > 0 ? l.minutesLeft : -30) * 60_000);

    const listing = await prisma.foodListing.create({
      data: {
        title: l.title,
        servings: l.servings,
        status,
        restaurantId: restaurantId.get(l.source)!,
        dropOffId: l.dropOff ? dropOffId.get(l.dropOff)! : null,
        expiresAt,
        events: { create: { type: "posted" } },
      },
    });

    if (l.claimedBy) {
      const actorId = volunteerId.get(l.claimedBy)!;
      await prisma.pickup.create({
        data: {
          listingId: listing.id,
          volunteerId: actorId,
          holdUntil: new Date(Date.now() + 15 * 60_000),
          deliveredAt: status === "delivered" ? new Date() : null,
        },
      });
      await prisma.listingEvent.create({ data: { listingId: listing.id, type: "claimed", actorId } });
      if (status === "delivered" || status === "failed") {
        await prisma.listingEvent.create({ data: { listingId: listing.id, type: status, actorId } });
      }
    }
  }

  const counts = {
    restaurants: restaurantId.size,
    dropOffs: dropOffId.size,
    volunteers: volunteerId.size,
    listings: LISTINGS.length,
  };
  console.log("Seed complete:", counts);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
