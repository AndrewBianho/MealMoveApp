import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getDataMode } from "@/lib/mode";
import { unseenCount } from "@/lib/announcements";
import { NavBar } from "./NavBar";
import { WelcomeIntro } from "./WelcomeIntro";
import { TourProvider } from "./tour/TourProvider";

export async function Header() {
  const session = await auth();
  const user = session?.user;
  const dataMode = user ? await getDataMode() : "real";
  const demo = dataMode === "demo";
  const updatesUnseen =
    user?.role === "volunteer" ? await unseenCount(user.id, dataMode) : 0;

  // The first-run welcome is gated on account age, so fetch when the account was
  // created (indexed PK lookup). 0 = unknown → the intro simply won't auto-open.
  let createdAt = 0;
  let image: string | null = null;
  // Name is read from the DB (not session.user.name) so a profile rename shows
  // up on the next router.refresh() — the JWT-embedded name stays stale until
  // re-login, but imageUrl is already sourced here, so the avatar's photo and
  // its fallback initials update together.
  let name = user?.name ?? "?";
  if (user) {
    const row = await prisma.user.findUnique({
      where: { id: user.id },
      select: { createdAt: true, imageUrl: true, name: true },
    });
    createdAt = row?.createdAt.getTime() ?? 0;
    image = row?.imageUrl ?? null;
    if (row?.name) name = row.name;
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
            // screen is the sample world, not the chapter's live listings. The
            // flask glyph carries the "sample" meaning by icon + label, so it
            // reads without relying on color.
            <Link
              href="/settings"
              title="You're viewing demo data — change in Settings"
              className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-100 py-1.5 pl-2 pr-2.5 font-mono text-[11px] leading-none text-neutral-700 transition-colors hover:border-neutral-300 hover:bg-neutral-200 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400 focus-visible:ring-offset-1 focus-visible:ring-offset-neutral-50"
            >
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-3 w-3 opacity-70"
              >
                <path d="M9 3h6M10 3v6l-5 8a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-8V3" />
              </svg>
              Demo data
            </Link>
          )}

          {user && (
            <NavBar role={user.role} name={name} image={image} unseen={updatesUnseen} />
          )}
        </div>
      </header>

      {user && (
        <>
          <WelcomeIntro
            role={user.role}
            name={name}
            createdAt={createdAt}
            offerTour={demo && user.role === "volunteer"}
          />
          <TourProvider enabled={demo && user.role === "volunteer"} />
        </>
      )}
    </>
  );
}
