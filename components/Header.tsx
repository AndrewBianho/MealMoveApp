import Image from "next/image";
import Link from "next/link";
import { auth } from "@/auth";
import { NavBar } from "./NavBar";

export async function Header() {
  const session = await auth();
  const user = session?.user;

  return (
    <header className="sticky top-0 z-10 border-b border-neutral-200/50 bg-neutral-50/80 backdrop-blur-md">
      <div className="relative mx-auto flex h-16 max-w-5xl items-center gap-4 px-6">
        <Link href="/" className="group flex items-center gap-2.5">
          <Image
            src="/mealmovelogo.jpg"
            alt="Meal Move logo"
            width={32}
            height={32}
            priority
            className="h-8 w-8 rounded-lg bg-white object-contain shadow-card ring-1 ring-neutral-200/70 transition duration-200 group-hover:-translate-y-0.5 group-hover:shadow-lift"
          />
          <span className="font-display text-xl font-semibold tracking-tight">
            Meal Move
          </span>
        </Link>

        {user && <NavBar role={user.role} name={user.name ?? "?"} />}
      </div>
    </header>
  );
}
