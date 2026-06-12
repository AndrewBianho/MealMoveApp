import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const l = await prisma.foodListing.findUnique({
    where: { id: "cmqaazf9k0001v5vfi9zz930p" },
    include: { pickup: { include: { volunteer: true } }, events: true },
  });
  console.log({
    status: l?.status,
    expiresAt: l?.expiresAt,
    now: new Date(),
    volunteer: l?.pickup?.volunteer?.email,
    holdUntil: l?.pickup?.holdUntil,
    events: l?.events.map((e) => e.type),
  });
}
main().finally(() => prisma.$disconnect());
