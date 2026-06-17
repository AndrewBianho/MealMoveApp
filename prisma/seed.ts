// First-run dev seed: wipes the whole database, then builds the curated demo
// world. Safe to re-run (dev only). For a non-destructive reset of just the
// demo data — leaving real listings/locations intact — use prisma/reset-demo.ts.
import { PrismaClient } from "@prisma/client";
import { seedDemo } from "./seedDemo";

const prisma = new PrismaClient();

async function main() {
  // Wipe in FK-safe order — children before parents.
  await prisma.message.deleteMany();
  await prisma.buddyInvite.deleteMany();
  await prisma.listingEvent.deleteMany();
  await prisma.adminEvent.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.pickup.deleteMany();
  await prisma.foodListing.deleteMany();
  await prisma.recurringPost.deleteMany();
  await prisma.dropOffNotice.deleteMany();
  await prisma.dropOff.deleteMany();
  await prisma.user.deleteMany();
  await prisma.restaurant.deleteMany();

  const counts = await seedDemo(prisma);
  console.log("Seed complete:", counts);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
