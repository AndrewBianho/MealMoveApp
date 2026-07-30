// Idempotently promote an account to super_admin (master admin). Usage:
//   node --env-file=.env --import tsx scripts/promote-super-admin.ts [email]
// Falls back to SUPER_ADMIN_EMAIL when no argument is given (kept out of source
// so this public repo never names who holds global powers). No-op if the account
// doesn't exist or is already super_admin.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2] ?? process.env.SUPER_ADMIN_EMAIL;
  if (!email) {
    console.log(
      "No email given. Pass one as an argument, or set SUPER_ADMIN_EMAIL in .env.",
    );
    return;
  }
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.log(`No account for ${email} — nothing to promote.`);
    return;
  }
  if (user.role === "super_admin") {
    console.log(`${email} is already a master admin.`);
    return;
  }
  await prisma.user.update({
    where: { email },
    data: { role: "super_admin" },
  });
  console.log(`Promoted ${email} to master admin (super_admin).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
