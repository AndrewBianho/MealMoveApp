import Link from "next/link";
import { redirect } from "next/navigation";
import { ProfileForm } from "@/components/ProfileForm";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

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
    },
  });
  if (!user) redirect("/login");

  // This editable identity page is the volunteer's. Restaurant / drop-off /
  // org-admin accounts speak for a venue or the chapter, not a personal
  // profile, so their avatar keeps landing on the merged account+impact page.
  if (user.role !== "volunteer") redirect("/impact");

  return (
    <main className="mx-auto max-w-xl px-6 py-8">
      <header className="mb-6">
        <h1 className="font-display text-[34px] font-semibold leading-[1.1] tracking-tight text-balance">
          Your profile
        </h1>
        <p className="mt-1 text-[16px] text-neutral-700">
          How you show up on Meal Move — restaurants and drop-offs see your name
          during a rescue.
        </p>
      </header>

      <section className="rounded-2xl border border-neutral-900/5 bg-card p-6 shadow-card">
        <ProfileForm
          initial={{
            name: user.name,
            email: user.email,
            phone: user.phone ?? "",
            imageUrl: user.imageUrl,
          }}
        />
      </section>

      <p className="mt-4 text-[14px] text-neutral-700">
        Looking for your rescues and impact?{" "}
        <Link
          href="/impact"
          className="font-semibold text-clay-800 underline-offset-2 hover:underline"
        >
          See your impact
        </Link>
        .
      </p>
    </main>
  );
}
