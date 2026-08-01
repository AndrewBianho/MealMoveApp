// First-run dev seed: wipes the whole database, then builds the curated demo
// world. Safe to re-run (dev only). For a non-destructive reset of just the
// demo data — leaving real listings/locations intact — use prisma/reset-demo.ts.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { seedDemo } from "./seedDemo";

const prisma = new PrismaClient();

// This script's first act is to empty every table, and `.env` normally points
// DATABASE_URL at the *production* Supabase pooler — so a stray `npm run
// db:seed` would wipe the live database. Refuse unless the target host is
// local, or the caller has said out loud that it meant a remote one.
function assertSafeTarget() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");

  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error("DATABASE_URL is not a parseable URL.");
  }

  const isLocal =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host.endsWith(".local");

  if (isLocal || process.env.ALLOW_DESTRUCTIVE_SEED === "yes") return;

  throw new Error(
    `Refusing to wipe a non-local database.\n\n` +
      `  DATABASE_URL host: ${host}\n\n` +
      `This script deletes every row in every table. If that is genuinely what\n` +
      `you want against this host, re-run with:\n\n` +
      `  ALLOW_DESTRUCTIVE_SEED=yes npm run db:seed\n\n` +
      `For a non-destructive refresh of just the demo data, use:\n` +
      `  npm run db:demo:reset\n`,
  );
}

async function main() {
  assertSafeTarget();

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
