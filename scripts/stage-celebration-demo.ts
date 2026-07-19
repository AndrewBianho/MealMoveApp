// Stage a demo: the demo volunteer (you@campus.edu, "Robin Alvarez") has an
// in-transit listing ready to be marked delivered, so the RescueCelebration can
// be seen live.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const volunteer = await prisma.user.findUnique({ where: { email: "you@campus.edu" } });
  if (!volunteer) throw new Error("Volunteer you@campus.edu not found — run the seed first.");

  const restaurant = await prisma.restaurant.findFirst();
  const dropOff = await prisma.dropOff.findFirst();
  if (!restaurant || !dropOff) throw new Error("No restaurant/drop-off rows — run the seed first.");

  const listing = await prisma.foodListing.create({
    data: {
      title: "Demo: trays of veggie lasagna",
      servings: 12,
      category: "prepared",
      perishable: true,
      status: "in_transit",
      restaurantId: restaurant.id,
      dropOffId: dropOff.id,
      expiresAt: new Date(Date.now() + 45 * 60_000),
      events: {
        create: [
          { type: "posted" },
          { type: "claimed", actorId: volunteer.id },
          { type: "in_transit", actorId: volunteer.id },
        ],
      },
    },
  });

  await prisma.pickup.create({
    data: {
      listingId: listing.id,
      volunteerId: volunteer.id,
      holdUntil: new Date(Date.now() + 15 * 60_000),
      photoAtPickupUrl: "/food-wraps.jpg",
    },
  });

  console.log(`LISTING_URL=http://localhost:3000/listings/${listing.id}`);
}

main().finally(() => prisma.$disconnect());
