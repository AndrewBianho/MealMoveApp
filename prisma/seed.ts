// First-run dev seed: wipes the whole database, then builds the curated demo
// world. Safe to re-run (dev only). For a non-destructive reset of just the
// demo data — leaving real listings/locations intact — use prisma/reset-demo.ts.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
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

  // Local dev bootstrap: seed a REAL (non-demo) master admin so local login can
  // exercise super_admin. Kept out of seedDemo — that helper's contract is
  // "demo = true everywhere" — so this stays a plain, non-demo account
  // (demo/dataMode default to false/"real"). Upserted like the demo accounts
  // above, but the wipe above always empties users first, so this is really a
  // create on every reseed; the upsert just makes reruns without a wipe safe
  // too. Same hashing convention (bcrypt, cost 10) as seedDemo's passwordHash,
  // computed here since that variable isn't exported/in scope for this file.
  //
  // Identity and password come from the environment, never from source: this
  // repo is public, so a hardcoded pair would publish both who holds global
  // super_admin powers and the password the seed hands it. Unset either var and
  // the bootstrap is simply skipped.
  const masterAdminEmail = process.env.SUPER_ADMIN_EMAIL;
  const masterAdminPassword = process.env.SUPER_ADMIN_PASSWORD;
  if (masterAdminEmail && masterAdminPassword) {
    const masterAdminHash = await bcrypt.hash(masterAdminPassword, 10);
    await prisma.user.upsert({
      where: { email: masterAdminEmail },
      update: { role: "super_admin" },
      create: {
        name: "Master admin",
        email: masterAdminEmail,
        role: "super_admin",
        passwordHash: masterAdminHash,
      },
    });
    console.log(`Seeded local master admin: ${masterAdminEmail} (super_admin)`);
  } else {
    console.log(
      "Skipped master admin: set SUPER_ADMIN_EMAIL + SUPER_ADMIN_PASSWORD in .env to seed one.",
    );
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
