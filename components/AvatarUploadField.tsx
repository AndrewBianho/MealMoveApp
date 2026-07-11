"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Avatar } from "./Avatar";
import { Camera, X } from "./icons";
import { cn } from "./cn";

// Compact circular profile-photo picker. Same hosted upload path as listing
// photos (/api/upload → Supabase Storage), downscaled client-side so a phone
// photo lands well under the 5 MB cap. Distinct affordance from the full-width
// ImageUploadField (a small disc, no camera modal), so it stays lean.
async function downscale(source: Blob, max = 512): Promise<Blob> {
  const bitmap = await createImageBitmap(source);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Could not process image."))),
      "image/jpeg",
      0.85
    )
  );
}

export function AvatarUploadField({
  value,
  name,
  onChange,
}: {
  value: string | null;
  /** Fallback initials when there's no photo. */
  name: string;
  onChange: (url: string | null) => void;
}) {
  const [preview, setPreview] = useState<string | null>(value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const small = await downscale(file);
      const form = new FormData();
      form.append("file", small, "avatar.jpg");
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? "Upload failed.");
      setPreview(data.url);
      onChange(data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (file) upload(file);
  }

  function clear() {
    setPreview(null);
    onChange(null);
    setError(null);
  }

  return (
    <div className="flex items-center gap-4">
      <div className="relative">
        {preview ? (
          <span className="relative block h-20 w-20 overflow-hidden rounded-full shadow-card">
            <Image
              src={preview}
              alt=""
              width={80}
              height={80}
              className="h-full w-full object-cover"
            />
          </span>
        ) : (
          <Avatar name={name} size="lg" className="h-20 w-20 text-xl shadow-card" />
        )}
        {busy && (
          <span className="absolute inset-0 grid place-items-center rounded-full bg-neutral-900/45 font-mono text-[11px] text-white">
            saving…
          </span>
        )}
      </div>

      <div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={busy}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[15px] font-bold transition-all disabled:opacity-50",
              "bg-gradient-to-b from-rescued-400 to-rescued-600 text-white shadow-glow hover:-translate-y-0.5 hover:shadow-lift",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400 focus-visible:ring-offset-2 focus-visible:ring-offset-card"
            )}
          >
            <Camera /> {preview ? "Change photo" : "Add photo"}
          </button>
          {preview && (
            <button
              type="button"
              onClick={clear}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-2 text-[15px] font-semibold text-neutral-700 transition-colors hover:text-neutral-900 disabled:opacity-50"
            >
              <X /> Remove
            </button>
          )}
        </div>
        {error ? (
          <p className="mt-1.5 text-[14px] text-failed-800">{error}</p>
        ) : (
          <p className="mt-1.5 text-[14px] text-neutral-700">
            A square photo works best. jpg or png, up to 5 mb.
          </p>
        )}
      </div>

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        hidden
        onChange={onPick}
      />
    </div>
  );
}
