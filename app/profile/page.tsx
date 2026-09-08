import Link from "next/link";
import { redirect } from "next/navigation";
import { ProfileForm } from "@/components/ProfileForm";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { capitalize } from "@/lib/text";

export const metadata = { title: "Profile · Meal Move" };

export const dynamic = "force-dynamic";

// The account's editable identity — photo, name, email, phone, address, and the
// chapter it belongs to. The avatar in the nav links here. Impact/stats live on
// their own page (/impact); this surface is just who you are.
export default async function ProfilePage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      name: true,
      email: true,
      phone: true,
      imageUrl: true,
      role: true,
      demo: true,
      organization: { select: { name: true } },
    },
  });
  if (!user) redirect("/login");

  // Editable identity for every account type — name, photo, and contact
  // details. The role-specific numbers live on /impact; this surface is just
  // who you are.
  return (
    <main className="mx-auto max-w-form px-6 py-8">
      <header className="mb-6 max-w-[52ch]">
        <h1 className="font-display text-[34px] font-semibold leading-[1.1] tracking-tight text-balance">
          Your profile
        </h1>
        <p className="mt-1 text-[16px] text-neutral-700">
          How you show up on Meal Move — your name and photo appear to the
          people you coordinate a rescue with.
        </p>
      </header>

      {/* The form keeps a single-column measure (stretched inputs are harder to
          scan, not easier); past lg the extra width goes to a rail beside it
          rather than to symmetric dead margin. */}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <section className="rounded-2xl border border-neutral-900/5 bg-card p-6 shadow-card">
          <ProfileForm
            demo={user.demo}
            initial={{
              name: user.name,
              email: user.email,
              phone: user.phone ?? "",
              imageUrl: user.imageUrl,
            }}
            organizationName={user.organization?.name ?? null}
          />
        </section>

        {/* A plain rail, not a second card: a short aside beside a tall form
            reads as a margin note this way, and as an undersized card if it
            carries the same chrome. Nested cards are never right either. */}
        <aside className="lg:pt-1">
          <h2 className="font-mono text-[13px] text-neutral-700">Account</h2>
          <p className="mt-2 font-mono text-[13px] text-neutral-800">
            {capitalize(user.role.replace(/_/g, " "))}
          </p>

          <h2 className="mt-7 font-mono text-[13px] text-neutral-700">
            Elsewhere
          </h2>
          <p className="mt-2 text-[15px] text-neutral-800">
            Your rescues, reliability, and the chapter&apos;s numbers live on
            their own page.
          </p>
          <Link
            href="/impact"
            className="mt-2 inline-block text-[15px] font-semibold text-clay-800 underline-offset-2 hover:underline"
          >
            See your impact
          </Link>
        </aside>
      </div>
    </main>
  );
}
