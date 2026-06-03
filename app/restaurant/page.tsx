import { RestaurantConsole } from "@/components/RestaurantConsole";
import { RESTAURANT } from "@/lib/mock";

export default function RestaurantPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-[32px] font-medium leading-tight">Restaurant console</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Post tonight&apos;s surplus and track who&apos;s picking it up.
        </p>
      </header>

      <RestaurantConsole restaurant={RESTAURANT} />
    </main>
  );
}
