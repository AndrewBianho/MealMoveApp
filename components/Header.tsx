import Link from "next/link";
import { auth } from "@/auth";
import { NavBar } from "./NavBar";

export async function Header() {
  const session = await auth();
  const user = session?.user;

  return (
    <header className="sticky top-0 z-10 border-b border-neutral-200/40 bg-white/90 backdrop-blur">
      <div className="relative mx-auto flex h-14 max-w-5xl items-center gap-4 px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-rescued-600 font-display text-lg font-semibold text-neutral-50 shadow-card">
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
