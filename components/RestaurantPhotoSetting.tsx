"use client";

import { useTransition } from "react";
import { ImageUploadField } from "./ImageUploadField";
import { Toast, useToast } from "./Toast";
import { setRestaurantImage } from "@/app/actions";

/**
 * The restaurant's default listing photo, on Settings.
 *
 * It used to sit under "Post surplus" beside the posting call-to-action, which
 * put a set-once account detail in the middle of the one flow a restaurant runs
 * every shift. It belongs with the other account-level settings; posting keeps
 * the page it needs.
 */
export function RestaurantPhotoSetting({
  restaurantId,
  imageUrl,
}: {
  restaurantId: string;
  imageUrl?: string | null;
}) {
  const { message, show } = useToast();
  const [isPending, startTransition] = useTransition();

  function save(url: string | null) {
    startTransition(async () => {
      const res = await setRestaurantImage(restaurantId, url);
      show(
        res.ok
          ? url
            ? "Default photo updated."
            : "Default photo removed."
          : res.error
      );
    });
  }

  return (
    <section
      className={`rounded-2xl border border-neutral-900/5 bg-card p-5 shadow-card${
        isPending ? " opacity-70" : ""
      }`}
    >
      <h2 className="text-lg font-medium">Restaurant photo</h2>
      <p className="mt-1 text-sm text-neutral-700">
        Shown on a card when a listing has no food photo of its own.
      </p>
      <div className="mt-4">
        <ImageUploadField
          label="Default photo"
          hint="Take a photo or upload one, JPG/PNG, up to 5 MB."
          value={imageUrl}
          onChange={save}
        />
      </div>
      <Toast message={message} />
    </section>
  );
}
