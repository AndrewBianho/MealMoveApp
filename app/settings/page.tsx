import { DataModeToggle } from "@/components/DataModeToggle";
import { NotificationsToggle } from "@/components/NotificationsToggle";
import { RestaurantPhotoSetting } from "@/components/RestaurantPhotoSetting";
import { getDataMode } from "@/lib/mode";
import { requireUser } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Settings · Meal Move" };

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const viewer = await requireUser();
  const mode = await getDataMode();

  const me = await prisma.user.findUnique({
    where: { id: viewer.id },
    select: {
      notificationsEnabled: true,
      demo: true,
      // The restaurant this account speaks for, so its default listing photo
      // can be set here. Only a `restaurant` account has one; an org admin
      // oversees the chapter rather than any single restaurant, so there'd be
      // no one photo for them to set.
      restaurant: { select: { id: true, imageUrl: true } },
    },
  });
  const restaurant = viewer.role === "restaurant" ? me?.restaurant : null;

  return (
    <main className="mx-auto max-w-form px-6 py-8">
      <header className="mb-6 max-w-[52ch]">
        <h1 className="text-[40px] font-semibold leading-[1.1] tracking-tight text-balance">
          Settings
        </h1>
        <p className="mt-1 text-sm text-neutral-700">
          Make Meal Move look the way you like.
        </p>
      </header>

      {/* Independent settings, so they sit side by side past lg instead of
          stacking down a 672px column with dead space either side. */}
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-neutral-900/5 bg-card p-5 shadow-card">
          <h2 className="text-lg font-medium">Notifications</h2>
          <p className="mt-1 text-sm text-neutral-700">
            Pickup alerts sent to your email/phone.
          </p>
          <div className="mt-4">
            <NotificationsToggle
              initialEnabled={me?.notificationsEnabled ?? false}
            />
          </div>
        </section>

        <section className="rounded-2xl border border-neutral-900/5 bg-card p-5 shadow-card">
          <h2 className="text-lg font-medium">Data</h2>
          {me?.demo ? (
            <>
              <p className="mt-1 text-sm text-neutral-700">
                You&apos;re exploring the demo world, a sample of rescues to
                try things out. Demo accounts stay in the demo world.
              </p>
              <p className="mt-3 inline-flex items-center rounded-full bg-neutral-100 px-4 py-1.5 font-mono text-[13px] text-neutral-700">
                Demo
              </p>
            </>
          ) : (
            <>
              <p className="mt-1 text-sm text-neutral-700">
                Demo shows a sample of rescues so you can explore how everything
                works. Real shows your chapter&apos;s live listings and
                locations. You can claim, post, and deliver in either. They
                stay separate.
              </p>
              <div className="mt-4">
                <DataModeToggle current={mode} />
              </div>
            </>
          )}
        </section>

        {restaurant && (
          <RestaurantPhotoSetting
            restaurantId={restaurant.id}
            imageUrl={restaurant.imageUrl}
          />
        )}
      </div>
    </main>
  );
}
