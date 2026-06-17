// Resets only the curated DEMO world: deletes every demo-flagged row (and the
// pickups/events/messages hanging off demo listings), then rebuilds it from
// lib/mock.ts. Real listings, locations, and accounts are left untouched — so
// this is safe to run after someone has been clicking around in demo mode.
//
// Run: npm run db:demo:reset
import { PrismaClient } from "@prisma/client";
import { resetDemoWorld } from "./seedDemo";

const prisma = new PrismaClient();

async function main() {
  const counts = await resetDemoWorld(prisma);
  console.log("Demo world reset:", counts);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
