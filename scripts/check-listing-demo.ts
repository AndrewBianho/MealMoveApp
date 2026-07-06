import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const l = await prisma.foodListing.findUnique({
    where: { id: "cmqaazf9k0001v5vfi9zz930p" },
    include: { pickups: { include: { volunteer: true } }, events: true },
  });
  console.log({
    status: l?.status,
    expiresAt: l?.expiresAt,
    now: new Date(),
    volunteers: l?.pickups.map((p) => p.volunteer?.email),
    holdUntil: l?.pickups.map((p) => p.holdUntil),
    events: l?.events.map((e) => e.type),
  });
}
main().finally(() => prisma.$disconnect());
