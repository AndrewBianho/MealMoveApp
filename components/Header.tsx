import Link from "next/link";
import { auth } from "@/auth";
import { NavBar } from "./NavBar";

export async function Header() {
  const session = await auth();
  const user = session?.user;

  return (
    <header className="sticky top-0 z-10 border-b border-neutral-200/50 bg-neutral-50/80 backdrop-blur-md">
      <div className="relative mx-auto flex h-16 max-w-5xl items-center gap-4 px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 -rotate-6 place-items-center rounded-[50%_50%_50%_8px] bg-gradient-to-br from-rescued-400 to-rescued-600 font-display text-lg font-semibold text-white shadow-glow">
            m
          </span>
          <span className="font-display text-xl font-semibold tracking-tight">
            Meal Move
          </span>
        </Link>

        {user && <NavBar role={user.role} name={user.name ?? "?"} />}
      </div>
    </header>
  );
}
