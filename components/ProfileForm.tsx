"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AvatarUploadField } from "./AvatarUploadField";
import { Button } from "./Button";
import { inputCls, labelCls, errorBannerCls } from "./authStyles";
import { updateProfile } from "@/app/actions";
import { CHAPTER_NAME } from "@/lib/org";

// Format 10 stored digits back into (123) 456-7890 for a friendlier field.
function prettyPhone(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 10);
  if (d.length < 4) return d;
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

export function ProfileForm({
  demo = false,
  initial,
  organizationName,
}: {
  /** Demo logins are shared, so their seeded identity is not editable. */
  demo?: boolean;
  initial: {
    name: string;
    email: string;
    phone: string;
    imageUrl: string | null;
  };
  organizationName?: string | null;
}) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [phone, setPhone] = useState(prettyPhone(initial.phone));
  const [imageUrl, setImageUrl] = useState<string | null>(initial.imageUrl);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    const res = await updateProfile({ name, phone, imageUrl });
    setSaving(false);
    if (res.ok) {
      setSaved(true);
      router.refresh(); // pull the new photo/name into the nav avatar
    } else {
      setError(res.error);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {error && (
        <p className={errorBannerCls} role="alert">
          {error}
        </p>
      )}

      <div>
        <span className={labelCls}>Profile photo</span>
        <AvatarUploadField
          value={imageUrl}
          name={name || initial.name}
          disabled={demo}
          onChange={(url) => {
            setImageUrl(url);
            setSaved(false);
          }}
        />
        {demo && (
          <p className="mt-1.5 text-[14px] text-neutral-700">
            Demo accounts keep their sample photo.
          </p>
        )}
      </div>

      <div>
        <label htmlFor="profile-name" className={labelCls}>
          Full name
        </label>
        <input
          id="profile-name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setSaved(false);
          }}
          readOnly={demo}
          aria-describedby={demo ? "profile-name-note" : undefined}
          autoComplete="name"
          className={
            demo ? `${inputCls} cursor-not-allowed bg-neutral-100 text-neutral-700` : inputCls
          }
        />
        {demo && (
          <p id="profile-name-note" className="mt-1.5 text-[14px] text-neutral-700">
            Demo logins are shared, so this name stays as seeded.
          </p>
        )}
      </div>

      <div>
        <label htmlFor="profile-email" className={labelCls}>
          Email
        </label>
        <input
          id="profile-email"
          value={initial.email}
          readOnly
          aria-describedby="profile-email-note"
          className={`${inputCls} cursor-not-allowed bg-neutral-100 text-neutral-700`}
        />
        <p id="profile-email-note" className="mt-1.5 text-[14px] text-neutral-700">
          Your email is how you sign in — reach an org admin to change it.
        </p>
      </div>

      <div>
        <label htmlFor="profile-phone" className={labelCls}>
          Phone number
        </label>
        <input
          id="profile-phone"
          value={phone}
          onChange={(e) => {
            setPhone(prettyPhone(e.target.value));
            setSaved(false);
          }}
          inputMode="tel"
          autoComplete="tel"
          placeholder="(555) 123-4567"
          className={inputCls}
        />
        <p className="mt-1.5 text-[14px] text-neutral-700">
          Used to coordinate a pickup. Never shown to admins.
        </p>
      </div>

      <div>
        <span className={labelCls}>Organization</span>
        <div className={`${inputCls} flex items-center bg-neutral-100 text-neutral-700`}>
          {organizationName ?? CHAPTER_NAME}
        </div>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
        {saved && (
          <span className="font-mono text-[13px] text-rescued-800" role="status">
            Saved
          </span>
        )}
      </div>
    </form>
  );
}
