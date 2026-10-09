import { AuthShell } from "@/components/AuthShell";
import { SignupForm } from "@/components/SignupForm";
import { prisma } from "@/lib/prisma";

// The org list is read per request so a chapter added today shows up in the
// sign-up picker without a redeploy.
export const dynamic = "force-dynamic";

export default async function SignupPage() {
  // The default org is the fallback bucket for volunteers whose email domain
  // matches nothing (lib/org.defaultOrg) — it isn't a chapter anyone joins on
  // purpose, and it's literally named "None", so it stays out of the picker.
  // "Not affiliated" is the empty option there instead.
  const orgs = await prisma.organization.findMany({
    where: { isDefault: false },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return (
    <AuthShell>
      <SignupForm orgs={orgs} />
    </AuthShell>
  );
}
