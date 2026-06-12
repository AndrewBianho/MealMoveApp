import { ThemeToggle } from "@/components/ThemeToggle";

export const metadata = { title: "Settings · Meal Move" };

export default function SettingsPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-[32px] font-medium leading-tight">Settings</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Make Meal Move look the way you like.
        </p>
      </header>

      <section className="rounded-2xl border border-neutral-900/5 bg-card p-5 shadow-card">
        <h2 className="text-lg font-medium">Appearance</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Light is Arctic Blue; dark is Deep Forest. System follows your device.
        </p>
        <div className="mt-4">
          <ThemeToggle />
        </div>
      </section>
    </main>
  );
}
