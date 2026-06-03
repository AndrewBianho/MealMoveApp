import Link from "next/link";
import { auth, signOut } from "@/auth";
import { Nav } from "./Nav";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toLowerCase() ?? "")
    .join("");
}

export async function Header() {
  const session = await auth();
  const user = session?.user;

  return (
    <header className="sticky top-0 z-10 border-b border-neutral-200/40 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-rescued-600 font-mono text-sm text-white">
            m
          </span>
          <span className="text-sm font-medium">Meal Move</span>
        </Link>

        {user && <Nav role={user.role} />}

        {user && (
          <div className="ml-auto flex items-center gap-3">
            <span className="font-mono text-xs uppercase tracking-wide text-neutral-600">
              {user.role.replace(/_/g, " ")}
            </span>
            <span className="grid h-7 w-7 place-items-center rounded-full bg-neutral-100 font-mono text-xs text-neutral-600">
              {initials(user.name ?? "?")}
            </span>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            >
              <button className="text-sm text-neutral-600 transition-colors hover:text-neutral-900">
                Sign out
              </button>
            </form>
          </div>
        )}
      </div>
    </header>
  );
}
