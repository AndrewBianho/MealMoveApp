import Link from "next/link";
import { auth } from "@/auth";
import { NavBar } from "./NavBar";

export async function Header() {
  const session = await auth();
  const user = session?.user;

  return (
    <header className="sticky top-0 z-10 border-b border-neutral-200/40 bg-white/90 backdrop-blur">
      <div className="relative mx-auto flex h-14 max-w-5xl items-center gap-4 px-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-rescued-600 font-mono text-sm text-white">
            m
          </span>
          <span className="text-sm font-medium">Meal Move</span>
        </Link>

        {user && <NavBar role={user.role} name={user.name ?? "?"} />}
      </div>
    </header>
  );
}
