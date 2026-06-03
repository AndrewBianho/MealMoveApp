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
      <h1 className="text-[32px] font-medium leading-tight">Sign in</h1>
      <p className="mb-6 mt-1 text-sm text-neutral-600">
        Welcome back to Meal Move.
      </p>

      <LoginForm />

      <div className="mt-8 rounded-md bg-neutral-50 p-4">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-wide text-neutral-600">
          demo accounts · password: password
        </p>
        <ul className="space-y-1">
          {DEMO.map((d) => (
            <li
              key={d.email}
              className="flex justify-between font-mono text-xs text-neutral-600"
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
