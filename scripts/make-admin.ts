// Bootstrap / break-glass tool to set a user's role from the command line.
// Run by whoever owns the deploy — this is how the FIRST org_admin is created
// (and a recovery path if the panel ever locks everyone out).
//
//   npm run make-admin <email> [role]
//
// role defaults to org_admin; valid: volunteer | restaurant | drop_off | org_admin
import { PrismaClient, type Role } from "@prisma/client";

const prisma = new PrismaClient();
const VALID: Role[] = ["volunteer", "restaurant", "drop_off", "org_admin"];

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  const role = (process.argv[3]?.trim() ?? "org_admin") as Role;

  if (!email) {
    console.error("Usage: npm run make-admin <email> [role]");
    process.exit(1);
  }
  if (!VALID.includes(role)) {
    console.error(`Invalid role "${role}". Valid: ${VALID.join(", ")}`);
    process.exit(1);
  }

  const user = await prisma.user
    .update({ where: { email }, data: { role } })
    .catch(() => null);

  if (!user) {
    console.error(`No user found with email "${email}". They must sign up first.`);
    process.exit(1);
  }
  console.log(`✓ ${user.name} <${user.email}> is now ${user.role}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
