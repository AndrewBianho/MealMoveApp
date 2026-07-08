import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getDataMode } from "@/lib/mode";
import { NavBar } from "./NavBar";
import { WelcomeIntro } from "./WelcomeIntro";

export async function Header() {
  const session = await auth();
  const user = session?.user;
  const demo = user ? (await getDataMode()) === "demo" : false;

  // The first-run welcome is gated on account age, so fetch when the account was
  // created (indexed PK lookup). 0 = unknown → the intro simply won't auto-open.
  let createdAt = 0;
  if (user) {
    const row = await prisma.user.findUnique({
      where: { id: user.id },
      select: { createdAt: true },
    });
    createdAt = row?.createdAt.getTime() ?? 0;
  }

  return (
    <>
      <header className="sticky top-0 z-sticky border-b border-neutral-200/50 bg-neutral-50/80 backdrop-blur-md">
        {/* min-h + wrap (not a fixed h-16): roles with many nav items (org
            admin) overflow a single 768–1024px row; wrapping onto a second
            row beats horizontal page scroll. One-row roles render identically. */}
        <div className="relative mx-auto flex min-h-16 max-w-[1760px] flex-wrap items-center gap-x-4 gap-y-1 px-6 py-2">
          <Link href="/" className="group flex items-center gap-2.5">
            {/* The mark is a CSS mask filled with theme ink, so it renders crisp
                in both Arctic (dark ink) and Forest (light ink) with no square. */}
            <span
              aria-hidden
              className="h-8 w-8 bg-neutral-900 transition duration-200 group-hover:-translate-y-0.5 [mask:url(/mealmovelogo.png)_center/contain_no-repeat] [-webkit-mask:url(/mealmovelogo.png)_center/contain_no-repeat]"
            />
            <span className="font-display text-xl font-semibold tracking-tight">
              Meal Move
            </span>
          </Link>

          {demo && (
            // Calm, neutral cue (never a status hue) so it's clear the data on
            // screen is the sample world, not the chapter's live listings.
            <Link
              href="/settings"
              title="You're viewing demo data — change in Settings"
              className="rounded-full border border-neutral-200 bg-neutral-100 px-2.5 py-1.5 font-mono text-[10px] text-neutral-700 transition-colors hover:text-neutral-900"
            >
              demo data
            </Link>
          )}

          {user && <NavBar role={user.role} name={user.name ?? "?"} />}
        </div>
      </header>

      {user && (
        <WelcomeIntro
          role={user.role}
          name={user.name ?? "?"}
          createdAt={createdAt}
        />
      )}
    </>
  );
}
