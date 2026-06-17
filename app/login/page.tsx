import Link from "next/link";
import { LoginForm } from "@/components/LoginForm";

const DEMO = [
  { role: "Volunteer", email: "you@campus.edu" },
  { role: "Restaurant", email: "saxbys@campus.edu" },
  { role: "Drop-off admin", email: "dropoff@campus.edu" },
  { role: "Org admin", email: "admin@campus.edu" },
];

export default function LoginPage() {
  return (
    <main className="mx-auto max-w-sm px-6 py-16">
      <h1 className="text-[40px] font-semibold leading-[1.1] tracking-tight text-balance">Sign in</h1>
      <p className="mb-6 mt-1 text-sm text-neutral-700">
        Sign in to claim pickups and track your rescues.
      </p>

      <LoginForm />

      <p className="mt-6 text-sm text-neutral-700">
        New here?{" "}
        <Link href="/signup" className="font-medium text-rescued-600 hover:underline">
          Create an account
        </Link>
      </p>

      <div className="mt-8 rounded-md bg-neutral-50 p-4">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-wide text-neutral-700">
          demo accounts · password: password
        </p>
        <ul className="space-y-1">
          {DEMO.map((d) => (
            <li
              key={d.email}
              className="flex justify-between font-mono text-xs text-neutral-700"
            >
              <span>{d.role}</span>
              <span>{d.email}</span>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
